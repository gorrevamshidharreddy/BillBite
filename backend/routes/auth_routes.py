from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from database import get_db
from schema_manager import User, Tenant
from auth import verify_password, create_access_token, get_current_user

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # For admin: fetch all tenants (so admin can select any shop)
    # For other roles: fetch only the tenant associated with the user
    tenants = []
    tenant_obj = None
    if user.role == "admin":
        tenants_result = await db.execute(select(Tenant))
        all_tenants = tenants_result.scalars().all()
        tenants = [
            {
                "id": str(t.id),
                "name": t.name,
                "business_type": t.business_type,
                "email": t.email,
                "phone": t.phone,
                "address": t.address,
                "has_mart": t.has_mart,
                "mart_approved": t.mart_approved,
                "mart_name": t.mart_name,
                "mart_address": t.mart_address,
            }
            for t in all_tenants
        ]
        # For admin, tenant_obj remains None (no single default tenant)
    else:
        # Owner, co_owner, cashier: fetch their single tenant
        if user.tenant_id:
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
            tenant_obj = tenant_result.scalar_one_or_none()
            if tenant_obj:
                tenants.append({
                    "id": str(tenant_obj.id),
                    "name": tenant_obj.name,
                    "business_type": tenant_obj.business_type,
                    "email": tenant_obj.email,
                    "phone": tenant_obj.phone,
                    "address": tenant_obj.address,
                    "has_mart": tenant_obj.has_mart,
                    "mart_approved": tenant_obj.mart_approved,
                    "mart_name": tenant_obj.mart_name,
                    "mart_address": tenant_obj.mart_address,
                })
    
    # Prepare token data
    token_data = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "role": user.role,
        "business_type": tenant_obj.business_type if tenant_obj else None,
        "has_mart": tenant_obj.has_mart if tenant_obj else False,
        "mart_approved": tenant_obj.mart_approved if tenant_obj else False,
    }
    token = create_access_token(token_data)

    return {
        "access_token": token,
        "role": user.role,
        "user_id": str(user.id),
        "name": user.full_name,
        "tenants": tenants,
        "tenant": tenants[0] if tenants else None
    }

@router.get("/tenants")
async def get_tenants(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    tenants = []
    if user.role == "admin":
        tenants_result = await db.execute(select(Tenant))
        all_tenants = tenants_result.scalars().all()
        tenants = [
            {
                "id": str(t.id),
                "name": t.name,
                "business_type": t.business_type,
                "email": t.email,
                "phone": t.phone,
                "address": t.address,
                "has_mart": t.has_mart,
                "mart_approved": t.mart_approved,
                "mart_name": t.mart_name,
                "mart_address": t.mart_address,
            }
            for t in all_tenants
        ]
    else:
        if user.tenant_id:
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
            tenant_obj = tenant_result.scalar_one_or_none()
            if tenant_obj:
                tenants.append({
                    "id": str(tenant_obj.id),
                    "name": tenant_obj.name,
                    "business_type": tenant_obj.business_type,
                    "email": tenant_obj.email,
                    "phone": tenant_obj.phone,
                    "address": tenant_obj.address,
                    "has_mart": tenant_obj.has_mart,
                    "mart_approved": tenant_obj.mart_approved,
                    "mart_name": tenant_obj.mart_name,
                    "mart_address": tenant_obj.mart_address,
                })
                
    return {"tenants": tenants}