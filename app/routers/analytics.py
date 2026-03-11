"""
Analytics router — 6 endpoints powering the /analytics dashboard page.
All data is computed on-the-fly from existing tables (no separate warehouse needed).
"""

from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, User, Holding, Transaction, CashBalance, PortfolioSnapshot, HoldingSnapshot
from app.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Helper ────────────────────────────────────────────────────────────────────
def _month(date_str: str) -> str:
    """Extract YYYY-MM from a date string (YYYY-MM-DD or YYYY-MM-DD HH)."""
    return date_str[:7] if date_str else ""


# ── 1. Overview KPIs ──────────────────────────────────────────────────────────
@router.get("/overview")
async def analytics_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Portfolio snapshots for return metrics (daily only: 10-char dates)
    snap_result = await db.execute(
        select(PortfolioSnapshot)
        .where(
            PortfolioSnapshot.user_id == user.id,
            func.length(PortfolioSnapshot.snapshot_date) == 10,
        )
        .order_by(PortfolioSnapshot.snapshot_date)
    )
    snaps = [s for s in snap_result.scalars().all() if s is not None]

    # All SELL transactions for win rate
    sell_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "SELL",
            Transaction.realized_pnl.is_not(None),
        )
    )
    sells = sell_result.scalars().all()

    # Cash flow totals
    tx_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type.in_(["DEPOSIT", "WITHDRAW"]),
        )
    )
    cash_txs = tx_result.scalars().all()

    total_deposited = sum(t.total for t in cash_txs if t.tx_type == "DEPOSIT")
    total_withdrawn = sum(t.total for t in cash_txs if t.tx_type == "WITHDRAW")

    # Return metrics
    first_value = snaps[0].total_value if snaps else None
    current_value = snaps[-1].total_value if snaps else None
    peak_value = max((s.total_value for s in snaps), default=0.0)
    current_drawdown_pct = 0.0
    total_return_sar = 0.0
    total_return_pct = 0.0

    if first_value and first_value > 0 and current_value is not None:
        total_return_sar = round(current_value - first_value, 2)
        total_return_pct = round((current_value - first_value) / first_value * 100, 2)
    if peak_value > 0 and current_value is not None:
        current_drawdown_pct = round((current_value - peak_value) / peak_value * 100, 2)

    # Best/worst month (group daily snapshots by month, take last value per month)
    monthly: dict[str, float] = {}
    for s in snaps:
        m = _month(s.snapshot_date)
        if m:
            monthly[m] = s.total_value  # last snapshot of month wins

    sorted_months = sorted(monthly.keys())
    best_month = {"month": None, "return_pct": 0.0}
    worst_month = {"month": None, "return_pct": 0.0}
    if len(sorted_months) >= 2:
        returns = []
        for i in range(1, len(sorted_months)):
            prev = monthly[sorted_months[i - 1]]
            curr = monthly[sorted_months[i]]
            if prev > 0:
                r = (curr - prev) / prev * 100
                returns.append((sorted_months[i], round(r, 2)))
        if returns:
            best = max(returns, key=lambda x: x[1])
            worst = min(returns, key=lambda x: x[1])
            best_month = {"month": best[0], "return_pct": best[1]}
            worst_month = {"month": worst[0], "return_pct": worst[1]}

    # Win rate
    wins = [s for s in sells if (s.realized_pnl or 0) > 0]
    win_rate_pct = round(len(wins) / len(sells) * 100, 1) if sells else 0.0

    return {
        "total_return_pct": total_return_pct,
        "total_return_sar": total_return_sar,
        "peak_value": round(peak_value, 2),
        "current_drawdown_pct": current_drawdown_pct,
        "best_month": best_month,
        "worst_month": worst_month,
        "total_deposited": round(total_deposited, 2),
        "total_withdrawn": round(total_withdrawn, 2),
        "win_rate_pct": win_rate_pct,
    }


# ── 2. Allocation ─────────────────────────────────────────────────────────────
@router.get("/allocation")
async def analytics_allocation(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Current holdings
    h_result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.quantity > 0)
    )
    holdings = h_result.scalars().all()

    total_value = sum(h.quantity * h.current_price for h in holdings)

    current = [
        {
            "name": h.name,
            "asset_type": h.asset_type,
            "value": round(h.quantity * h.current_price, 2),
            "pct": round(h.quantity * h.current_price / total_value * 100, 2) if total_value else 0,
        }
        for h in sorted(holdings, key=lambda x: x.quantity * x.current_price, reverse=True)
    ]

    # By type (current)
    type_map: dict[str, float] = defaultdict(float)
    for h in holdings:
        type_map[h.asset_type] += h.quantity * h.current_price
    by_type = [
        {
            "asset_type": t,
            "value": round(v, 2),
            "pct": round(v / total_value * 100, 2) if total_value else 0,
        }
        for t, v in sorted(type_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # Historical by month from holding_snapshots
    # Wrapped in try/except: if the table doesn't exist yet (Railway first-deploy
    # race), the current-holdings donut still renders; history shows empty state.
    try:
        hs_result = await db.execute(
            select(HoldingSnapshot)
            .where(HoldingSnapshot.user_id == user.id)
            .order_by(HoldingSnapshot.snapshot_date)
        )
        hs_rows = [r for r in hs_result.scalars().all() if r is not None]
    except Exception:
        hs_rows = []

    # Group: {month: {asset_type: total_value}}
    hist_map: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in hs_rows:
        m = _month(r.snapshot_date)
        if m:
            hist_map[m][r.asset_type] += r.quantity * r.current_price

    history = [
        {"month": m, **{t: round(v, 2) for t, v in types.items()}}
        for m, types in sorted(hist_map.items())
    ]

    # Collect all unique asset types for chart legend
    all_types = sorted({r.asset_type for r in hs_rows} | set(type_map.keys()))

    return {
        "current": current,
        "by_type": by_type,
        "history": history,
        "all_types": all_types,
    }


# ── 3. P&L Analysis ───────────────────────────────────────────────────────────
@router.get("/pnl")
async def analytics_pnl(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Realized P&L from SELL transactions grouped by asset
    sell_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "SELL",
        )
    )
    sells = sell_result.scalars().all()

    # BUY transactions to compute cost basis per asset
    buy_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "BUY",
        )
    )
    buys = buy_result.scalars().all()

    # Realized P&L per asset name
    realized_map: dict[str, float] = defaultdict(float)
    for s in sells:
        if s.asset_name and s.realized_pnl is not None:
            realized_map[s.asset_name] += s.realized_pnl

    # Total cost basis per asset from BUY transactions
    cost_map: dict[str, float] = defaultdict(float)
    for b in buys:
        if b.asset_name:
            cost_map[b.asset_name] += b.total

    # Current holdings for unrealized P&L
    h_result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.quantity > 0)
    )
    holdings = h_result.scalars().all()

    unrealized_map: dict[str, float] = {}
    for h in holdings:
        unrealized_map[h.name] = round(h.quantity * (h.current_price - h.avg_cost), 2)

    # Combine all asset names
    all_names = set(realized_map.keys()) | set(unrealized_map.keys())
    by_asset = []
    for name in all_names:
        realized = round(realized_map.get(name, 0.0), 2)
        unrealized = round(unrealized_map.get(name, 0.0), 2)
        total = round(realized + unrealized, 2)
        cost = cost_map.get(name, 0.0)
        return_pct = round(total / cost * 100, 2) if cost > 0 else 0.0
        by_asset.append({
            "name": name,
            "realized": realized,
            "unrealized": unrealized,
            "total": total,
            "return_pct": return_pct,
        })

    by_asset.sort(key=lambda x: x["total"], reverse=True)

    # Summary
    total_realized = round(sum(realized_map.values()), 2)
    total_unrealized = round(sum(unrealized_map.values()), 2)
    wins = [s for s in sells if (s.realized_pnl or 0) > 0]
    losses = [s for s in sells if (s.realized_pnl or 0) < 0]
    win_rate_pct = round(len(wins) / len(sells) * 100, 1) if sells else 0.0
    avg_win = round(sum(s.realized_pnl for s in wins) / len(wins), 2) if wins else 0.0
    avg_loss = round(sum(s.realized_pnl for s in losses) / len(losses), 2) if losses else 0.0

    return {
        "summary": {
            "total_realized": total_realized,
            "total_unrealized": total_unrealized,
            "win_rate_pct": win_rate_pct,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "total_sells": len(sells),
            "winning_sells": len(wins),
        },
        "by_asset": by_asset,
    }


# ── 4. Transaction Activity ───────────────────────────────────────────────────
@router.get("/transactions")
async def analytics_transactions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type.in_(["BUY", "SELL"]),
        ).order_by(Transaction.tx_date)
    )
    txs = result.scalars().all()

    # Monthly aggregation
    monthly_map: dict[str, dict] = defaultdict(lambda: {
        "buy_count": 0, "sell_count": 0,
        "buy_volume": 0.0, "sell_volume": 0.0,
    })
    asset_trade_map: dict[str, dict] = defaultdict(lambda: {"buy_count": 0, "sell_count": 0})

    for t in txs:
        m = _month(t.tx_date or (t.created_at.strftime("%Y-%m-%d") if t.created_at else ""))
        if not m:
            continue
        if t.tx_type == "BUY":
            monthly_map[m]["buy_count"] += 1
            monthly_map[m]["buy_volume"] += t.total or 0
        else:
            monthly_map[m]["sell_count"] += 1
            monthly_map[m]["sell_volume"] += t.total or 0

        if t.asset_name:
            if t.tx_type == "BUY":
                asset_trade_map[t.asset_name]["buy_count"] += 1
            else:
                asset_trade_map[t.asset_name]["sell_count"] += 1

    monthly = [
        {
            "month": m,
            "buy_count": v["buy_count"],
            "sell_count": v["sell_count"],
            "buy_volume": round(v["buy_volume"], 2),
            "sell_volume": round(v["sell_volume"], 2),
        }
        for m, v in sorted(monthly_map.items())
    ]

    most_traded = sorted(
        [{"name": n, **c} for n, c in asset_trade_map.items()],
        key=lambda x: x["buy_count"] + x["sell_count"],
        reverse=True,
    )[:10]

    return {"monthly": monthly, "most_traded": most_traded}


# ── 5. Cash Flow ──────────────────────────────────────────────────────────────
@router.get("/cashflow")
async def analytics_cashflow(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type.in_(["DEPOSIT", "WITHDRAW"]),
        ).order_by(Transaction.tx_date)
    )
    txs = result.scalars().all()

    monthly_map: dict[str, dict] = defaultdict(lambda: {"deposited": 0.0, "withdrawn": 0.0})
    for t in txs:
        m = _month(t.tx_date or (t.created_at.strftime("%Y-%m-%d") if t.created_at else ""))
        if not m:
            continue
        if t.tx_type == "DEPOSIT":
            monthly_map[m]["deposited"] += t.total or 0
        else:
            monthly_map[m]["withdrawn"] += t.total or 0

    monthly = [
        {
            "month": m,
            "deposited": round(v["deposited"], 2),
            "withdrawn": round(v["withdrawn"], 2),
            "net": round(v["deposited"] - v["withdrawn"], 2),
        }
        for m, v in sorted(monthly_map.items())
    ]

    total_deposited = round(sum(v["deposited"] for v in monthly_map.values()), 2)
    total_withdrawn = round(sum(v["withdrawn"] for v in monthly_map.values()), 2)
    net_injected = round(total_deposited - total_withdrawn, 2)

    # Cash utilization: (net_injected - current_cash) / net_injected * 100
    cash_result = await db.execute(
        select(CashBalance).where(CashBalance.user_id == user.id)
    )
    cash = cash_result.scalar_one_or_none()
    current_cash = cash.balance if cash else 0.0
    utilization_pct = 0.0
    if net_injected > 0:
        utilization_pct = round((net_injected - current_cash) / net_injected * 100, 1)
        utilization_pct = max(0.0, min(100.0, utilization_pct))

    return {
        "summary": {
            "total_deposited": total_deposited,
            "total_withdrawn": total_withdrawn,
            "net_injected": net_injected,
            "current_cash": round(current_cash, 2),
            "utilization_pct": utilization_pct,
        },
        "monthly": monthly,
    }


# ── 6. Asset Scoreboard ───────────────────────────────────────────────────────
@router.get("/scoreboard")
async def analytics_scoreboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Current open holdings
    h_result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.quantity > 0)
    )
    open_holdings = {h.name: h for h in h_result.scalars().all()}

    # All BUY transactions (for first_bought date + cost basis)
    buy_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "BUY",
            Transaction.asset_name.is_not(None),
        ).order_by(Transaction.tx_date)
    )
    buys = buy_result.scalars().all()

    # All SELL transactions (for realized P&L)
    sell_result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.tx_type == "SELL",
            Transaction.asset_name.is_not(None),
        )
    )
    sells = sell_result.scalars().all()

    # Build per-asset data
    first_bought: dict[str, str] = {}
    total_invested: dict[str, float] = defaultdict(float)
    asset_type_map: dict[str, str] = {}

    for b in buys:
        name = b.asset_name
        if name not in first_bought and b.tx_date:
            first_bought[name] = b.tx_date
        total_invested[name] += b.total or 0

    realized_pnl_map: dict[str, float] = defaultdict(float)
    for s in sells:
        if s.realized_pnl is not None:
            realized_pnl_map[s.asset_name] += s.realized_pnl

    # Asset types from open holdings first, fallback to "—"
    for h in open_holdings.values():
        asset_type_map[h.name] = h.asset_type

    # All unique asset names ever traded
    all_names = set(total_invested.keys())

    rows = []
    for name in all_names:
        is_open = name in open_holdings
        h = open_holdings.get(name)
        realized = round(realized_pnl_map.get(name, 0.0), 2)
        unrealized = round(h.quantity * (h.current_price - h.avg_cost), 2) if h else 0.0
        market_value = round(h.quantity * h.current_price, 2) if h else 0.0
        invested = round(total_invested.get(name, 0.0), 2)
        total_pnl = round(realized + unrealized, 2)
        return_pct = round(total_pnl / invested * 100, 2) if invested > 0 else 0.0

        rows.append({
            "name": name,
            "asset_type": asset_type_map.get(name, h.asset_type if h else "—"),
            "status": "open" if is_open else "closed",
            "invested": invested,
            "market_value": market_value,
            "realized_pnl": realized,
            "unrealized_pnl": unrealized,
            "total_pnl": total_pnl,
            "return_pct": return_pct,
            "first_bought": first_bought.get(name),
        })

    rows.sort(key=lambda x: x["total_pnl"], reverse=True)
    return rows
