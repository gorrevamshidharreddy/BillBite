import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

async def add_column():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE tenants ADD COLUMN shop_number VARCHAR(50);"))
            print("Column shop_number added successfully.")
        except Exception as e:
            print("Error or already exists:", e)

asyncio.run(add_column())
