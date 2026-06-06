import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, Text, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

# Helper to generate string UUIDs
def generate_uuid():
    return str(uuid.uuid4())

# ========================
# 1. Tenants & Users
# ========================
class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    date_of_joining = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    business_type = Column(Enum('restaurant', 'liquor_mart'), default='restaurant', nullable=False)
    
    # Mart fields
    has_mart = Column(Boolean, default=False)
    mart_approved = Column(Boolean, default=False)
    mart_name = Column(String(255), nullable=True)
    mart_address = Column(Text, nullable=True)
    
    users = relationship("User", back_populates="tenant")
    cashier_assignments = relationship("CashierAssignment", back_populates="tenant")
    mart_requests = relationship("MartRequest", back_populates="tenant")
    daily_stock_reconciliations = relationship("DailyStockReconciliation", back_populates="tenant")
    cashier_expenses = relationship("CashierExpense", back_populates="tenant")


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # admin, owner, co_owner, cashier
    full_name = Column(String(100))
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tenant = relationship("Tenant", back_populates="users")
    
    co_owner_permission = relationship("CoOwnerPermission", back_populates="co_owner", uselist=False)
    cashier_assignments = relationship("CashierAssignment", back_populates="cashier")


class CoOwnerPermission(Base):
    __tablename__ = "co_owner_permissions"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    co_owner_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    
    manage_stock = Column(Boolean, default=False)
    manage_expenses = Column(Boolean, default=False)
    view_profit_loss = Column(Boolean, default=False)
    view_analytics = Column(Boolean, default=False)
    export_reports = Column(Boolean, default=False)
    manage_cashiers = Column(Boolean, default=False)
    manage_co_owners = Column(Boolean, default=False)
    request_mart = Column(Boolean, default=False)
    
    co_owner = relationship("User", back_populates="co_owner_permission")


class CashierAssignment(Base):
    __tablename__ = "cashier_assignments"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    cashier_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    assigned_to_shop = Column(Boolean, default=True)
    assigned_to_mart = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    cashier = relationship("User", back_populates="cashier_assignments")
    tenant = relationship("Tenant", back_populates="cashier_assignments")


class MartRequest(Base):
    __tablename__ = "mart_requests"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    requested_mart_name = Column(String(255), nullable=False)
    requested_mart_address = Column(Text, nullable=False)
    status = Column(Enum('pending', 'approved', 'rejected'), default='pending')
    admin_notes = Column(Text, nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    
    tenant = relationship("Tenant", back_populates="mart_requests")


# ========================
# 2. Menu (Restaurant)
# ========================
class Category(Base):
    __tablename__ = "categories"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    items = relationship("MenuItem", back_populates="category")


class MenuItem(Base):
    __tablename__ = "menu_items"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    category_id = Column(String(36), ForeignKey("categories.id"), nullable=True)
    name = Column(String(255), nullable=False)
    price = Column(Float, nullable=False)
    item_type = Column(String(20), nullable=False)
    is_available = Column(Boolean, default=True)
    category = relationship("Category", back_populates="items")


# ========================
# 3. Orders & Bills
# ========================
class Order(Base):
    __tablename__ = "orders"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    cashier_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    total_amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False)
    status = Column(String(20), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow)
    items = relationship("OrderItem", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(String(36), ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    cost_price = Column(Float, nullable=True)
    order = relationship("Order", back_populates="items")


# ========================
# 4. Packaged Stock (Restaurant)
# ========================
class PackagedStock(Base):
    __tablename__ = "packaged_stock"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    menu_item_id = Column(String(36), ForeignKey("menu_items.id"), unique=True, nullable=False)
    quantity_in_stock = Column(Integer, default=0)
    low_stock_threshold = Column(Integer, default=5)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    packaged_stock_id = Column(String(36), ForeignKey("packaged_stock.id"), nullable=False)
    movement_type = Column(String(20), nullable=False)
    quantity_change = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


# ========================
# 5. Expenses (Shared)
# ========================
class RawMaterialExpense(Base):
    __tablename__ = "raw_material_expenses"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    item_name = Column(String(255), nullable=False)
    quantity = Column(Float, nullable=True)
    unit = Column(String(20), nullable=True)
    amount = Column(Float, nullable=False)
    vendor = Column(String(255), nullable=True)
    photo_url = Column(String(500), nullable=True)


class OtherExpense(Base):
    __tablename__ = "other_expenses"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, nullable=False)


# ========================
# 6. Liquor Mart Models (Global Products + Location‑based Stock)
# ========================
class LiquorProduct(Base):
    __tablename__ = "liquor_products"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_code = Column(String(20), nullable=False, index=True)
    brand_name = Column(String(255), nullable=False)
    size_ml = Column(Integer, nullable=False)
    size_code = Column(String(10), nullable=True)
    pack_qty = Column(Integer, nullable=False)
    mrp = Column(Float, nullable=False)
    unit_cost = Column(Float, nullable=False, default=0.0)
    barcode = Column(String(20), unique=True, nullable=True, index=True)
    product_type = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint('brand_code', 'size_ml', 'pack_qty', name='uq_brand_size'),)
    
    tenant_stocks = relationship("LiquorTenantStock", back_populates="product")
    purchase_items = relationship("PurchaseItem", back_populates="product")
    stock_transactions = relationship("StockTransaction", back_populates="product")
    stock_transfers_out = relationship("StockTransfer", foreign_keys="StockTransfer.from_product_id", back_populates="from_product")
    stock_transfers_in = relationship("StockTransfer", foreign_keys="StockTransfer.to_product_id", back_populates="to_product")
    daily_stock_reconciliations = relationship("DailyStockReconciliation", back_populates="product")


class LiquorTenantStock(Base):
    """Per‑tenant, per‑location stock for each global product."""
    __tablename__ = "liquor_tenant_stock"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)
    location = Column(Enum('shop', 'mart'), nullable=False, default='shop')
    current_stock = Column(Integer, default=0)
    low_stock_threshold = Column(Integer, default=5)
    __table_args__ = (UniqueConstraint('tenant_id', 'product_id', 'location', name='uq_tenant_product_location'),)
    
    tenant = relationship("Tenant")
    product = relationship("LiquorProduct", back_populates="tenant_stocks")


class StockTransaction(Base):
    __tablename__ = "stock_transactions"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)
    location = Column(Enum('shop', 'mart'), nullable=False, default='shop')  # where stock was added
    date = Column(DateTime, default=datetime.utcnow)
    cases_received = Column(Integer, default=0)
    loose_received = Column(Integer, default=0)
    total_bottles_added = Column(Integer, nullable=False)
    invoice_id = Column(String(36), ForeignKey("purchase_invoices.id"), nullable=True)
    unit_cost = Column(Float, nullable=False)
    verified = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    
    tenant = relationship("Tenant")
    product = relationship("LiquorProduct", back_populates="stock_transactions")
    invoice = relationship("PurchaseInvoice")


class StockTransfer(Base):
    """Transfer stock from shop to mart."""
    __tablename__ = "stock_transfers"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    from_product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)
    to_product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)  # same product, but separate FK for clarity
    transfer_date = Column(DateTime, default=datetime.utcnow)
    cases = Column(Integer, default=0)
    loose_bottles = Column(Integer, default=0)
    pack_qty_at_time = Column(Integer, nullable=False)  # snapshot of bottles per case
    total_bottles = Column(Integer, nullable=False)    # (cases * pack_qty) + loose
    transferred_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    notes = Column(Text, nullable=True)
    
    tenant = relationship("Tenant")
    from_product = relationship("LiquorProduct", foreign_keys=[from_product_id], back_populates="stock_transfers_out")
    to_product = relationship("LiquorProduct", foreign_keys=[to_product_id], back_populates="stock_transfers_in")
    cashier = relationship("User", foreign_keys=[transferred_by])


class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    invoice_number = Column(String(100), nullable=False, unique=True)
    invoice_date = Column(DateTime, nullable=False)
    total_cess = Column(Float, default=0.0)
    total_tcs = Column(Float, default=0.0)
    total_invoice_value = Column(Float, nullable=True)
    cashier_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    tenant = relationship("Tenant")
    cashier = relationship("User")
    items = relationship("PurchaseItem", back_populates="invoice")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_id = Column(String(36), ForeignKey("purchase_invoices.id"), nullable=False)
    product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)
    cases_received = Column(Integer, default=0)
    loose_bottles = Column(Integer, default=0)
    pack_qty_at_time = Column(Integer, nullable=False)
    unit_cost = Column(Float, nullable=False)
    total_bottles = Column(Integer, nullable=False)
    
    invoice = relationship("PurchaseInvoice", back_populates="items")
    product = relationship("LiquorProduct", back_populates="purchase_items")


# ========================
# 7. Cashier Daily Stock Reconciliation (location aware)
# ========================
class DailyStockReconciliation(Base):
    __tablename__ = "daily_stock_reconciliation"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    reconciliation_date = Column(DateTime, nullable=False)
    product_id = Column(String(36), ForeignKey("liquor_products.id"), nullable=False)
    location = Column(Enum('shop', 'mart'), nullable=False, default='shop')  # which location this reconciliation is for
    
    receipts_cases = Column(Integer, default=0)
    receipts_loose = Column(Integer, default=0)
    closing_stock_physical = Column(Integer, nullable=False)
    
    # Payment totals (only relevant for shop? but can be per location)
    cash_total = Column(Float, default=0.0)
    upi_total = Column(Float, default=0.0)
    card_total = Column(Float, default=0.0)
    
    notes = Column(Text, nullable=True)
    submitted_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    
    tenant = relationship("Tenant", back_populates="daily_stock_reconciliations")
    product = relationship("LiquorProduct", back_populates="daily_stock_reconciliations")
    cashier = relationship("User", foreign_keys=[submitted_by])


# ========================
# 8. Cashier Expenses (petty cash)
# ========================
class CashierExpense(Base):
    __tablename__ = "cashier_expenses"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    cashier_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)
    bill_photo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    tenant = relationship("Tenant", back_populates="cashier_expenses")
    cashier = relationship("User")