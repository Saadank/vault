"""
Portfolio router: holdings, sell, price update, summary
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.database import get_db, User, Holding, Transaction, CashBalance
from app.auth import get_current_user
from app.schemas import (
    HoldingCreate, HoldingOut, HoldingUpdate, NotesUpdate,
    SellRequest, TransactionOut, PortfolioSummary
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


# ── Helper ────────────────────────────────────────────────────────────────────
async def get_cash(db: AsyncSession, user_id: int) -> CashBalance:
    result = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cash = result.scalar_one_or_none()
    if not cash:
        cash = CashBalance(user_id=user_id, balance=0.0)
        db.add(cash)
        await db.flush()
    return cash


# ── Summary ───────────────────────────────────────────────────────────────────
@router.get("/summary", response_model=PortfolioSummary)
async def portfolio_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Holdings
    result = await db.execute(select(Holding).where(Holding.user_id == user.id))
    holdings = result.scalars().all()

    portfolio_value = sum(h.quantity * h.current_price for h in holdings)
    total_invested  = sum(h.quantity * h.avg_cost      for h in holdings)
    unrealized_pnl  = portfolio_value - total_invested
    unrealized_pct  = (unrealized_pnl / total_invested * 100) if total_invested else 0

    # Realized P&L from closed sells
    pnl_result = await db.execute(
        select(func.sum(Transaction.realized_pnl)).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "SELL",
            Transaction.realized_pnl.is_not(None),
        )
    )
    realized_pnl = pnl_result.scalar() or 0.0

    cash = await get_cash(db, user.id)

    return PortfolioSummary(
        portfolio_value=round(portfolio_value, 2),
        total_invested=round(total_invested, 2),
        unrealized_pnl=round(unrealized_pnl, 2),
        unrealized_pct=round(unrealized_pct, 4),
        realized_pnl=round(realized_pnl, 2),
        cash_balance=round(cash.balance, 2),
        positions_count=len(holdings),
    )


# ── Holdings ──────────────────────────────────────────────────────────────────
@router.get("/holdings", response_model=list[HoldingOut])
async def list_holdings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.user_id == user.id).order_by(Holding.created_at)
    )
    return result.scalars().all()


@router.post("/holdings", response_model=HoldingOut, status_code=201)
async def add_holding(
    data: HoldingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Check if same asset already exists → average cost
    result = await db.execute(
        select(Holding).where(
            Holding.user_id == user.id,
            Holding.name == data.name,
        )
    )
    existing = result.scalar_one_or_none()

    total_cost = data.quantity * data.avg_cost

    if existing:
        new_qty       = existing.quantity + data.quantity
        new_avg_cost  = (existing.quantity * existing.avg_cost + total_cost) / new_qty
        existing.quantity      = new_qty
        existing.avg_cost      = new_avg_cost
        existing.current_price = data.current_price
        holding = existing
    else:
        holding = Holding(
            user_id=user.id,
            name=data.name,
            ticker=data.ticker,
            asset_type=data.asset_type,
            quantity=data.quantity,
            avg_cost=data.avg_cost,
            current_price=data.current_price,
            purchase_date=data.purchase_date,
            notes=data.notes,
        )
        db.add(holding)
        await db.flush()

    # Deduct total cost from cash balance
    cash = await get_cash(db, user.id)
    if cash.balance < total_cost:
        raise HTTPException(
            400,
            f"Insufficient cash. Available: {round(cash.balance, 2)} SAR, "
            f"required: {round(total_cost, 2)} SAR. Deposit funds first."
        )
    cash.balance -= total_cost

    # Record transaction
    db.add(Transaction(
        user_id=user.id,
        tx_type="BUY",
        asset_name=data.name,
        quantity=data.quantity,
        price=data.avg_cost,
        total=total_cost,
        tx_date=data.purchase_date or datetime.utcnow().strftime("%Y-%m-%d"),
        notes=data.notes,
    ))

    await db.commit()
    await db.refresh(holding)
    return holding


@router.patch("/holdings/{holding_id}/price", response_model=HoldingOut)
async def update_price(
    holding_id: int,
    data: HoldingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")

    holding.current_price = data.current_price
    if data.avg_cost is not None:
        holding.avg_cost = data.avg_cost
    await db.commit()
    await db.refresh(holding)
    return holding


@router.patch("/holdings/{holding_id}/notes", response_model=HoldingOut)
async def update_notes(
    holding_id: int,
    data: NotesUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")

    holding.notes = data.notes or None
    await db.commit()
    await db.refresh(holding)
    return holding


@router.delete("/holdings/{holding_id}", status_code=204)
async def delete_holding(
    holding_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")
    db.delete(holding)
    await db.commit()


# ── Sell ──────────────────────────────────────────────────────────────────────
@router.post("/sell", response_model=TransactionOut)
async def sell_holding(
    data: SellRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.id == data.holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")

    if data.quantity > holding.quantity:
        raise HTTPException(400, f"Cannot sell more than {holding.quantity} units")

    proceeds     = data.quantity * data.price
    cost_basis   = data.quantity * holding.avg_cost
    realized_pnl = proceeds - cost_basis

    # Update holding
    holding.quantity      -= data.quantity
    holding.current_price  = data.price

    if holding.quantity <= 1e-9:  # fully closed
        db.delete(holding)
    
    # Add proceeds to cash
    cash = await get_cash(db, user.id)
    cash.balance += proceeds

    # Record transaction
    tx = Transaction(
        user_id=user.id,
        tx_type="SELL",
        asset_name=holding.name,
        quantity=data.quantity,
        price=data.price,
        total=proceeds,
        realized_pnl=realized_pnl,
        tx_date=data.tx_date or datetime.utcnow().strftime("%Y-%m-%d"),
        notes=data.notes,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx
