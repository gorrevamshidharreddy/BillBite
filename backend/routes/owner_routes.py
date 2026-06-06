from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from database import get_db
from auth import get_current_owner, hash_password
from schema_manager import (
    MenuItem, Category, PackagedStock, StockMovement,
    RawMaterialExpense, OtherExpense, User, Order, OrderItem,
    LiquorProduct, LiquorTenantStock, PurchaseInvoice, PurchaseItem, StockTransaction,
    Tenant, CoOwnerPermission, CashierAssignment, MartRequest,
    DailyStockReconciliation, CashierExpense, StockTransfer
)
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date, timedelta

router = APIRouter()

# ---------------------------
# Pydantic Schemas
# ---------------------------
class MenuItemCreate(BaseModel):
    name: str
    price: float
    item_type: str   # 'packaged' or 'prepared'
    category_id: Optional[str] = None

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    item_type: Optional[str] = None
    category_id: Optional[str] = None
    is_available: Optional[bool] = None

class CategoryCreate(BaseModel):
    name: str

class StockAdd(BaseModel):
    menu_item_id: str
    quantity: int

class StockAdjust(BaseModel):
    menu_item_id: str
    quantity_change: int

class RawExpenseCreate(BaseModel):
    item_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    amount: float
    vendor: Optional[str] = None
    date: Optional[str] = None
    photo_url: Optional[str] = None

class OtherExpenseCreate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = None
    date: Optional[str] = None

class StaffCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    phone: Optional[str] = None   # added phone

class StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None

# NEW Schemas
class CoOwnerCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    phone: Optional[str] = None
    permissions: dict  # {"manage_stock": bool, ...}

class CoOwnerUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    permissions: Optional[dict] = None

class CashierAssignmentCreate(BaseModel):
    cashier_id: str
    assigned_to_shop: bool = True
    assigned_to_mart: bool = False

class CashierAssignmentUpdate(BaseModel):
    assigned_to_shop: Optional[bool] = None
    assigned_to_mart: Optional[bool] = None

class MartRequestCreate(BaseModel):
    mart_name: str
    mart_address: str

# ---------------------------
# Menu Endpoints (unchanged)
# ---------------------------
@router.get("/menu")
async def get_menu(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(MenuItem).where(MenuItem.tenant_id == tenant_id)
    )
    items = result.scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "price": item.price,
            "item_type": item.item_type,
            "category_id": item.category_id,
            "is_available": item.is_available,
        }
        for item in items
    ]

@router.post("/menu/items")
async def create_menu_item(data: MenuItemCreate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    item = MenuItem(
        tenant_id=tenant_id,
        name=data.name,
        price=data.price,
        item_type=data.item_type,
        category_id=data.category_id,
    )
    db.add(item)
    await db.commit()
    return {"id": item.id, "name": item.name}

@router.put("/menu/items/{item_id}")
async def update_menu_item(item_id: str, data: MenuItemUpdate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.tenant_id == tenant_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    await db.commit()
    return {"message": "Item updated"}

@router.delete("/menu/items/{item_id}")
async def delete_menu_item(item_id: str, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.tenant_id == tenant_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"message": "Item deleted"}

@router.get("/menu/categories")
async def get_categories(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(select(Category).where(Category.tenant_id == tenant_id))
    categories = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in categories]

@router.post("/menu/categories")
async def create_category(data: CategoryCreate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    category = Category(name=data.name, tenant_id=tenant_id)
    db.add(category)
    await db.commit()
    return {"id": category.id, "name": category.name}

# ---------------------------
# Packaged Stock Endpoints (unchanged)
# ---------------------------
@router.get("/stock")
async def get_stock(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(PackagedStock, MenuItem.name)
        .join(MenuItem, PackagedStock.menu_item_id == MenuItem.id)
        .where(PackagedStock.tenant_id == tenant_id)
    )
    rows = result.all()
    return [
        {
            "stock_id": row.PackagedStock.id,
            "menu_item_id": row.PackagedStock.menu_item_id,
            "item_name": row.name,
            "quantity_in_stock": row.PackagedStock.quantity_in_stock,
            "low_stock_threshold": row.PackagedStock.low_stock_threshold,
        }
        for row in rows
    ]

@router.post("/stock/add")
async def add_stock(data: StockAdd, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(PackagedStock).where(
            PackagedStock.menu_item_id == data.menu_item_id,
            PackagedStock.tenant_id == tenant_id
        )
    )
    stock = result.scalar_one_or_none()
    if not stock:
        menu_result = await db.execute(
            select(MenuItem).where(
                MenuItem.id == data.menu_item_id,
                MenuItem.tenant_id == tenant_id,
                MenuItem.item_type == "packaged"
            )
        )
        menu_item = menu_result.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=400, detail="Item not found or not a packaged item")
        stock = PackagedStock(
            tenant_id=tenant_id,
            menu_item_id=data.menu_item_id,
            quantity_in_stock=0
        )
        db.add(stock)
        await db.flush()
    stock.quantity_in_stock += data.quantity
    movement = StockMovement(
        tenant_id=tenant_id,
        packaged_stock_id=stock.id,
        movement_type="purchase",
        quantity_change=data.quantity,
    )
    db.add(movement)
    await db.commit()
    return {"message": "Stock updated", "current_quantity": stock.quantity_in_stock}

@router.post("/stock/adjust")
async def adjust_stock(data: StockAdjust, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(PackagedStock).where(
            PackagedStock.menu_item_id == data.menu_item_id,
            PackagedStock.tenant_id == tenant_id
        )
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    stock.quantity_in_stock += data.quantity_change
    movement = StockMovement(
        tenant_id=tenant_id,
        packaged_stock_id=stock.id,
        movement_type="adjustment",
        quantity_change=data.quantity_change,
    )
    db.add(movement)
    await db.commit()
    return {"message": "Stock adjusted", "current_quantity": stock.quantity_in_stock}

# ---------------------------
# Expense Endpoints (Raw Materials + Other) (unchanged)
# ---------------------------
@router.get("/expenses/raw")
async def get_raw_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = select(RawMaterialExpense).where(RawMaterialExpense.tenant_id == tenant_id)
    if start_date:
        query = query.where(RawMaterialExpense.date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(RawMaterialExpense.date <= datetime.fromisoformat(end_date))
    result = await db.execute(query.order_by(RawMaterialExpense.date.desc()))
    expenses = result.scalars().all()
    return [
        {
            "id": e.id,
            "item_name": e.item_name,
            "quantity": e.quantity,
            "unit": e.unit,
            "amount": e.amount,
            "vendor": e.vendor,
            "date": e.date.isoformat() if e.date else None,
        }
        for e in expenses
    ]

@router.post("/expenses/raw")
async def create_raw_expense(data: RawExpenseCreate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    expense = RawMaterialExpense(
        tenant_id=tenant_id,
        item_name=data.item_name,
        quantity=data.quantity,
        unit=data.unit,
        amount=data.amount,
        vendor=data.vendor,
        date=datetime.fromisoformat(data.date) if data.date else datetime.utcnow(),
        photo_url=data.photo_url,
    )
    db.add(expense)
    await db.commit()
    return {"id": expense.id}

@router.get("/expenses/other")
async def get_other_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = select(OtherExpense).where(OtherExpense.tenant_id == tenant_id)
    if start_date:
        query = query.where(OtherExpense.date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(OtherExpense.date <= datetime.fromisoformat(end_date))
    result = await db.execute(query.order_by(OtherExpense.date.desc()))
    expenses = result.scalars().all()
    return [
        {
            "id": e.id,
            "category": e.category,
            "description": e.description,
            "amount": e.amount,
            "date": e.date.isoformat() if e.date else None,
        }
        for e in expenses
    ]

@router.post("/expenses/other")
async def create_other_expense(data: OtherExpenseCreate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    expense = OtherExpense(
        tenant_id=tenant_id,
        category=data.category,
        description=data.description,
        amount=data.amount,
        date=datetime.fromisoformat(data.date) if data.date else datetime.utcnow(),
    )
    db.add(expense)
    await db.commit()
    return {"id": expense.id}

# ---------------------------
# Staff Management (unchanged + phone)
# ---------------------------
@router.get("/staff")
async def get_staff(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.role == "cashier")
    )
    cashiers = result.scalars().all()
    return [
        {
            "id": c.id,
            "email": c.email,
            "full_name": c.full_name,
            "phone": c.phone,
            "is_active": c.is_active,
        }
        for c in cashiers
    ]

@router.post("/staff")
async def create_staff(data: StaffCreate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")
    cashier = User(
        tenant_id=tenant_id,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="cashier",
        full_name=data.full_name,
        phone=data.phone,
    )
    db.add(cashier)
    await db.commit()
    return {"id": cashier.id, "email": cashier.email}

@router.put("/staff/{user_id}")
async def update_staff(user_id: str, data: StaffUpdate, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role == "cashier"
        )
    )
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    if data.full_name is not None:
        cashier.full_name = data.full_name
    if data.password is not None:
        cashier.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        cashier.is_active = data.is_active
    if data.phone is not None:
        cashier.phone = data.phone
    await db.commit()
    return {"message": "Staff updated"}

@router.delete("/staff/{user_id}")
async def delete_staff(user_id: str, current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role == "cashier"
        )
    )
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    await db.delete(cashier)
    await db.commit()
    return {"message": "Staff deleted"}

# ---------------------------
# Reports (unchanged)
# ---------------------------
@router.get("/reports/sales")
async def sales_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = select(Order).where(Order.tenant_id == tenant_id)
    if start_date:
        query = query.where(Order.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(Order.created_at <= datetime.fromisoformat(end_date))
    result = await db.execute(query)
    orders = result.scalars().all()
    total_sales = sum(o.total_amount for o in orders)
    cash = sum(o.total_amount for o in orders if o.payment_method == "cash")
    upi = sum(o.total_amount for o in orders if o.payment_method == "upi")
    card = sum(o.total_amount for o in orders if o.payment_method == "card")
    return {
        "total_sales": total_sales,
        "order_count": len(orders),
        "payment_split": {
            "cash": cash,
            "upi": upi,
            "card": card,
        },
    }

@router.get("/reports/expenses")
async def expenses_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    raw_query = select(func.coalesce(func.sum(RawMaterialExpense.amount), 0)).where(RawMaterialExpense.tenant_id == tenant_id)
    other_query = select(func.coalesce(func.sum(OtherExpense.amount), 0)).where(OtherExpense.tenant_id == tenant_id)
    if start_date:
        raw_query = raw_query.where(RawMaterialExpense.date >= datetime.fromisoformat(start_date))
        other_query = other_query.where(OtherExpense.date >= datetime.fromisoformat(start_date))
    if end_date:
        raw_query = raw_query.where(RawMaterialExpense.date <= datetime.fromisoformat(end_date))
        other_query = other_query.where(OtherExpense.date <= datetime.fromisoformat(end_date))
    raw_total = await db.execute(raw_query)
    other_total = await db.execute(other_query)
    return {
        "raw_material_expenses": raw_total.scalar() or 0,
        "other_expenses": other_total.scalar() or 0,
    }

@router.get("/reports/profit")
async def profit_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    sales_query = select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.tenant_id == tenant_id)
    raw_query = select(func.coalesce(func.sum(RawMaterialExpense.amount), 0)).where(RawMaterialExpense.tenant_id == tenant_id)
    other_query = select(func.coalesce(func.sum(OtherExpense.amount), 0)).where(OtherExpense.tenant_id == tenant_id)

    if start_date:
        sales_query = sales_query.where(Order.created_at >= datetime.fromisoformat(start_date))
        raw_query = raw_query.where(RawMaterialExpense.date >= datetime.fromisoformat(start_date))
        other_query = other_query.where(OtherExpense.date >= datetime.fromisoformat(start_date))
    if end_date:
        sales_query = sales_query.where(Order.created_at <= datetime.fromisoformat(end_date))
        raw_query = raw_query.where(RawMaterialExpense.date <= datetime.fromisoformat(end_date))
        other_query = other_query.where(OtherExpense.date <= datetime.fromisoformat(end_date))

    total_sales = await db.execute(sales_query)
    total_raw = await db.execute(raw_query)
    total_other = await db.execute(other_query)

    sales_val = total_sales.scalar() or 0
    expenses_val = (total_raw.scalar() or 0) + (total_other.scalar() or 0)
    profit = sales_val - expenses_val
    return {
        "total_sales": sales_val,
        "total_expenses": expenses_val,
        "profit": profit,
    }

@router.get("/reports/item-sales")
async def item_sales_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = (
        select(
            MenuItem.name,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.unit_price * OrderItem.quantity).label("total_revenue")
        )
        .join(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.tenant_id == tenant_id, Order.status == "completed")
        .group_by(MenuItem.name)
        .order_by(func.sum(OrderItem.unit_price * OrderItem.quantity).desc())
    )
    if start_date:
        query = query.where(Order.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(Order.created_at <= datetime.fromisoformat(end_date))

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "item_name": row.name,
            "quantity_sold": int(row.total_quantity),
            "revenue": float(row.total_revenue),
        }
        for row in rows
    ]

# ======================== LIQUOR MART OWNER ENDPOINTS (UPDATED FOR LOCATION) ========================

@router.get("/liquor/stock-verification")
async def liquor_stock_verification(
    location: Optional[str] = Query(None, description="Filter by 'shop' or 'mart'. If omitted, returns both."),
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns current stock for the shop and/or mart separately.
    Each entry includes the location field.
    """
    tenant_id = current_owner["tenant_id"]
    stmt = (
        select(LiquorProduct, LiquorTenantStock.location, LiquorTenantStock.current_stock)
        .join(LiquorTenantStock, LiquorTenantStock.product_id == LiquorProduct.id)
        .where(LiquorTenantStock.tenant_id == tenant_id)
    )
    if location:
        if location not in ['shop', 'mart']:
            raise HTTPException(status_code=400, detail="location must be 'shop' or 'mart'")
        stmt = stmt.where(LiquorTenantStock.location == location)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "brand_code": prod.brand_code,
            "size_code": prod.size_code,
            "brand_name": prod.brand_name,
            "size_ml": prod.size_ml,
            "location": loc,
            "current_stock": stock,
            "unit_cost": prod.unit_cost,
            "mrp": prod.mrp,
            "stock_value": stock * prod.unit_cost,
        }
        for prod, loc, stock in rows
    ]

@router.get("/liquor/stock-transfer-history")
async def liquor_stock_transfer_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """List all stock transfers from shop to mart."""
    tenant_id = current_owner["tenant_id"]
    query = select(StockTransfer).where(StockTransfer.tenant_id == tenant_id)
    if start_date:
        query = query.where(StockTransfer.transfer_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(StockTransfer.transfer_date <= datetime.fromisoformat(end_date))
    query = query.order_by(StockTransfer.transfer_date.desc())
    result = await db.execute(query)
    transfers = result.scalars().all()
    output = []
    for t in transfers:
        product = await db.get(LiquorProduct, t.from_product_id)
        cashier = await db.get(User, t.transferred_by)
        output.append({
            "id": t.id,
            "product_name": product.brand_name if product else "Unknown",
            "size_ml": product.size_ml if product else 0,
            "size_code": product.size_code if product else "",
            "cases": t.cases,
            "loose_bottles": t.loose_bottles,
            "total_bottles": t.total_bottles,
            "transfer_date": t.transfer_date.isoformat(),
            "transferred_by": cashier.full_name if cashier else "Unknown",
            "notes": t.notes,
        })
    return output

@router.get("/liquor/profit-loss")
async def liquor_profit_loss(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """Profit & Loss using cost_price from OrderItem, cess/tcs from PurchaseInvoice, and other expenses."""
    tenant_id = current_owner["tenant_id"]
    start = datetime.fromisoformat(start_date) if start_date else datetime.min
    end = datetime.fromisoformat(end_date) if end_date else datetime.max

    revenue_stmt = (
        select(func.coalesce(func.sum(OrderItem.unit_price * OrderItem.quantity), 0))
        .select_from(OrderItem)
        .join(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "completed",
            Order.created_at.between(start, end),
            OrderItem.cost_price.isnot(None)
        )
    )
    total_revenue = (await db.execute(revenue_stmt)).scalar() or 0

    cogs_stmt = (
        select(func.coalesce(func.sum(OrderItem.cost_price * OrderItem.quantity), 0))
        .select_from(OrderItem)
        .join(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "completed",
            Order.created_at.between(start, end),
            OrderItem.cost_price.isnot(None)
        )
    )
    total_cogs = (await db.execute(cogs_stmt)).scalar() or 0

    cess_stmt = select(func.coalesce(func.sum(PurchaseInvoice.total_cess), 0)).where(
        PurchaseInvoice.tenant_id == tenant_id,
        PurchaseInvoice.invoice_date.between(start, end)
    )
    tcs_stmt = select(func.coalesce(func.sum(PurchaseInvoice.total_tcs), 0)).where(
        PurchaseInvoice.tenant_id == tenant_id,
        PurchaseInvoice.invoice_date.between(start, end)
    )
    total_cess = (await db.execute(cess_stmt)).scalar() or 0
    total_tcs = (await db.execute(tcs_stmt)).scalar() or 0

    raw_stmt = select(func.coalesce(func.sum(RawMaterialExpense.amount), 0)).where(
        RawMaterialExpense.tenant_id == tenant_id,
        RawMaterialExpense.date.between(start, end)
    )
    other_stmt = select(func.coalesce(func.sum(OtherExpense.amount), 0)).where(
        OtherExpense.tenant_id == tenant_id,
        OtherExpense.date.between(start, end)
    )
    raw_total = (await db.execute(raw_stmt)).scalar() or 0
    other_total = (await db.execute(other_stmt)).scalar() or 0
    total_other_expenses = raw_total + other_total

    gross_profit = total_revenue - (total_cogs + total_cess + total_tcs)
    net_profit = gross_profit - total_other_expenses

    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_revenue": total_revenue,
        "total_cogs": total_cogs,
        "total_cess": total_cess,
        "total_tcs": total_tcs,
        "gross_profit": gross_profit,
        "other_expenses": total_other_expenses,
        "net_profit": net_profit,
    }

@router.get("/liquor/analytics")
async def liquor_analytics(
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    top_brands_stmt = (
        select(
            LiquorProduct.brand_name,
            func.sum(OrderItem.quantity).label("total_quantity")
        )
        .join(OrderItem, OrderItem.menu_item_id == LiquorProduct.id)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "completed",
            Order.created_at >= thirty_days_ago,
            OrderItem.cost_price.isnot(None)
        )
        .group_by(LiquorProduct.brand_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    )
    top_brands = await db.execute(top_brands_stmt)
    top_brands_list = [{"brand_name": row.brand_name, "quantity_sold": row.total_quantity} for row in top_brands]

    low_stock_stmt = (
        select(LiquorProduct, LiquorTenantStock.current_stock)
        .join(LiquorTenantStock, LiquorTenantStock.product_id == LiquorProduct.id)
        .where(LiquorTenantStock.tenant_id == tenant_id, LiquorTenantStock.current_stock <= 10)
    )
    low_stock = await db.execute(low_stock_stmt)
    low_stock_list = [
        {
            "brand_name": prod.brand_name,
            "size_ml": prod.size_ml,
            "current_stock": stock,
            "mrp": prod.mrp,
        }
        for prod, stock in low_stock
    ]

    sales_trend = []
    for i in range(7):
        day = date.today() - timedelta(days=i)
        start_day = datetime.combine(day, datetime.min.time())
        end_day = datetime.combine(day, datetime.max.time())
        revenue_stmt = (
            select(func.coalesce(func.sum(OrderItem.unit_price * OrderItem.quantity), 0))
            .select_from(OrderItem)
            .join(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.status == "completed",
                Order.created_at.between(start_day, end_day),
                OrderItem.cost_price.isnot(None)
            )
        )
        daily_rev = await db.execute(revenue_stmt)
        sales_trend.append({"date": day.isoformat(), "revenue": daily_rev.scalar() or 0})
    sales_trend.reverse()

    return {
        "top_brands": top_brands_list,
        "low_stock_alerts": low_stock_list,
        "sales_trend_last_7_days": sales_trend,
    }

# ======================== NEW OWNER ENDPOINTS (unchanged from previous) ========================
@router.get("/tenant")
async def get_tenant_details(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "id": tenant.id,
        "name": tenant.name,
        "email": tenant.email,
        "phone": tenant.phone,
        "address": tenant.address,
        "business_type": tenant.business_type,
        "has_mart": tenant.has_mart,
        "mart_approved": tenant.mart_approved,
        "mart_name": tenant.mart_name,
        "mart_address": tenant.mart_address,
        "status": tenant.status,
    }

@router.post("/mart/request")
async def request_mart(
    data: MartRequestCreate,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    tenant = await db.get(Tenant, tenant_id)
    if tenant.has_mart:
        raise HTTPException(status_code=400, detail="Mart already exists for this shop")
    if tenant.mart_approved:
        raise HTTPException(status_code=400, detail="Mart already approved")
    existing = await db.execute(
        select(MartRequest).where(MartRequest.tenant_id == tenant_id, MartRequest.status == "pending")
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A pending request already exists")
    request = MartRequest(
        tenant_id=tenant_id,
        requested_mart_name=data.mart_name,
        requested_mart_address=data.mart_address,
        status="pending"
    )
    db.add(request)
    await db.commit()
    return {"message": "Mart request submitted for approval", "request_id": request.id}

@router.get("/co-owners")
async def list_co_owners(current_owner: dict = Depends(get_current_owner), db: AsyncSession = Depends(get_db)):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.role == "co_owner")
    )
    co_owners = result.scalars().all()
    output = []
    for co in co_owners:
        perm = await db.get(CoOwnerPermission, co.id)
        output.append({
            "id": co.id,
            "email": co.email,
            "full_name": co.full_name,
            "phone": co.phone,
            "is_active": co.is_active,
            "permissions": {
                "manage_stock": perm.manage_stock if perm else False,
                "manage_expenses": perm.manage_expenses if perm else False,
                "view_profit_loss": perm.view_profit_loss if perm else False,
                "view_analytics": perm.view_analytics if perm else False,
                "export_reports": perm.export_reports if perm else False,
                "manage_cashiers": perm.manage_cashiers if perm else False,
                "manage_co_owners": perm.manage_co_owners if perm else False,
                "request_mart": perm.request_mart if perm else False,
            }
        })
    return output

@router.post("/co-owners")
async def create_co_owner(
    data: CoOwnerCreate,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")
    co_owner = User(
        tenant_id=tenant_id,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="co_owner",
        full_name=data.full_name,
        phone=data.phone,
        is_active=True
    )
    db.add(co_owner)
    await db.flush()
    perms = CoOwnerPermission(
        co_owner_id=co_owner.id,
        manage_stock=data.permissions.get("manage_stock", False),
        manage_expenses=data.permissions.get("manage_expenses", False),
        view_profit_loss=data.permissions.get("view_profit_loss", False),
        view_analytics=data.permissions.get("view_analytics", False),
        export_reports=data.permissions.get("export_reports", False),
        manage_cashiers=data.permissions.get("manage_cashiers", False),
        manage_co_owners=data.permissions.get("manage_co_owners", False),
        request_mart=data.permissions.get("request_mart", False),
    )
    db.add(perms)
    await db.commit()
    return {"message": "Co-owner created", "co_owner_id": co_owner.id}

@router.put("/co-owners/{user_id}")
async def update_co_owner(
    user_id: str,
    data: CoOwnerUpdate,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.role == "co_owner")
    )
    co_owner = result.scalar_one_or_none()
    if not co_owner:
        raise HTTPException(status_code=404, detail="Co-owner not found")
    if data.full_name is not None:
        co_owner.full_name = data.full_name
    if data.phone is not None:
        co_owner.phone = data.phone
    if data.password is not None:
        co_owner.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        co_owner.is_active = data.is_active
    if data.permissions is not None:
        perm = await db.get(CoOwnerPermission, co_owner.id)
        if perm:
            perm.manage_stock = data.permissions.get("manage_stock", perm.manage_stock)
            perm.manage_expenses = data.permissions.get("manage_expenses", perm.manage_expenses)
            perm.view_profit_loss = data.permissions.get("view_profit_loss", perm.view_profit_loss)
            perm.view_analytics = data.permissions.get("view_analytics", perm.view_analytics)
            perm.export_reports = data.permissions.get("export_reports", perm.export_reports)
            perm.manage_cashiers = data.permissions.get("manage_cashiers", perm.manage_cashiers)
            perm.manage_co_owners = data.permissions.get("manage_co_owners", perm.manage_co_owners)
            perm.request_mart = data.permissions.get("request_mart", perm.request_mart)
        else:
            perm = CoOwnerPermission(co_owner_id=co_owner.id, **data.permissions)
            db.add(perm)
    await db.commit()
    return {"message": "Co-owner updated"}

@router.delete("/co-owners/{user_id}")
async def delete_co_owner(
    user_id: str,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.role == "co_owner")
    )
    co_owner = result.scalar_one_or_none()
    if not co_owner:
        raise HTTPException(status_code=404, detail="Co-owner not found")
    await db.delete(co_owner)
    await db.commit()
    return {"message": "Co-owner deleted"}

@router.get("/cashier-assignments")
async def list_cashier_assignments(
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.role == "cashier")
    )
    cashiers = result.scalars().all()
    output = []
    for cashier in cashiers:
        assignment = await db.execute(
            select(CashierAssignment).where(CashierAssignment.cashier_id == cashier.id, CashierAssignment.tenant_id == tenant_id)
        )
        assign = assignment.scalar_one_or_none()
        output.append({
            "cashier_id": cashier.id,
            "cashier_name": cashier.full_name,
            "email": cashier.email,
            "phone": cashier.phone,
            "assigned_to_shop": assign.assigned_to_shop if assign else False,
            "assigned_to_mart": assign.assigned_to_mart if assign else False,
        })
    return output

@router.post("/cashier-assignments")
async def assign_cashier(
    data: CashierAssignmentCreate,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    cashier = await db.get(User, data.cashier_id)
    if not cashier or cashier.tenant_id != tenant_id or cashier.role != "cashier":
        raise HTTPException(status_code=404, detail="Cashier not found")
    existing = await db.execute(
        select(CashierAssignment).where(CashierAssignment.cashier_id == data.cashier_id, CashierAssignment.tenant_id == tenant_id)
    )
    assignment = existing.scalar_one_or_none()
    if assignment:
        assignment.assigned_to_shop = data.assigned_to_shop
        assignment.assigned_to_mart = data.assigned_to_mart
    else:
        assignment = CashierAssignment(
            cashier_id=data.cashier_id,
            tenant_id=tenant_id,
            assigned_to_shop=data.assigned_to_shop,
            assigned_to_mart=data.assigned_to_mart
        )
        db.add(assignment)
    await db.commit()
    return {"message": "Cashier assignment saved"}

@router.put("/cashier-assignments/{cashier_id}")
async def update_cashier_assignment(
    cashier_id: str,
    data: CashierAssignmentUpdate,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(CashierAssignment).where(CashierAssignment.cashier_id == cashier_id, CashierAssignment.tenant_id == tenant_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if data.assigned_to_shop is not None:
        assignment.assigned_to_shop = data.assigned_to_shop
    if data.assigned_to_mart is not None:
        assignment.assigned_to_mart = data.assigned_to_mart
    await db.commit()
    return {"message": "Assignment updated"}

@router.delete("/cashier-assignments/{cashier_id}")
async def remove_cashier_assignment(
    cashier_id: str,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(CashierAssignment).where(CashierAssignment.cashier_id == cashier_id, CashierAssignment.tenant_id == tenant_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
    return {"message": "Assignment removed"}

@router.get("/daily-stock-reconciliations")
async def get_daily_stock_reconciliations(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = select(DailyStockReconciliation).where(DailyStockReconciliation.tenant_id == tenant_id)
    if start_date:
        query = query.where(DailyStockReconciliation.reconciliation_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(DailyStockReconciliation.reconciliation_date <= datetime.fromisoformat(end_date))
    query = query.order_by(DailyStockReconciliation.reconciliation_date.desc())
    result = await db.execute(query)
    reconciliations = result.scalars().all()
    output = []
    for rec in reconciliations:
        product = await db.get(LiquorProduct, rec.product_id)
        cashier = await db.get(User, rec.submitted_by)
        output.append({
            "id": rec.id,
            "date": rec.reconciliation_date.isoformat(),
            "product_name": product.brand_name if product else "Unknown",
            "size_ml": product.size_ml if product else 0,
            "receipts_cases": rec.receipts_cases,
            "receipts_loose": rec.receipts_loose,
            "closing_stock_physical": rec.closing_stock_physical,
            "cash_total": rec.cash_total,
            "upi_total": rec.upi_total,
            "card_total": rec.card_total,
            "notes": rec.notes,
            "submitted_by": cashier.full_name if cashier else "Unknown",
            "submitted_at": rec.submitted_at,
        })
    return output

@router.get("/cashier-expenses")
async def get_cashier_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    query = select(CashierExpense).where(CashierExpense.tenant_id == tenant_id)
    if start_date:
        query = query.where(CashierExpense.date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(CashierExpense.date <= datetime.fromisoformat(end_date))
    query = query.order_by(CashierExpense.date.desc())
    result = await db.execute(query)
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
            "cashier_name": cashier.full_name if cashier else "Unknown",
            "bill_photo_url": exp.bill_photo_url,
        })
    return output

@router.delete("/cashier-expenses/{expense_id}")
async def delete_cashier_expense(
    expense_id: str,
    current_owner: dict = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_owner["tenant_id"]
    result = await db.execute(
        select(CashierExpense).where(CashierExpense.id == expense_id, CashierExpense.tenant_id == tenant_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    await db.delete(expense)
    await db.commit()
    return {"message": "Expense deleted"}