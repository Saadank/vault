"""
Database models using SQLAlchemy ORM.
Swap the DATABASE_URL to PostgreSQL or MySQL easily:
  - PostgreSQL: "postgresql+asyncpg://user:pass@localhost/vault"
  - MySQL:      "mysql+aiomysql://user:pass@localhost/vault"
"""

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime

# ── Change this URL to switch databases ──────────────────────────────────────
import os
# On Railway: set DATABASE_URL env var to a PostgreSQL URL for persistent storage
# Locally:    uses SQLite vault.db
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./vault.db")
# Railway injects postgres:// or postgresql:// — both need the asyncpg async driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
# ─────────────────────────────────────────────────────────────────────────────

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


# ── Dependency ────────────────────────────────────────────────────────────────
async def get_db():
    async with SessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ── Models ────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String(50), unique=True, index=True, nullable=False)
    email      = Column(String(120), unique=True, index=True, nullable=False)
    full_name  = Column(String(120), nullable=True)
    hashed_pw  = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    holdings     = relationship("Holding",     back_populates="owner", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="owner", cascade="all, delete-orphan")
    cash_balance = relationship("CashBalance", back_populates="owner", uselist=False, cascade="all, delete-orphan")


class CashBalance(Base):
    __tablename__ = "cash_balances"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance    = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="cash_balance")


class Holding(Base):
    __tablename__ = "holdings"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    name          = Column(String(100), nullable=False)
    asset_type    = Column(String(50), nullable=False)
    quantity      = Column(Float, nullable=False)
    avg_cost      = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)
    purchase_date = Column(String(20), nullable=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="holdings")


class Transaction(Base):
    __tablename__ = "transactions"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    tx_type      = Column(String(20), nullable=False)   # BUY | SELL | DEPOSIT | WITHDRAW
    asset_name   = Column(String(100), nullable=True)
    quantity     = Column(Float, nullable=True)
    price        = Column(Float, nullable=True)
    total        = Column(Float, nullable=False)
    realized_pnl = Column(Float, nullable=True)
    tx_date      = Column(String(20), nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="transactions")


class PortfolioSnapshot(Base):
    """Daily snapshot of portfolio total value for chart history."""
    __tablename__ = "portfolio_snapshots"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    snapshot_date   = Column(String(10), nullable=False)   # YYYY-MM-DD
    portfolio_value = Column(Float, nullable=False)
    cash_balance    = Column(Float, nullable=False, default=0.0)
    total_value     = Column(Float, nullable=False)        # portfolio + cash
    created_at      = Column(DateTime, default=datetime.utcnow)
