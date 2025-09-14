"""
Database configuration and connection management
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://username:password@localhost:5432/healthcare_analysis")
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=True,  # Set to False in production
    future=True
)

# Create session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Create base class for models
Base = declarative_base()

# Dependency to get database session
async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Create all tables
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Close database connections
async def close_db():
    await engine.dispose()