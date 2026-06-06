from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from database import get_db
from auth import require_role, get_current_user
from schema_manager import (
    Tenant, MenuItem, Order, OrderItem, 
    LiquorProduct, LiquorTenantStock, PurchaseInvoice, PurchaseItem, StockTransaction,
    CashierAssignment, StockTransfer
)
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
import uuid
import io
import re
import pdfplumber

router = APIRouter(dependencies=[Depends(require_role("cashier"))])

# ---------------------------
# Helper to check cashier assignment
# ---------------------------
async def get_cashier_assignment(current_user: dict, db: AsyncSession):
    user_id = current_user["user_id"]
    tenant_id = current_user["tenant_id"]
    stmt = select(CashierAssignment).where(
        CashierAssignment.cashier_id == user_id,
        CashierAssignment.tenant_id == tenant_id
    )
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    if not assignment:
        return (False, False)
    return (assignment.assigned_to_shop, assignment.assigned_to_mart)

async def require_shop_assignment(current_user: dict, db: AsyncSession):
    assigned_shop, _ = await get_cashier_assignment(current_user, db)
    if not assigned_shop:
        raise HTTPException(status_code=403, detail="You are not assigned to the shop")

async def require_mart_assignment(current_user: dict, db: AsyncSession):
    _, assigned_mart = await get_cashier_assignment(current_user, db)
    if not assigned_mart:
        raise HTTPException(status_code=403, detail="You are not assigned to the mart")

# ---------------------------
# Pydantic Schemas
# ---------------------------
class OrderItemSchema(BaseModel):
    menu_item_id: str
    quantity: int
    unit_price: float

class CreateOrder(BaseModel):
    items: List[OrderItemSchema]
    payment_method: str
    status: str = "completed"

class UpdateOrder(BaseModel):
    items: List[OrderItemSchema]
    payment_method: Optional[str] = None
    status: Optional[str] = None

class StockTransferRequest(BaseModel):
    product_id: str
    cases: int = 0
    loose_bottles: int = 0
    notes: Optional[str] = None

# ========================
# Cashier's assignments endpoint
# ========================
@router.get("/my-assignments")
async def get_my_assignments(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    assigned_shop, assigned_mart = await get_cashier_assignment(current_user, db)
    return {
        "assigned_to_shop": assigned_shop,
        "assigned_to_mart": assigned_mart
    }

# ========================
# Restaurant Endpoints (require shop assignment)
# ========================
@router.get("/tenant-info")
async def get_tenant_info(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "name": tenant.name,
        "address": tenant.address,
        "phone": tenant.phone,
    }

@router.get("/menu")
async def get_menu(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.tenant_id == tenant_id,
            MenuItem.is_available == True
        )
    )
    items = result.scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "price": item.price,
            "item_type": item.item_type,
            "category_id": item.category_id,
        }
        for item in items
    ]

@router.post("/orders")
async def create_order(
    data: CreateOrder,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    business_type = current_user.get("business_type")

    if business_type == "restaurant":
        await require_shop_assignment(current_user, db)
        total = sum(item.unit_price * item.quantity for item in data.items)
        order = Order(
            tenant_id=tenant_id,
            cashier_id=cashier_id,
            total_amount=total,
            payment_method=data.payment_method if data.status == "completed" else "",
            status=data.status,
        )
        db.add(order)
        await db.flush()
        for item_data in data.items:
            order_item = OrderItem(
                order_id=order.id,
                menu_item_id=item_data.menu_item_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
            )
            db.add(order_item)
        await db.commit()
        return {
            "order_id": order.id,
            "total": total,
            "status": order.status,
            "token_number": order.id[:8],
        }
    
    else:  # liquor mart
        await require_mart_assignment(current_user, db)
        total = 0.0
        order = Order(
            tenant_id=tenant_id,
            cashier_id=cashier_id,
            total_amount=0,
            payment_method=data.payment_method if data.status == "completed" else "",
            status=data.status,
        )
        db.add(order)
        await db.flush()

        for item_data in data.items:
            product = await db.get(LiquorProduct, item_data.menu_item_id)
            if not product:
                raise HTTPException(status_code=400, detail=f"Product not found")
            
            # Deduct from mart stock (location='mart')
            stock_stmt = select(LiquorTenantStock).where(
                LiquorTenantStock.tenant_id == tenant_id,
                LiquorTenantStock.product_id == product.id,
                LiquorTenantStock.location == "mart"
            )
            tenant_stock = await db.execute(stock_stmt)
            tenant_stock = tenant_stock.scalar_one_or_none()
            
            if not tenant_stock or tenant_stock.current_stock < item_data.quantity:
                raise HTTPException(status_code=400, detail=f"Insufficient stock in mart for {product.brand_name}")
            
            tenant_stock.current_stock -= item_data.quantity
            
            line_total = item_data.unit_price * item_data.quantity
            total += line_total
            order_item = OrderItem(
                order_id=order.id,
                menu_item_id=item_data.menu_item_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                cost_price=product.unit_cost
            )
            db.add(order_item)
        
        order.total_amount = total
        await db.commit()
        return {
            "order_id": order.id,
            "total": total,
            "status": order.status,
            "token_number": order.id[:8],
        }

@router.get("/orders/hold")
async def get_hold_orders(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "hold"
        )
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    return [
        {
            "id": o.id,
            "total_amount": o.total_amount,
            "created_at": o.created_at.isoformat(),
            "items_count": len(o.items) if o.items else 0,
        }
        for o in orders
    ]

@router.get("/orders/history")
async def get_order_history(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(Order).where(Order.tenant_id == tenant_id, Order.status != "hold")
        .order_by(Order.created_at.desc()).limit(50)
    )
    orders = result.scalars().all()
    return [
        {
            "id": o.id,
            "total_amount": o.total_amount,
            "payment_method": o.payment_method,
            "created_at": o.created_at.isoformat(),
            "status": o.status,
        }
        for o in orders
    ]

@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    tenant = await db.get(Tenant, tenant_id)
    is_liquor = tenant and tenant.business_type == "liquor_mart"
    
    if is_liquor:
        items_result = await db.execute(
            select(OrderItem, LiquorProduct.brand_name, LiquorProduct.size_code, LiquorProduct.size_ml, LiquorProduct.pack_qty)
            .join(LiquorProduct, OrderItem.menu_item_id == LiquorProduct.id)
            .where(OrderItem.order_id == order.id)
        )
        items = []
        for oi, brand_name, size_code, size_ml, pack_qty in items_result:
            items.append({
                "menu_item_id": oi.menu_item_id,
                "name": brand_name,
                "size_code": size_code,
                "size_ml": size_ml,
                "pack_qty": pack_qty,
                "quantity": oi.quantity,
                "unit_price": oi.unit_price,
                "cost_price": oi.cost_price,
            })
    else:
        items_result = await db.execute(
            select(OrderItem, MenuItem.name)
            .join(MenuItem, OrderItem.menu_item_id == MenuItem.id)
            .where(OrderItem.order_id == order.id)
        )
        items = []
        for oi, name in items_result:
            items.append({
                "menu_item_id": oi.menu_item_id,
                "name": name,
                "quantity": oi.quantity,
                "unit_price": oi.unit_price,
            })
    
    return {
        "id": order.id,
        "total_amount": order.total_amount,
        "payment_method": order.payment_method,
        "status": order.status,
        "items": items,
        "token_number": order.id[:8],
        "created_at": order.created_at.isoformat(),
    }

@router.put("/orders/{order_id}")
async def update_order(
    order_id: str,
    data: UpdateOrder,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    existing_items = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    for item in existing_items.scalars():
        await db.delete(item)

    total = 0.0
    for item_data in data.items:
        new_item = OrderItem(
            order_id=order.id,
            menu_item_id=item_data.menu_item_id,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
        )
        total += item_data.unit_price * item_data.quantity
        db.add(new_item)

    order.total_amount = total
    if data.payment_method:
        order.payment_method = data.payment_method
    if data.status:
        order.status = data.status
    else:
        order.status = "completed"

    await db.commit()
    return {"message": "Order updated", "token_number": order.id[:8]}

@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.delete(order)
    await db.commit()
    return {"message": "Order deleted"}

# ========================
# LIQUOR MART ENDPOINTS
# ========================

# ---------- Product search (global) – requires mart assignment ----------
@router.get("/liquor/search-brand")
async def search_brand(
    q: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_mart_assignment(current_user, db)
    stmt = select(LiquorProduct).where(
        (LiquorProduct.brand_name.ilike(f"%{q}%")) | (LiquorProduct.brand_code.ilike(f"%{q}%"))
    ).distinct(LiquorProduct.brand_code, LiquorProduct.brand_name)
    result = await db.execute(stmt)
    products = result.scalars().all()
    unique_brands = {}
    for p in products:
        key = (p.brand_code, p.brand_name)
        if key not in unique_brands:
            unique_brands[key] = {"brand_code": p.brand_code, "brand_name": p.brand_name}
    return list(unique_brands.values())

@router.get("/liquor/sizes/{brand_code}")
async def get_sizes_for_brand(
    brand_code: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_mart_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    stmt = select(LiquorProduct).where(LiquorProduct.brand_code == brand_code)
    result = await db.execute(stmt)
    products = result.scalars().all()
    if not products:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    product_ids = [p.id for p in products]
    stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.location == "mart",
        LiquorTenantStock.product_id.in_(product_ids)
    )
    stock_result = await db.execute(stock_stmt)
    stock_map = {s.product_id: s.current_stock for s in stock_result.scalars().all()}
    
    return [{
        "product_id": p.id,
        "size_code": p.size_code,
        "size_ml": p.size_ml,
        "mrp": p.mrp,
        "current_stock": stock_map.get(p.id, 0),
        "unit_cost": p.unit_cost,
        "pack_qty": p.pack_qty
    } for p in products]

# ---------- Daily stock with transfer columns (requires mart assignment) ----------
@router.get("/liquor/daily-stock")
async def daily_stock(
    target_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_mart_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    dt = datetime.fromisoformat(target_date).date() if target_date else date.today()
    start_dt = datetime.combine(dt, datetime.min.time())
    end_dt = datetime.combine(dt, datetime.max.time())
    
    # Get all products that have any stock for this tenant (shop or mart)
    product_stmt = select(LiquorProduct).join(
        LiquorTenantStock, LiquorTenantStock.product_id == LiquorProduct.id
    ).where(LiquorTenantStock.tenant_id == tenant_id).distinct()
    result = await db.execute(product_stmt)
    products = result.scalars().all()
    
    statement = []
    for prod in products:
        # 1. Opening stock for mart (from stock_transactions with location='mart')
        add_before_mart = await db.execute(
            select(func.sum(StockTransaction.total_bottles_added))
            .where(
                StockTransaction.product_id == prod.id,
                StockTransaction.tenant_id == tenant_id,
                StockTransaction.location == "mart",
                StockTransaction.date < dt
            )
        )
        total_added_before_mart = add_before_mart.scalar() or 0
        
        sales_before_mart = await db.execute(
            select(func.sum(OrderItem.quantity))
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.status == "completed",
                Order.created_at < dt,
                OrderItem.menu_item_id == prod.id
            )
        )
        total_sold_before_mart = sales_before_mart.scalar() or 0
        
        opening_mart = total_added_before_mart - total_sold_before_mart
        
        # 2. Receipts (from stock transactions) for mart on the day
        receipts = await db.execute(
            select(
                func.sum(StockTransaction.cases_received).label('cases'),
                func.sum(StockTransaction.loose_received).label('loose'),
                func.sum(StockTransaction.total_bottles_added).label('total')
            ).where(
                StockTransaction.product_id == prod.id,
                StockTransaction.tenant_id == tenant_id,
                StockTransaction.location == "mart",
                func.date(StockTransaction.date) == dt
            )
        )
        rec = receipts.one()
        cases_rec = rec.cases or 0
        loose_rec = rec.loose or 0
        total_rec = rec.total or 0
        
        # 3. Transfers received from shop on the day (into mart)
        transfers_received = await db.execute(
            select(func.sum(StockTransfer.total_bottles))
            .where(
                StockTransfer.to_product_id == prod.id,
                StockTransfer.tenant_id == tenant_id,
                func.date(StockTransfer.transfer_date) == dt
            )
        )
        total_transfers_received = transfers_received.scalar() or 0
        
        # 4. Sales (from orders) for mart on the day
        sales_day = await db.execute(
            select(func.sum(OrderItem.quantity))
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.status == "completed",
                func.date(Order.created_at) == dt,
                OrderItem.menu_item_id == prod.id
            )
        )
        sale_bottles = sales_day.scalar() or 0
        
        # 5. Sale amount
        revenue_day = await db.execute(
            select(func.sum(OrderItem.unit_price * OrderItem.quantity))
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.status == "completed",
                func.date(Order.created_at) == dt,
                OrderItem.menu_item_id == prod.id
            )
        )
        sale_amount = revenue_day.scalar() or 0.0
        
        # Closing stock for mart = opening + receipts + transfers_received - sales
        closing_mart = opening_mart + total_rec + total_transfers_received - sale_bottles
        
        statement.append({
            "product_id": prod.id,
            "brand_code": prod.brand_code,
            "size_code": prod.size_code,
            "brand_name": prod.brand_name,
            "size_ml": prod.size_ml,
            "opening_stock": opening_mart,
            "receipts_cases": cases_rec,
            "receipts_loose": loose_rec,
            "total_receipts": total_rec,
            "transfers_received": total_transfers_received,
            "sale_bottles": sale_bottles,
            "closing_stock": closing_mart,
            "mrp": prod.mrp,
            "sale_amount": sale_amount
        })
    return statement

# ---------- Stock Transfer (shop to mart) – requires shop assignment ----------
@router.post("/stock-transfer")
async def transfer_stock_to_mart(
    data: StockTransferRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    
    # Check if tenant has a mart
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or not tenant.has_mart or not tenant.mart_approved:
        raise HTTPException(status_code=400, detail="This shop does not have an approved mart")
    
    product = await db.get(LiquorProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if data.cases < 0 or data.loose_bottles < 0:
        raise HTTPException(status_code=400, detail="Quantities cannot be negative")
    
    pack_qty = product.pack_qty
    total_bottles = (data.cases * pack_qty) + data.loose_bottles
    if total_bottles == 0:
        raise HTTPException(status_code=400, detail="Must transfer at least one bottle")
    
    # Check shop stock availability (location='shop')
    shop_stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.product_id == product.id,
        LiquorTenantStock.location == "shop"
    )
    shop_stock = await db.execute(shop_stock_stmt)
    shop_stock = shop_stock.scalar_one_or_none()
    if not shop_stock or shop_stock.current_stock < total_bottles:
        raise HTTPException(status_code=400, detail=f"Insufficient stock in shop. Available: {shop_stock.current_stock if shop_stock else 0}")
    
    # Decrease shop stock
    shop_stock.current_stock -= total_bottles
    
    # Increase mart stock (create if not exists)
    mart_stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.product_id == product.id,
        LiquorTenantStock.location == "mart"
    )
    mart_stock = await db.execute(mart_stock_stmt)
    mart_stock = mart_stock.scalar_one_or_none()
    if mart_stock:
        mart_stock.current_stock += total_bottles
    else:
        mart_stock = LiquorTenantStock(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            product_id=product.id,
            location="mart",
            current_stock=total_bottles,
            low_stock_threshold=5
        )
        db.add(mart_stock)
    
    # Record the transfer
    transfer = StockTransfer(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        from_product_id=product.id,
        to_product_id=product.id,
        transfer_date=datetime.utcnow(),
        cases=data.cases,
        loose_bottles=data.loose_bottles,
        pack_qty_at_time=pack_qty,
        total_bottles=total_bottles,
        transferred_by=cashier_id,
        notes=data.notes
    )
    db.add(transfer)
    
    await db.commit()
    return {
        "message": f"Transferred {total_bottles} bottles of {product.brand_name} to mart",
        "product": product.brand_name,
        "total_bottles": total_bottles,
        "shop_remaining_stock": shop_stock.current_stock,
        "mart_new_stock": mart_stock.current_stock
    }

# ---------- PDF extraction helper (unchanged) ----------
def extract_icdc_data(pdf_bytes: bytes) -> dict:
    result = {"lines": [], "cess": 0.0, "tcs": 0.0, "invoice_number": "", "invoice_date": ""}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = ""
        all_tables = []
        for page in pdf.pages:
            full_text += page.extract_text() + "\n"
            tables = page.extract_tables()
            if tables:
                all_tables.extend(tables)
    # ... (same extraction logic as before, no changes)
    # (For brevity, I'm not repeating the entire function; keep your existing one)
    # The function must remain identical to the original.
    return result

# ---------- Preview invoice (requires shop assignment) ----------
@router.post("/liquor/upload-invoice/preview")
async def preview_invoice(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)  # changed from mart to shop
    content = await file.read()
    extracted = extract_icdc_data(content)
    for line in extracted["lines"]:
        stmt = select(LiquorProduct).where(
            LiquorProduct.brand_code == line["brand_code"],
            LiquorProduct.size_ml == line["size_ml"],
            LiquorProduct.pack_qty == line["pack_qty"]
        )
        res = await db.execute(stmt)
        line["is_new"] = res.scalar_one_or_none() is None
        if "loose" not in line:
            line["loose"] = 0
    total_bottles = sum((line["cases"] * line["pack_qty"]) + line.get("loose", 0) for line in extracted["lines"])
    new_products_count = sum(1 for line in extracted["lines"] if line.get("is_new", False))
    return {
        "items": extracted["lines"],
        "total_bottles": total_bottles,
        "new_products_count": new_products_count,
        "invoice_number": extracted["invoice_number"],
        "invoice_date": extracted["invoice_date"],
        "cess": extracted["cess"],
        "tcs": extracted["tcs"]
    }

# ---------- Confirm invoice (add stock to SHOP location) ----------
@router.post("/liquor/upload-invoice/confirm")
async def confirm_invoice(
    payload: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)  # changed from mart to shop
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]

    invoice = PurchaseInvoice(
        id=str(uuid.uuid4()), tenant_id=tenant_id,
        invoice_number=payload.get("invoice_number", ""),
        invoice_date=datetime.fromisoformat(payload["invoice_date"]) if payload.get("invoice_date") else datetime.utcnow(),
        total_cess=payload.get("cess", 0.0), total_tcs=payload.get("tcs", 0.0),
        cashier_id=cashier_id
    )
    db.add(invoice)
    await db.flush()

    for line in payload["items"]:
        stmt = select(LiquorProduct).where(
            LiquorProduct.brand_code == line["brand_code"],
            LiquorProduct.size_ml == line["size_ml"],
            LiquorProduct.pack_qty == line["pack_qty"]
        )
        res = await db.execute(stmt)
        product = res.scalar_one_or_none()
        if not product:
            product = LiquorProduct(
                id=str(uuid.uuid4()),
                brand_code=line["brand_code"],
                size_code="",
                size_ml=line["size_ml"],
                brand_name=line["brand_name"],
                pack_qty=line["pack_qty"],
                mrp=0.0,
                unit_cost=line["unit_price"],
                product_type="UNKNOWN"
            )
            db.add(product)
            await db.flush()

        total_bottles = (line["cases"] * line["pack_qty"]) + line.get("loose", 0)
        purchase_item = PurchaseItem(
            id=str(uuid.uuid4()), invoice_id=invoice.id, product_id=product.id,
            cases_received=line["cases"], loose_bottles=line.get("loose", 0),
            pack_qty_at_time=line["pack_qty"], unit_cost=line["unit_price"],
            total_bottles=total_bottles
        )
        db.add(purchase_item)

        # Update SHOP stock (location='shop')
        shop_stock_stmt = select(LiquorTenantStock).where(
            LiquorTenantStock.tenant_id == tenant_id,
            LiquorTenantStock.product_id == product.id,
            LiquorTenantStock.location == "shop"
        )
        shop_stock = await db.execute(shop_stock_stmt)
        shop_stock = shop_stock.scalar_one_or_none()
        if shop_stock:
            shop_stock.current_stock += total_bottles
        else:
            shop_stock = LiquorTenantStock(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                product_id=product.id,
                location="shop",
                current_stock=total_bottles,
                low_stock_threshold=5
            )
            db.add(shop_stock)

        # Update global product's unit cost
        product.unit_cost = line["unit_price"]

        # Log stock transaction for shop
        trans = StockTransaction(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            product_id=product.id,
            location="shop",
            date=datetime.utcnow(),
            cases_received=line["cases"],
            loose_received=line.get("loose", 0),
            total_bottles_added=total_bottles,
            invoice_id=invoice.id,
            unit_cost=line["unit_price"],
            verified=False
        )
        db.add(trans)

    await db.commit()
    return {"message": "Stock added to shop successfully", "total_bottles": sum((l["cases"] * l["pack_qty"]) + l.get("loose", 0) for l in payload["items"])}

# ---------- Manual Stock Entry (add to SHOP) ----------
class ManualStockEntry(BaseModel):
    product_id: str
    cases: int = 0
    loose_bottles: int = 0

@router.post("/liquor/add-stock-manual")
async def add_stock_manual(
    data: ManualStockEntry,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)  # changed from mart to shop
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    
    product = await db.get(LiquorProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if data.cases < 0 or data.loose_bottles < 0:
        raise HTTPException(status_code=400, detail="Quantities cannot be negative")
    
    pack_qty = product.pack_qty
    total_bottles = (data.cases * pack_qty) + data.loose_bottles
    if total_bottles == 0:
        raise HTTPException(status_code=400, detail="Add at least one bottle")
    
    invoice = PurchaseInvoice(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        invoice_number=f"MANUAL-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        invoice_date=datetime.utcnow(),
        total_cess=0.0,
        total_tcs=0.0,
        cashier_id=cashier_id
    )
    db.add(invoice)
    await db.flush()
    
    purchase_item = PurchaseItem(
        id=str(uuid.uuid4()),
        invoice_id=invoice.id,
        product_id=product.id,
        cases_received=data.cases,
        loose_bottles=data.loose_bottles,
        pack_qty_at_time=pack_qty,
        unit_cost=product.unit_cost,
        total_bottles=total_bottles
    )
    db.add(purchase_item)
    
    # Update SHOP stock
    shop_stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.product_id == product.id,
        LiquorTenantStock.location == "shop"
    )
    shop_stock = await db.execute(shop_stock_stmt)
    shop_stock = shop_stock.scalar_one_or_none()
    if shop_stock:
        shop_stock.current_stock += total_bottles
    else:
        shop_stock = LiquorTenantStock(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            product_id=product.id,
            location="shop",
            current_stock=total_bottles,
            low_stock_threshold=5
        )
        db.add(shop_stock)
    
    trans = StockTransaction(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        product_id=product.id,
        location="shop",
        date=datetime.utcnow(),
        cases_received=data.cases,
        loose_received=data.loose_bottles,
        total_bottles_added=total_bottles,
        invoice_id=invoice.id,
        unit_cost=product.unit_cost,
        verified=True
    )
    db.add(trans)
    
    await db.commit()
    return {
        "message": f"Added {total_bottles} bottles to shop stock for {product.brand_name}",
        "product": product.brand_name,
        "total_bottles": total_bottles,
        "new_stock": shop_stock.current_stock
    }