from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import admin_routes, owner_routes, cashier_routes
from database import engine, Base, async_session
from schema_manager import User
from routes import auth_routes
from auth import hash_password
from sqlalchemy import select
import uuid

app = FastAPI(title="BillBite API")

# CORS configuration – allow frontend and required headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # your frontend URL (replace with specific origin in production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],                       # includes X-Tenant-ID
)

app.include_router(admin_routes.router, prefix="/admin", tags=["Admin"])
app.include_router(owner_routes.router, prefix="/owner", tags=["Owner"])
app.include_router(cashier_routes.router, prefix="/cashier", tags=["Cashier"])
app.include_router(auth_routes.router, prefix="/auth", tags=["Auth"])

@app.on_event("startup")
async def startup():
    # Create all tables (including new models: CoOwnerPermission, CashierAssignment,
    # MartRequest, DailyStockReconciliation, CashierExpense)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default admin if not exists
    async with async_session() as session:
        result = await session.execute(select(User).where(User.role == "admin"))
        admin = result.scalar_one_or_none()
        if not admin:
            admin_user = User(
                id=str(uuid.uuid4()),
                tenant_id=None,
                email="admin@billbite.com",
                hashed_password=hash_password("admin123"),
                role="admin",
                full_name="Super Admin",
                is_active=True
            )
            session.add(admin_user)
            await session.commit()

@app.get("/")
def root():
    return {"message": "BillBite backend is running"}