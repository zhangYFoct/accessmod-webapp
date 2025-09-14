"""
Database initialization script
"""
import asyncio
from database import create_tables, engine
from models import Base

async def init_database():
    """Initialize the database and create all tables"""
    try:
        print("Creating database tables...")
        await create_tables()
        print("Database tables created successfully!")
    except Exception as e:
        print(f"Error creating database tables: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_database())