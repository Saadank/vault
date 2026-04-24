"""
Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    username:  str        = Field(..., min_length=3, max_length=50)
    email:     EmailStr
    full_name: Optional[str] = None
    password:  str        = Field(..., min_length=8)


class UserOut(BaseModel):
    id:        int
    username:  str
    email:     str
    full_name: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"


# ── Holdings ──────────────────────────────────────────────────────────────────
class HoldingCreate(BaseModel):
    name:          str   = Field(..., min_length=1, max_length=100)
    ticker:        Optional[str] = Field(None, max_length=50)
    asset_type:    str   = Field(..., max_length=50)
    quantity:      float = Field(..., gt=0)
    avg_cost:      float = Field(..., gt=0)
    current_price: float = Field(..., gt=0)
    purchase_date: Optional[str] = None
    notes:         Optional[str] = None


class HoldingUpdate(BaseModel):
    current_price: float = Field(..., gt=0)
    avg_cost:      Optional[float] = Field(None, gt=0)


class NotesUpdate(BaseModel):
    notes: Optional[str] = None


class HoldingOut(BaseModel):
    id:            int
    name:          str
    ticker:        Optional[str]
    asset_type:    str
    quantity:      float
    avg_cost:      float
    current_price: float
    purchase_date: Optional[str]
    notes:         Optional[str]
    created_at:    datetime
    updated_at:    datetime

    model_config = {"from_attributes": True}


# ── Transactions ──────────────────────────────────────────────────────────────
class SellRequest(BaseModel):
    holding_id: int
    quantity:   float = Field(..., gt=0)
    price:      float = Field(..., gt=0)
    tx_date:    Optional[str] = None
    notes:      Optional[str] = None


class CapitalIncreaseRequest(BaseModel):
    new_shares:    float = Field(..., gt=0, description="Number of bonus shares received")
    new_price:     Optional[float] = Field(None, gt=0, description="Post-adjustment current price")
    tx_date:       Optional[str] = None
    notes:         Optional[str] = None


class CashRequest(BaseModel):
    amount: float = Field(..., gt=0)
    notes:  Optional[str] = None


class TransactionOut(BaseModel):
    id:           int
    tx_type:      str
    asset_name:   Optional[str]
    quantity:     Optional[float]
    price:        Optional[float]
    total:        float
    realized_pnl: Optional[float]
    tx_date:      Optional[str]
    notes:        Optional[str]
    created_at:   datetime

    model_config = {"from_attributes": True}


# ── Portfolio summary ─────────────────────────────────────────────────────────
class PortfolioSummary(BaseModel):
    portfolio_value: float
    total_invested:  float
    unrealized_pnl:  float
    unrealized_pct:  float
    realized_pnl:    float
    cash_balance:    float
    positions_count: int
