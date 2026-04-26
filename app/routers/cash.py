"""
Cash management and transaction history router.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.database import get_db, User, Transaction, CashBalance, Holding
from app.auth import get_current_user
from app.schemas import CashRequest, TransactionOut

router = APIRouter(prefix="/api", tags=["cash", "transactions"])


async def get_or_create_cash(db: AsyncSession, user_id: int) -> CashBalance:
    result = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cash = result.scalar_one_or_none()
    if not cash:
        cash = CashBalance(user_id=user_id, balance=0.0)
        db.add(cash)
        await db.flush()
    return cash


@router.get("/cash")
async def get_cash_balance(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cash = await get_or_create_cash(db, user.id)
    return {"balance": round(cash.balance, 2)}


@router.post("/cash/deposit")
async def deposit_cash(
    data: CashRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cash = await get_or_create_cash(db, user.id)
    cash.balance += data.amount

    db.add(Transaction(
        user_id=user.id,
        tx_type="DEPOSIT",
        asset_name="Cash Deposit",
        total=data.amount,
        tx_date=datetime.utcnow().strftime("%Y-%m-%d"),
        notes=data.notes,
    ))

    await db.commit()
    return {"balance": round(cash.balance, 2), "deposited": data.amount}


@router.post("/cash/withdraw")
async def withdraw_cash(
    data: CashRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cash = await get_or_create_cash(db, user.id)
    if data.amount > cash.balance:
        raise HTTPException(400, "Insufficient cash balance")

    cash.balance -= data.amount

    db.add(Transaction(
        user_id=user.id,
        tx_type="WITHDRAW",
        asset_name="Cash Withdrawal",
        total=data.amount,
        tx_date=datetime.utcnow().strftime("%Y-%m-%d"),
        notes=data.notes,
    ))

    await db.commit()
    return {"balance": round(cash.balance, 2), "withdrawn": data.amount}


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Delete a transaction AND fully reverse its financial effect:

      BUY    → reduce holding quantity (remove holding if qty reaches 0).
               Cannot delete if it would require knowing the original avg_cost
               breakdown when multiple buys were averaged — we reverse the
               exact quantity and total stored on the transaction.
      SELL   → restore holding quantity & avg_cost, deduct proceeds from cash.
               Re-creates the holding at the original avg_cost if it was
               fully closed.
      DEPOSIT  → deduct amount from cash balance.
      WITHDRAW → add amount back to cash balance.
    """
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == user.id,
        )
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "Transaction not found")

    reversal_detail = ""

    # ── BUY reversal ──────────────────────────────────────────────────────────
    if tx.tx_type == "BUY" and tx.asset_name and tx.quantity and tx.price:
        holding_result = await db.execute(
            select(Holding).where(
                Holding.user_id == user.id,
                Holding.name == tx.asset_name,
            )
        )
        holding = holding_result.scalar_one_or_none()

        if holding:
            new_qty = round(holding.quantity - tx.quantity, 10)
            if new_qty <= 1e-9:
                # Remove the holding entirely
                await db.delete(holding)
                reversal_detail = f"Removed holding {tx.asset_name}"
            else:
                # Reverse the weighted average: recover original total cost
                # then subtract this buy's contribution
                total_cost_now  = holding.quantity * holding.avg_cost
                this_buy_cost   = tx.quantity * tx.price
                remaining_cost  = total_cost_now - this_buy_cost
                holding.quantity = new_qty
                holding.avg_cost = max(remaining_cost / new_qty, 0) if new_qty > 0 else holding.avg_cost
                reversal_detail = f"Reduced {tx.asset_name} by {tx.quantity} units"

        # Return the original purchase cost to cash
        cash = await get_or_create_cash(db, user.id)
        cash.balance += tx.total
        reversal_detail += f", returned {tx.total:.2f} SAR to cash"

    # ── SELL reversal ─────────────────────────────────────────────────────────
    elif tx.tx_type == "SELL" and tx.asset_name and tx.quantity and tx.price:
        proceeds = tx.total  # what was added to cash at sell time

        # Deduct proceeds from cash
        cash = await get_or_create_cash(db, user.id)
        cash.balance = max(cash.balance - proceeds, 0)

        # Restore holding
        holding_result = await db.execute(
            select(Holding).where(
                Holding.user_id == user.id,
                Holding.name == tx.asset_name,
            )
        )
        holding = holding_result.scalar_one_or_none()

        if holding:
            # Re-average: merge back the sold lot at its original avg_cost
            # We stored the sell price, not the original avg_cost.
            # Best approximation: the avg_cost contribution from the sell
            # was (proceeds - realized_pnl) / quantity = original cost basis.
            original_cost_per_unit = tx.price  # fallback
            if tx.realized_pnl is not None:
                cost_basis_total = proceeds - tx.realized_pnl
                original_cost_per_unit = cost_basis_total / tx.quantity if tx.quantity else tx.price

            total_cost = holding.quantity * holding.avg_cost + tx.quantity * original_cost_per_unit
            holding.quantity += tx.quantity
            holding.avg_cost  = total_cost / holding.quantity
        else:
            # Holding was fully closed by this sell — recreate it
            original_cost_per_unit = tx.price
            if tx.realized_pnl is not None:
                cost_basis_total = tx.total - tx.realized_pnl
                original_cost_per_unit = cost_basis_total / tx.quantity if tx.quantity else tx.price

            new_holding = Holding(
                user_id=user.id,
                name=tx.asset_name,
                asset_type="Stock",   # best guess; user can update
                quantity=tx.quantity,
                avg_cost=original_cost_per_unit,
                current_price=tx.price,
                notes="Restored after sell transaction was deleted",
            )
            db.add(new_holding)

        reversal_detail = f"Restored {tx.quantity} units of {tx.asset_name}, removed {proceeds:.2f} SAR from cash"

    # ── DEPOSIT reversal ──────────────────────────────────────────────────────
    elif tx.tx_type == "DEPOSIT":
        cash = await get_or_create_cash(db, user.id)
        cash.balance = max(cash.balance - tx.total, 0)
        reversal_detail = f"Deducted {tx.total:.2f} SAR from cash"

    # ── WITHDRAW reversal ─────────────────────────────────────────────────────
    elif tx.tx_type == "WITHDRAW":
        cash = await get_or_create_cash(db, user.id)
        cash.balance += tx.total
        reversal_detail = f"Restored {tx.total:.2f} SAR to cash"

    # ── CAPITAL_INCREASE reversal ─────────────────────────────────────────────
    elif tx.tx_type == "CAPITAL_INCREASE" and tx.asset_name and tx.quantity:
        holding_result = await db.execute(
            select(Holding).where(
                Holding.user_id == user.id,
                Holding.name == tx.asset_name,
            )
        )
        holding = holding_result.scalar_one_or_none()
        if holding:
            new_qty = round(holding.quantity - tx.quantity, 10)
            if new_qty <= 1e-9:
                await db.delete(holding)
                reversal_detail = f"Removed holding {tx.asset_name} (zero remaining after reversal)"
            else:
                # Reverse: total cost stays the same, spread back over fewer shares
                total_cost = holding.quantity * holding.avg_cost
                holding.quantity = new_qty
                holding.avg_cost = total_cost / new_qty
                reversal_detail = f"Removed {tx.quantity} bonus shares from {tx.asset_name}, avg cost restored"
        else:
            reversal_detail = f"Holding {tx.asset_name} not found; only transaction record deleted"

    await db.delete(tx)
    await db.commit()

    return {"detail": f"Transaction deleted and reversed. {reversal_detail}".strip()}
