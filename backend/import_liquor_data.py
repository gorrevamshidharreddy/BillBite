import asyncio
import uuid
import pandas as pd
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from schema_manager import LiquorProduct, LiquorTenantStock, Tenant
from database import DATABASE_URL

async def import_liquor_products_global(csv_path: str):
    csv_path = csv_path.strip().strip('"').strip("'")
    
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return
    
    print(f"Reading CSV from: {csv_path}")
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    
    required = ['Brand code', 'Size Code', 'Brand Name', 'PK_QTY', 'MRP', 
                'UNIT ISSUE PER PEICE', 'Type', 'Size_ML']
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise Exception(f"Missing required columns: {missing}")
    
    # Clean and convert
    df['brand_code'] = df['Brand code'].astype(str).str.zfill(4)
    df['size_ml'] = pd.to_numeric(df['Size_ML'], errors='coerce').fillna(0).astype(int)
    df['unit_cost'] = pd.to_numeric(df['UNIT ISSUE PER PEICE'], errors='coerce').fillna(0.0)
    df['pack_qty'] = pd.to_numeric(df['PK_QTY'], errors='coerce').fillna(0).astype(int)
    df['mrp'] = pd.to_numeric(df['MRP'], errors='coerce').fillna(0.0)
    df['product_type'] = df['Type'].fillna('UNKNOWN').astype(str).str.strip().str.upper()
    df['brand_name'] = df['Brand Name'].astype(str).str.strip()
    df['size_code'] = df['Size Code'].astype(str).str.strip()
    
    # Filter invalid rows
    initial_rows = len(df)
    df = df[(df['brand_code'] != '0000') & (df['size_ml'] > 0) & (df['brand_name'] != 'nan') & (df['pack_qty'] > 0)]
    print(f"Filtered out {initial_rows - len(df)} rows with missing data")
    
    if len(df) == 0:
        print("No valid rows to import. Exiting.")
        return
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        inserted = 0
        skipped = 0
        batch_size = 500
        batch = []
        seen_in_batch = set()  # NEW: track (brand_code, size_ml, pack_qty) within current batch
        
        for idx, row in df.iterrows():
            key = (row['brand_code'], row['size_ml'], row['pack_qty'])
            
            # Check if already seen in this batch
            if key in seen_in_batch:
                print(f"Skipping duplicate in batch: {row['brand_code']} | {row['size_ml']}ml | {row['pack_qty']} bottles/case | {row['brand_name']}")
                skipped += 1
                continue
            
            # Check if already exists in database
            stmt = select(LiquorProduct).where(
                LiquorProduct.brand_code == row['brand_code'],
                LiquorProduct.size_ml == row['size_ml'],
                LiquorProduct.pack_qty == row['pack_qty']
            )
            existing = await session.execute(stmt)
            if existing.scalar_one_or_none():
                print(f"Skipping duplicate in DB: {row['brand_code']} | {row['size_ml']}ml | {row['pack_qty']} bottles/case | {row['brand_name']}")
                skipped += 1
                continue
            
            new_product = LiquorProduct(
                id=str(uuid.uuid4()),
                brand_code=row['brand_code'],
                size_code=row['size_code'] if row['size_code'] != 'nan' else '',
                size_ml=int(row['size_ml']),
                brand_name=row['brand_name'],
                pack_qty=int(row['pack_qty']),
                mrp=float(row['mrp']),
                unit_cost=float(row['unit_cost']),
                barcode=None,
                product_type=row['product_type'] if row['product_type'] != 'NAN' else 'UNKNOWN',
            )
            batch.append(new_product)
            seen_in_batch.add(key)
            inserted += 1
            
            if len(batch) >= batch_size:
                session.add_all(batch)
                await session.commit()
                print(f"Committed {inserted} global products...")
                batch = []
                seen_in_batch = set()  # reset for next batch
        
        if batch:
            session.add_all(batch)
            await session.commit()
        
        print(f"\n✅ Global catalog import: {inserted} products inserted, {skipped} duplicates skipped.")
        
        # Optional: init stock for a tenant
        answer = input("\nDo you want to create stock records (starting at 0) for a liquor mart tenant? (y/n): ").strip().lower()
        if answer == 'y':
            tenant_id = input("Enter tenant_id (UUID): ").strip()
            tenant = await session.get(Tenant, tenant_id)
            if not tenant or tenant.business_type != 'liquor_mart':
                print(f"Tenant {tenant_id} not found or not a liquor_mart. Skipping stock init.")
                return
            
            result = await session.execute(select(LiquorProduct.id))
            all_product_ids = result.scalars().all()
            
            stock_inserted = 0
            stock_batch = []
            for pid in all_product_ids:
                existing_stock = await session.execute(
                    select(LiquorTenantStock).where(
                        LiquorTenantStock.tenant_id == tenant_id,
                        LiquorTenantStock.product_id == pid
                    )
                )
                if not existing_stock.scalar_one_or_none():
                    stock_batch.append(LiquorTenantStock(
                        id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
                        product_id=pid,
                        current_stock=0,
                        low_stock_threshold=5
                    ))
                    stock_inserted += 1
                    if len(stock_batch) >= 500:
                        session.add_all(stock_batch)
                        await session.commit()
                        stock_batch = []
            
            if stock_batch:
                session.add_all(stock_batch)
                await session.commit()
            
            print(f"✅ Initialised zero stock for {stock_inserted} products in tenant {tenant_id}.")

if __name__ == "__main__":
    csv_file = input("Enter full path to CSV file: ").strip()
    asyncio.run(import_liquor_products_global(csv_file))