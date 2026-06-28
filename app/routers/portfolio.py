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
    SellRequest, TransactionOut, PortfolioSummary, CapitalIncreaseRequest,
    FundFlowRequest,
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
    # Holdings (exclude any zero-quantity rows left by float rounding)
    result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.quantity > 0)
    )
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
        select(Holding)
        .where(Holding.user_id == user.id, Holding.quantity > 0)
        .order_by(Holding.created_at)
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
    await db.delete(holding)   # async session: delete() is a coroutine, must be awaited
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

    if holding.quantity < 0.00001:  # fully closed (generous threshold for float rounding)
        await db.delete(holding)    # async session: delete() is a coroutine, must be awaited
    
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


# ── Capital Increase (bonus shares) ──────────────────────────────────────────
@router.post("/capital-increase", response_model=TransactionOut, status_code=201)
async def capital_increase(
    data: CapitalIncreaseRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.id == data.holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")

    old_qty      = holding.quantity
    new_qty      = old_qty + data.new_shares
    # Total cost basis stays the same; spread over more shares → lower avg cost
    new_avg_cost = (old_qty * holding.avg_cost) / new_qty

    holding.quantity = new_qty
    holding.avg_cost = new_avg_cost

    tx = Transaction(
        user_id=user.id,
        tx_type="CAPITAL_INCREASE",
        asset_name=holding.name,
        quantity=data.new_shares,
        price=0.0,
        total=0.0,
        tx_date=data.tx_date or datetime.utcnow().strftime("%Y-%m-%d"),
        notes=data.notes,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


# ── Fund flow (wallet-style contribute / withdraw) ───────────────────────────
@router.post("/fund-flow", response_model=TransactionOut, status_code=201)
async def fund_flow(
    data: FundFlowRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Add money to / withdraw money from a wallet-style holding (e.g. a Fund)
    WITHOUT going through the share-buy averaging path.

    A Fund is a wallet: total value = quantity × current_price, total basis =
    quantity × avg_cost. Moving money here is an INTERNAL cash-wallet move (like
    BUY/SELL): cash and the holding's value shift by the same amount, so
    total_value (portfolio + cash) stays flat and TWR/flow analytics are
    unaffected — only DEPOSIT/WITHDRAW count as external flows. Adding therefore
    never dilutes the fund's value.

    We compute on the holding's TOTAL value/basis (quantity-aware) and then
    normalise the position back to quantity=1, so a fund that was previously
    mangled by the share-buy path (quantity≠1, bogus per-unit price) self-heals
    into the clean wallet form on the next add/withdraw.
    """
    result = await db.execute(
        select(Holding).where(Holding.id == data.holding_id, Holding.user_id == user.id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")

    cash  = await get_cash(db, user.id)
    today = data.tx_date or datetime.utcnow().strftime("%Y-%m-%d")

    qty         = holding.quantity or 1
    total_value = qty * holding.current_price   # current market value of the position
    total_basis = qty * holding.avg_cost        # total contributed cost basis

    if data.direction == "ADD":
        if cash.balance < data.amount:
            raise HTTPException(
                400,
                f"Insufficient cash. Available: {round(cash.balance, 2)} SAR, "
                f"required: {round(data.amount, 2)} SAR. Deposit funds first."
            )
        # Cash → fund value; basis grows by the same amount (pure contribution,
        # no gain/loss). Normalise to quantity=1.
        cash.balance          -= data.amount
        holding.quantity       = 1
        holding.current_price  = total_value + data.amount
        holding.avg_cost       = total_basis + data.amount

        tx = Transaction(
            user_id=user.id,
            tx_type="BUY",            # internal move; net_flow() ignores it, cost basis sees it
            asset_name=holding.name,
            quantity=None,            # wallet contribution — no per-unit quantity
            price=data.amount,
            total=data.amount,
            tx_date=today,
            notes=data.notes,
        )
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
        return tx

    # ── WITHDRAW ─────────────────────────────────────────────────────────────
    if data.amount > total_value + 1e-6:
        raise HTTPException(
            400, f"Cannot withdraw more than the current value of {round(total_value, 2)} SAR"
        )

    # Proportional cost-basis method (mirrors avg-cost SELL): pull out basis and
    # gain in the same ratio they exist in the fund today, so realized P&L is
    # the gain portion of what's withdrawn.
    fraction      = data.amount / total_value if total_value > 0 else 0.0
    basis_removed = total_basis * fraction
    realized_pnl  = data.amount - basis_removed
    remaining     = total_value - data.amount

    cash.balance          += data.amount
    holding.quantity       = 1
    holding.current_price  = remaining
    holding.avg_cost       = max(total_basis - basis_removed, 0.0)

    tx = Transaction(
        user_id=user.id,
        tx_type="SELL",
        asset_name=holding.name,
        quantity=None,
        price=data.amount,
        total=data.amount,
        realized_pnl=round(realized_pnl, 2),
        tx_date=today,
        notes=data.notes,
    )
    db.add(tx)

    # Fully withdrawn (within a rounding halala) → remove the position entirely
    # so it doesn't linger as a 0-value holding. delete() is a coroutine on the
    # async session and MUST be awaited, otherwise the row is never removed.
    if remaining < 0.01:
        await db.delete(holding)

    await db.commit()
    await db.refresh(tx)
    return tx
