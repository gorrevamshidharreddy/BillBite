from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from sqlalchemy.orm import selectinload
from database import get_db
from auth import require_role, get_current_user
from schema_manager import (
    Tenant, Order, OrderItem, 
    LiquorProduct, LiquorTenantStock, PurchaseInvoice, PurchaseItem, StockTransaction,
    CashierAssignment, StockTransfer, DailyStockReconciliation, User, CashierExpense
)
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
import uuid
import io
import re
import pdfplumber
router = APIRouter(dependencies=[Depends(require_role(["cashier", "owner"]))])

# ---------------------------
# Helper functions
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
    product_id: str
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

class ManualStockEntry(BaseModel):
    product_id: str
    cases: int = 0
    loose_bottles: int = 0

class ReconciliationItem(BaseModel):
    product_id: str
    receipts_cases: int
    receipts_loose: int
    closing_stock_physical: int

class ReconciliationPayload(BaseModel):
    date: str
    location: str                # 'shop' or 'mart'
    items: List[ReconciliationItem]
    cash_total: float
    upi_total: float
    card_total: float
    notes: Optional[str] = None

class CashierExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    bill_photo_url: Optional[str] = None

# ========================
# Cashier assignments
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

@router.post("/orders")
async def create_order(
    data: CreateOrder,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    
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
        product = await db.get(LiquorProduct, item_data.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"Product not found")
        
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
            product_id=item_data.product_id,
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
    
    items_result = await db.execute(
        select(OrderItem, LiquorProduct.brand_name, LiquorProduct.size_code, LiquorProduct.size_ml, LiquorProduct.pack_qty)
        .join(LiquorProduct, OrderItem.product_id == LiquorProduct.id)
        .where(OrderItem.order_id == order.id)
    )
    items = []
    for oi, brand_name, size_code, size_ml, pack_qty in items_result:
        items.append({
            "product_id": oi.product_id,
            "name": brand_name,
            "size_code": size_code,
            "size_ml": size_ml,
            "pack_qty": pack_qty,
            "quantity": oi.quantity,
            "unit_price": oi.unit_price,
            "cost_price": oi.cost_price,
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
            menu_item_id=item_data.product_id,
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

# --- BRAND SEARCH (no assignment requirement) ---
@router.get("/liquor/search-brand")
async def search_brand(
    q: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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

# --- SIZES (support show_all for manual stock) ---
@router.get("/liquor/sizes/{brand_code}")
async def get_sizes_for_brand(
    brand_code: str,
    location: str = Query("shop", description="'shop' or 'mart'"),
    show_all: bool = Query(False, description="If true, show all products regardless of stock"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    # Get all products for this brand
    stmt = select(LiquorProduct).where(LiquorProduct.brand_code == brand_code)
    result = await db.execute(stmt)
    products = result.scalars().all()
    if not products:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    product_ids = [p.id for p in products]
    stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.location == location,
        LiquorTenantStock.product_id.in_(product_ids)
    )
    if not show_all:
        stock_stmt = stock_stmt.where(LiquorTenantStock.current_stock > 0)
    
    stock_result = await db.execute(stock_stmt)
    stock_map = {s.product_id: s.current_stock for s in stock_result.scalars().all()}
    
    result_list = []
    for p in products:
        if show_all or (p.id in stock_map):
            result_list.append({
                "product_id": p.id,
                "size_code": p.size_code,
                "size_ml": p.size_ml,
                "mrp": p.mrp,
                "current_stock": stock_map.get(p.id, 0),
                "unit_cost": p.unit_cost,
                "pack_qty": p.pack_qty,
                "brand_name": p.brand_name,
            })
    return result_list

# --- DAILY STOCK (supports both shop and mart, uses saved reconciliation) ---
@router.get("/liquor/daily-stock")
async def daily_stock(
    target_date: Optional[str] = None,
    location: str = Query("shop", description="'shop' or 'mart'"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    dt = datetime.fromisoformat(target_date).date() if target_date else date.today()
    
    # Get saved reconciliation for this date and location (if any)
    saved_stmt = select(DailyStockReconciliation).where(
        DailyStockReconciliation.tenant_id == tenant_id,
        func.date(DailyStockReconciliation.reconciliation_date) == dt,
        DailyStockReconciliation.location == location
    )
    saved_result = await db.execute(saved_stmt)
    saved_recs = {r.product_id: r for r in saved_result.scalars().all()}
    
    # Get all products that have current stock > 0 for the given location
    stock_stmt = select(LiquorTenantStock).where(
        LiquorTenantStock.tenant_id == tenant_id,
        LiquorTenantStock.location == location,
        LiquorTenantStock.current_stock > 0
    )
    stock_result = await db.execute(stock_stmt)
    tenant_stocks = stock_result.scalars().all()
    
    if not tenant_stocks:
        return []
    
    product_ids = [ts.product_id for ts in tenant_stocks]
    prod_stmt = select(LiquorProduct).where(LiquorProduct.id.in_(product_ids))
    prod_result = await db.execute(prod_stmt)
    products = {p.id: p for p in prod_result.scalars().all()}
    
    response = []
    for ts in tenant_stocks:
        prod = products.get(ts.product_id)
        if not prod:
            continue
        
        if location == "shop":
            # Opening = total received before dt - transfers out before dt
            total_received_before = (await db.execute(
                select(func.coalesce(func.sum(StockTransaction.total_bottles_added), 0))
                .where(StockTransaction.product_id == prod.id, StockTransaction.tenant_id == tenant_id,
                       StockTransaction.location == "shop", StockTransaction.date < dt)
            )).scalar() or 0
            total_transferred_out_before = (await db.execute(
                select(func.coalesce(func.sum(StockTransfer.total_bottles), 0))
                .where(StockTransfer.from_product_id == prod.id, StockTransfer.tenant_id == tenant_id,
                       StockTransfer.transfer_date < dt)
            )).scalar() or 0
            opening = total_received_before - total_transferred_out_before
            
            # Receipts on the day
            rec_data = await db.execute(
                select(func.coalesce(func.sum(StockTransaction.cases_received), 0),
                       func.coalesce(func.sum(StockTransaction.loose_received), 0),
                       func.coalesce(func.sum(StockTransaction.total_bottles_added), 0))
                .where(StockTransaction.product_id == prod.id, StockTransaction.tenant_id == tenant_id,
                       StockTransaction.location == "shop", func.date(StockTransaction.date) == dt)
            )
            cases_rec, loose_rec, total_rec = rec_data.one()
            
            # Transfers out on the day
            transfers_out = (await db.execute(
                select(func.coalesce(func.sum(StockTransfer.total_bottles), 0))
                .where(StockTransfer.from_product_id == prod.id, StockTransfer.tenant_id == tenant_id,
                       func.date(StockTransfer.transfer_date) == dt)
            )).scalar() or 0
            
            sale_bottles = transfers_out
            sale_amount = 0.0
            calculated_closing = opening + total_rec - transfers_out
            
            # Use saved closing if exists, else calculated
            if prod.id in saved_recs:
                closing = saved_recs[prod.id].closing_stock_physical
            else:
                closing = calculated_closing
            
            response.append({
                "product_id": prod.id,
                "brand_code": prod.brand_code,
                "brand_name": prod.brand_name,
                "size_ml": prod.size_ml,
                "pack_qty": prod.pack_qty,
                "opening_stock": opening,
                "receipts_cases": cases_rec,
                "receipts_loose": loose_rec,
                "total_receipts": total_rec,
                "transfers_out": transfers_out,
                "sale_bottles": sale_bottles,
                "closing_stock": closing,
                "mrp": prod.mrp,
                "sale_amount": sale_amount,
            })
        else:
            # Mart location (simplified – you can extend similarly if needed)
            response.append({
                "product_id": prod.id,
                "brand_code": prod.brand_code,
                "brand_name": prod.brand_name,
                "size_ml": prod.size_ml,
                "pack_qty": prod.pack_qty,
                "opening_stock": 0,
                "receipts_cases": 0,
                "receipts_loose": 0,
                "total_receipts": 0,
                "transfers_in": 0,
                "sale_bottles": 0,
                "closing_stock": ts.current_stock,
                "mrp": prod.mrp,
                "sale_amount": 0,
            })
    
    return response

# --- Load saved reconciliation for a date (requires location) ---
@router.get("/daily-stock/reconciliation")
async def get_daily_stock_reconciliation(
    date: str = Query(..., description="YYYY-MM-DD"),
    location: str = Query(..., description="'shop' or 'mart'"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    target_date = datetime.fromisoformat(date).date()
    
    stmt = select(DailyStockReconciliation).where(
        DailyStockReconciliation.tenant_id == tenant_id,
        func.date(DailyStockReconciliation.reconciliation_date) == target_date,
        DailyStockReconciliation.location == location
    )
    result = await db.execute(stmt)
    reconciliations = result.scalars().all()
    
    if not reconciliations:
        return {"items": [], "cash_total": 0, "upi_total": 0, "card_total": 0}
    
    items = []
    cash_total = upi_total = card_total = 0
    for rec in reconciliations:
        items.append({
            "product_id": rec.product_id,
            "receipts_cases": rec.receipts_cases,
            "receipts_loose": rec.receipts_loose,
            "closing_stock_physical": rec.closing_stock_physical,
        })
        cash_total = rec.cash_total
        upi_total = rec.upi_total
        card_total = rec.card_total
    return {"items": items, "cash_total": cash_total, "upi_total": upi_total, "card_total": card_total}

# --- Save or update daily stock reconciliation (uses payload.location) ---
@router.post("/daily-stock/reconcile")
async def save_daily_stock_reconciliation(
    payload: ReconciliationPayload,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    target_date = datetime.fromisoformat(payload.date).date()
    
    # Delete existing entries for this date and location
    await db.execute(
        delete(DailyStockReconciliation).where(
            DailyStockReconciliation.tenant_id == tenant_id,
            func.date(DailyStockReconciliation.reconciliation_date) == target_date,
            DailyStockReconciliation.location == payload.location
        )
    )
    
    # Insert new rows
    for item in payload.items:
        rec = DailyStockReconciliation(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            reconciliation_date=datetime.combine(target_date, datetime.min.time()),
            product_id=item.product_id,
            location=payload.location,
            receipts_cases=item.receipts_cases,
            receipts_loose=item.receipts_loose,
            closing_stock_physical=item.closing_stock_physical,
            cash_total=payload.cash_total,
            upi_total=payload.upi_total,
            card_total=payload.card_total,
            notes=payload.notes,
            submitted_by=cashier_id,
            submitted_at=datetime.utcnow()
        )
        db.add(rec)
    
    await db.commit()
    return {"message": "Reconciliation saved"}

# --- Stock Transfer (shop to mart) – requires shop assignment ---
@router.post("/stock-transfer")
async def transfer_stock_to_mart(
    data: StockTransferRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    
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
    
    # Check shop stock
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
    
    # Increase mart stock
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
    
    # Log transfer
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

# ---------- PDF extraction helper (PASTE YOUR ACTUAL EXTRACTION LOGIC HERE) ----------
def extract_icdc_data(pdf_bytes: bytes) -> dict:
    # ⚠️ REPLACE THIS WITH YOUR ACTUAL EXTRACTION LOGIC
    result = {"lines": [], "cess": 0.0, "tcs": 0.0, "invoice_number": "", "invoice_date": ""}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = ""
        all_tables = []
        for page in pdf.pages:
            full_text += page.extract_text() + "\n"
            tables = page.extract_tables()
            if tables:
                all_tables.extend(tables)
    # TODO: your parsing code here
    return result

# ---------- Preview invoice (shop assignment) ----------
@router.post("/liquor/upload-invoice/preview")
async def preview_invoice(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
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

# ---------- Confirm invoice (add to SHOP) ----------
@router.post("/liquor/upload-invoice/confirm")
async def confirm_invoice(
    payload: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
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

        product.unit_cost = line["unit_price"]

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
@router.post("/liquor/add-stock-manual")
async def add_stock_manual(
    data: ManualStockEntry,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_shop_assignment(current_user, db)
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

# ========================
# Cashier Expenses (Petty Cash)
# ========================
@router.get("/expenditure")
async def get_cashier_expenses(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    stmt = select(CashierExpense).where(CashierExpense.tenant_id == tenant_id).order_by(CashierExpense.date.desc())
    result = await db.execute(stmt)
    expenses = result.scalars().all()
    output = []
    for exp in expenses:
        cashier = await db.get(User, exp.cashier_id)
        output.append({
            "id": exp.id,
            "date": exp.date.isoformat(),
            "description": exp.description,
            "amount": exp.amount,
            "category": exp.category,
            "bill_photo_url": exp.bill_photo_url,
            "cashier_name": cashier.full_name if cashier else "Unknown"
        })
    return output

@router.post("/expenditure")
async def create_cashier_expense(
    data: CashierExpenseCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    cashier_id = current_user["user_id"]
    expense = CashierExpense(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        cashier_id=cashier_id,
        description=data.description,
        amount=data.amount,
        category=data.category,
        bill_photo_url=data.bill_photo_url,
        date=datetime.utcnow()
    )
    db.add(expense)
    await db.commit()
    return {"id": expense.id, "message": "Expense recorded"}