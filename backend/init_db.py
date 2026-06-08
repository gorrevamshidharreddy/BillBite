import asyncio
from sqlalchemy import text
from database import engine, async_session
from schema_manager import OrderItem, Base

async def fix():
    print("1. Checking current database...")
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT current_database()"))
        db_name = result.scalar()
        print(f"   Connected to database: {db_name}")
        
        # Check if cost_price exists
        result = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'order_items'"))
        columns = [row[0] for row in result.fetchall()]
        print(f"   Columns in order_items: {columns}")
        
        if 'cost_price' not in columns:
            print("   cost_price missing – adding it now...")
            await conn.execute(text("ALTER TABLE order_items ADD COLUMN cost_price FLOAT DEFAULT NULL"))
            await conn.commit()
            print("   ✅ cost_price added")
        else:
            print("   ✅ cost_price already exists")
    
    print("\n2. Dropping and recreating order_items table to force sync...")
    async with engine.begin() as conn:
        # Drop the table (this deletes order data – only do in development)
        await conn.execute(text("DROP TABLE IF EXISTS order_items CASCADE"))
        # Recreate using SQLAlchemy model
        await conn.run_sync(Base.metadata.create_all)
        print("   ✅ order_items recreated with cost_price")
    
    print("\n✅ Fix complete. Restart your backend and test POS again.")

if __name__ == "__main__":
    asyncio.run(fix())