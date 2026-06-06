from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from auth import require_role, hash_password
from schema_manager import Tenant, User, MartRequest
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

router = APIRouter()

# ---------------------------
# Schemas (existing + new)
# ---------------------------
class TenantCreate(BaseModel):
    hotel_name: str
    email: Optional[str] = None
    phone: str
    address: str
    date_of_joining: Optional[str] = None
    owner_full_name: str
    owner_email: EmailStr
    owner_password: str
    business_type: str = "restaurant"   # 'restaurant' or 'liquor_mart'

class TenantOut(BaseModel):
    id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    date_of_joining: Optional[datetime]
    status: str
    created_at: Optional[datetime]
    business_type: Optional[str]

class MartRequestOut(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str          # from tenant relation
    requested_mart_name: str
    requested_mart_address: str
    status: str
    admin_notes: Optional[str]
    requested_at: datetime
    reviewed_at: Optional[datetime]

class ApproveMartRequest(BaseModel):
    admin_notes: Optional[str] = None

class RejectMartRequest(BaseModel):
    admin_notes: str   # required reason

# ---------------------------
# Existing Endpoints (unchanged)
# ---------------------------
@router.post("/tenants", dependencies=[Depends(require_role("admin"))])
async def create_tenant(data: TenantCreate, db: AsyncSession = Depends(get_db)):
    # Convert empty string email to None manually
    email = data.email
    if email is not None and email.strip() == "":
        email = None

    # Ensure business_type is valid
    if data.business_type not in ["restaurant", "liquor_mart"]:
        raise HTTPException(status_code=400, detail="business_type must be 'restaurant' or 'liquor_mart'")

    tenant = Tenant(
        name=data.hotel_name,
        email=email,
        phone=data.phone,
        address=data.address,
        date_of_joining=datetime.fromisoformat(data.date_of_joining) if data.date_of_joining else datetime.utcnow(),
        business_type=data.business_type,
    )
    db.add(tenant)
    await db.flush()

    owner = User(
        tenant_id=tenant.id,
        email=data.owner_email,
        hashed_password=hash_password(data.owner_password),
        role="owner",
        full_name=data.owner_full_name,
    )
    db.add(owner)
    await db.commit()

    return {"tenant_id": tenant.id, "owner_id": owner.id}

@router.get("/tenants", dependencies=[Depends(require_role("admin"))])
async def list_tenants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant))
    tenants = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "email": t.email,
            "phone": t.phone,
            "address": t.address,
            "date_of_joining": t.date_of_joining,
            "status": t.status,
            "created_at": t.created_at,
            "business_type": t.business_type,
            "has_mart": t.has_mart,
            "mart_approved": t.mart_approved,
            "mart_name": t.mart_name,
            "mart_address": t.mart_address,
        }
        for t in tenants
    ]

@router.delete("/tenants/{tenant_id}", dependencies=[Depends(require_role("admin"))])
async def delete_tenant(tenant_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await db.delete(tenant)
    await db.commit()
    return {"message": "Tenant deleted"}

# ---------------------------
# NEW: Mart Request Management Endpoints
# ---------------------------

@router.get("/mart-requests", dependencies=[Depends(require_role("admin"))])
async def list_mart_requests(
    status: Optional[str] = None,  # pending, approved, rejected
    db: AsyncSession = Depends(get_db)
):
    """List all mart requests, optionally filtered by status."""
    query = select(MartRequest)
    if status:
        query = query.where(MartRequest.status == status)
    result = await db.execute(query)
    requests = result.scalars().all()
    
    output = []
    for req in requests:
        tenant = await db.get(Tenant, req.tenant_id)
        output.append(MartRequestOut(
            id=req.id,
            tenant_id=req.tenant_id,
            tenant_name=tenant.name if tenant else "Unknown",
            requested_mart_name=req.requested_mart_name,
            requested_mart_address=req.requested_mart_address,
            status=req.status,
            admin_notes=req.admin_notes,
            requested_at=req.requested_at,
            reviewed_at=req.reviewed_at,
        ))
    return output

@router.post("/mart-requests/{request_id}/approve", dependencies=[Depends(require_role("admin"))])
async def approve_mart_request(
    request_id: str,
    data: ApproveMartRequest,
    db: AsyncSession = Depends(get_db)
):
    """Approve a pending mart request. Updates the tenant's mart fields."""
    result = await db.execute(select(MartRequest).where(MartRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Mart request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    # Update the tenant
    tenant = await db.get(Tenant, req.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Associated tenant not found")
    
    tenant.has_mart = True
    tenant.mart_approved = True
    tenant.mart_name = req.requested_mart_name
    tenant.mart_address = req.requested_mart_address
    
    # Update the request status
    req.status = "approved"
    req.admin_notes = data.admin_notes
    req.reviewed_at = datetime.utcnow()
    
    await db.commit()
    return {"message": "Mart request approved", "tenant_id": tenant.id}

@router.post("/mart-requests/{request_id}/reject", dependencies=[Depends(require_role("admin"))])
async def reject_mart_request(
    request_id: str,
    data: RejectMartRequest,
    db: AsyncSession = Depends(get_db)
):
    """Reject a pending mart request. Do NOT update the tenant's mart fields."""
    result = await db.execute(select(MartRequest).where(MartRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Mart request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    req.status = "rejected"
    req.admin_notes = data.admin_notes
    req.reviewed_at = datetime.utcnow()
    
    await db.commit()
    return {"message": "Mart request rejected"}