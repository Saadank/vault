"""
Prices router:
  GET  /api/prices/search?q=...   — search ticker on Yahoo Finance, return name + price
  POST /api/prices/refresh        — fetch live prices for all holdings, update DB, take snapshot
  GET  /api/prices/chart          — return portfolio value history for charting
  GET  /api/prices/last-updated   — when was the last auto-refresh
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional

from app.database import (
    get_db, User, Holding, CashBalance, PortfolioSnapshot, HoldingSnapshot,
    HoldingPriceHistory, BenchmarkSnapshot,
)
from app.auth import get_current_user
from app.price_service import fetch_prices_bulk, fetch_price

BENCHMARK_SYMBOL = "^GSPC"  # S&P 500

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prices", tags=["prices"])


# Yahoo's quoteType vocabulary → the app's own asset_type vocabulary.
# Stored on the holding, so it must match the words used everywhere else
# (TypeChip colors, filter pills, fetchable_types in _refresh_holding_prices).
_TYPE_MAP = {
    "EQUITY": "Stock",
    "ETF": "ETF",
    "MUTUALFUND": "Fund",
    "CRYPTOCURRENCY": "Crypto",
    "CURRENCY": "Crypto",
    "INDEX": "Stock",
    "FUTURE": "Stock",
    "OPTION": "Stock",
}


def _normalize_type(quote_type: str) -> str:
    """Map a Yahoo quoteType to the app's asset_type; default to Stock."""
    return _TYPE_MAP.get((quote_type or "").upper(), "Stock")


# ── Ticker search (fast — no price fetching, results only) ────────────────────
@router.get("/search")
async def search_ticker(
    q: str = Query(..., min_length=1, description="Ticker or company name to search"),
    user: User = Depends(get_current_user),
):
    """
    Fast search: returns symbol + name + exchange from Yahoo Finance search index.
    No per-result price fetching — use /api/prices/quote?symbol=X to get the price
    after the user selects a result.
    """
    try:
        import yfinance as yf

        def _search():
            q_upper = q.strip().upper()
            results = []
            seen = set()

            # ── 1. Yahoo Finance full-text search (fast, no price calls) ──────
            try:
                search_obj = yf.Search(q, max_results=10, news_count=0)
                quotes = search_obj.quotes if hasattr(search_obj, "quotes") else []
                for item in quotes:
                    sym = item.get("symbol", "")
                    if not sym or sym in seen:
                        continue
                    seen.add(sym)
                    results.append({
                        "symbol": sym,
                        "name": item.get("longname") or item.get("shortname") or sym,
                        "exchange": item.get("exchange", ""),
                        "type": _normalize_type(item.get("quoteType", "")),
                        "currency": item.get("currency", ""),
                    })
            except Exception:
                pass

            # ── 2. Direct ticker candidates (Saudi + crypto variants) ─────────
            # Only add if they weren't already in search results
            candidates = []
            if q_upper not in seen:
                candidates.append(q_upper)
            if q.isdigit() and f"{q_upper}.SR" not in seen:
                candidates.append(f"{q_upper}.SR")
            if "-" not in q_upper and not q.isdigit() and f"{q_upper}-USD" not in seen:
                candidates.append(f"{q_upper}-USD")

            for sym in candidates:
                if sym in seen:
                    continue
                try:
                    t = yf.Ticker(sym)
                    fi = t.fast_info
                    # Only include if the ticker actually exists (has a valid exchange)
                    exch = getattr(fi, "exchange", None)
                    if exch:
                        name = sym
                        try:
                            info = t.info
                            name = info.get("longName") or info.get("shortName") or sym
                        except Exception:
                            pass
                        seen.add(sym)
                        results.insert(0, {  # prepend direct match
                            "symbol": sym,
                            "name": name,
                            "exchange": exch,
                            "type": _normalize_type(getattr(fi, "quote_type", "")),
                            "currency": getattr(fi, "currency", ""),
                        })
                except Exception:
                    pass

            return results[:8]

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _search)
        return {"results": results}

    except ImportError:
        raise HTTPException(503, "yfinance not installed. Run: pip install yfinance")
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(500, f"Search failed: {str(e)}")


# ── Single ticker quote (called after user selects a result) ──────────────────
@router.get("/quote")
async def get_quote(
    symbol: str = Query(..., min_length=1, description="Exact Yahoo Finance ticker symbol"),
    user: User = Depends(get_current_user),
):
    """
    Fetch current price + currency for a single ticker.
    Called after the user selects a search result, so only one network call is made.
    """
    try:
        import yfinance as yf

        def _quote():
            t = yf.Ticker(symbol)
            fi = t.fast_info
            price = getattr(fi, "last_price", None) or getattr(fi, "previous_close", None)
            currency = getattr(fi, "currency", "")
            return {
                "symbol": symbol,
                "price": round(float(price), 4) if price and price > 0 else None,
                "currency": currency,
            }

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _quote)
        return result

    except ImportError:
        raise HTTPException(503, "yfinance not installed.")
    except Exception as e:
        logger.warning(f"Quote error for {symbol}: {e}")
        return {"symbol": symbol, "price": None, "currency": ""}


# ── Helper: compute current portfolio values ──────────────────────────────────
async def _compute_values(db: AsyncSession, user_id: int):
    result = await db.execute(select(Holding).where(Holding.user_id == user_id))
    holdings = result.scalars().all()
    portfolio_value = sum(h.quantity * h.current_price for h in holdings)

    cash_result = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cash = cash_result.scalar_one_or_none()
    cash_balance = cash.balance if cash else 0.0
    return portfolio_value, cash_balance


# ── Helper: take a daily portfolio snapshot ───────────────────────────────────
async def _take_snapshot(db: AsyncSession, user_id: int, overwrite: bool = True):
    """Record today's total portfolio value (YYYY-MM-DD key).
    overwrite=True (default): update existing entry (used after live price refresh).
    overwrite=False: skip if ANY snapshot for today exists — daily OR hourly.
      Rationale: hourly snapshots use YYYY-MM-DD HH keys. If one exists for today,
      the page-load must not create a YYYY-MM-DD daily entry with stale user-entered
      prices — that entry sorts BEFORE the hourly ones alphabetically and creates a
      visible spike → drop pattern in the chart.
    """
    portfolio_value, cash_balance = await _compute_values(db, user_id)
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    if not overwrite:
        any_today = await db.execute(
            select(PortfolioSnapshot).where(
                PortfolioSnapshot.user_id == user_id,
                PortfolioSnapshot.snapshot_date.like(today_str + "%"),
            ).limit(1)
        )
        if any_today.scalar_one_or_none():
            return  # hourly or daily snapshot already exists today — skip

    existing = await db.execute(
        select(PortfolioSnapshot).where(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.snapshot_date == today_str,
        )
    )
    snap = existing.scalar_one_or_none()

    if snap:
        snap.portfolio_value = round(portfolio_value, 2)
        snap.cash_balance    = round(cash_balance, 2)
        snap.total_value     = round(portfolio_value + cash_balance, 2)
    else:
        snap = PortfolioSnapshot(
            user_id=user_id,
            snapshot_date=today_str,
            portfolio_value=round(portfolio_value, 2),
            cash_balance=round(cash_balance, 2),
            total_value=round(portfolio_value + cash_balance, 2),
        )
        db.add(snap)

    await db.commit()


# ── Helper: take an hourly portfolio snapshot ─────────────────────────────────
async def _take_hourly_snapshot(db: AsyncSession, user_id: int):
    """Record an hourly snapshot (YYYY-MM-DD HH key). Overwrites the current hour's entry."""
    portfolio_value, cash_balance = await _compute_values(db, user_id)
    hour_str = datetime.utcnow().strftime("%Y-%m-%d %H")

    existing = await db.execute(
        select(PortfolioSnapshot).where(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.snapshot_date == hour_str,
        )
    )
    snap = existing.scalar_one_or_none()

    if snap:
        snap.portfolio_value = round(portfolio_value, 2)
        snap.cash_balance    = round(cash_balance, 2)
        snap.total_value     = round(portfolio_value + cash_balance, 2)
    else:
        snap = PortfolioSnapshot(
            user_id=user_id,
            snapshot_date=hour_str,
            portfolio_value=round(portfolio_value, 2),
            cash_balance=round(cash_balance, 2),
            total_value=round(portfolio_value + cash_balance, 2),
        )
        db.add(snap)

    await db.commit()


# ── Helper: take a daily holding-level snapshot ───────────────────────────────
async def _take_holding_snapshot(db: AsyncSession, user_id: int):
    """
    Record a daily snapshot of every open holding for historical allocation
    analysis and as the prior-close baseline for the daily report.

    Last-write-wins: each hourly tick UPDATES today's row to the latest price,
    so by end of day the snapshot holds that day's closing price. (The previous
    first-write-wins behaviour froze the snapshot at the day's first overnight
    tick, which made the report's "previous close" baseline wrong.)
    """
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Load today's existing rows so we can update them in place.
    existing = await db.execute(
        select(HoldingSnapshot).where(
            HoldingSnapshot.user_id == user_id,
            HoldingSnapshot.snapshot_date == today_str,
        )
    )
    existing_by_name = {r.name: r for r in existing.scalars().all()}

    result = await db.execute(
        select(Holding).where(Holding.user_id == user_id, Holding.quantity > 0)
    )
    holdings = result.scalars().all()

    for h in holdings:
        row = existing_by_name.get(h.name)
        if row is not None:
            # Overwrite with the latest price → converges to today's close.
            row.asset_type    = h.asset_type
            row.quantity      = round(h.quantity, 6)
            row.avg_cost      = round(h.avg_cost, 4)
            row.current_price = round(h.current_price, 4)
        else:
            db.add(HoldingSnapshot(
                user_id=user_id,
                snapshot_date=today_str,
                name=h.name,
                asset_type=h.asset_type,
                quantity=round(h.quantity, 6),
                avg_cost=round(h.avg_cost, 4),
                current_price=round(h.current_price, 4),
            ))

    await db.commit()


async def _record_price_history(db: AsyncSession, user_id: int):
    """
    Append-only daily close price per holding — never overwritten, unlike
    Holding.current_price and HoldingSnapshot. Insert-or-ignore per
    (holding_id, date) so re-running within the same day is a no-op.
    """
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    result = await db.execute(
        select(Holding).where(Holding.user_id == user_id, Holding.quantity > 0)
    )
    holdings = result.scalars().all()
    if not holdings:
        return

    existing = await db.execute(
        select(HoldingPriceHistory.holding_id).where(
            HoldingPriceHistory.user_id == user_id,
            HoldingPriceHistory.price_date == today_str,
        )
    )
    already = {row[0] for row in existing.all()}

    for h in holdings:
        if h.id in already:
            continue
        db.add(HoldingPriceHistory(
            user_id=user_id,
            holding_id=h.id,
            ticker=h.ticker,
            price_date=today_str,
            close_price=round(h.current_price, 4),
        ))

    await db.commit()


async def _record_benchmark_snapshot(db: AsyncSession, symbol: str = BENCHMARK_SYMBOL):
    """
    Append-only daily close for the benchmark index. Global (not per-user).
    Insert-or-ignore per (symbol, date) so the first caller in a given day
    writes it and subsequent calls that day no-op.
    """
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    existing = await db.execute(
        select(BenchmarkSnapshot).where(
            BenchmarkSnapshot.symbol == symbol,
            BenchmarkSnapshot.snapshot_date == today_str,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return

    price = await fetch_price(symbol, "stock")
    if price is None:
        logger.warning(f"[benchmark] Could not fetch price for {symbol}")
        return

    db.add(BenchmarkSnapshot(symbol=symbol, snapshot_date=today_str, close_price=round(price, 4)))
    await db.commit()


# ── Helper: fetch live prices and update holdings in DB ───────────────────────
async def _refresh_holding_prices(db: AsyncSession, user_id: int) -> dict:
    """
    Fetch latest prices from Yahoo Finance for all stock/etf/crypto holdings
    and update current_price in DB. Returns summary dict.
    """
    result = await db.execute(select(Holding).where(Holding.user_id == user_id))
    holdings = result.scalars().all()

    # "equity"/"cryptocurrency" tolerated in case a raw Yahoo quoteType ever
    # reaches the DB un-normalized — otherwise the holding's price silently freezes.
    fetchable_types = {"stock", "etf", "crypto", "equity", "cryptocurrency"}
    to_fetch = [
        (h.ticker or h.name, h.asset_type)
        for h in holdings
        if h.asset_type.lower() in fetchable_types
    ]

    updated: list = []
    skipped: list = []
    failed:  list = []

    if to_fetch:
        prices = await fetch_prices_bulk(to_fetch)

        for h in holdings:
            if h.asset_type.lower() not in fetchable_types:
                skipped.append(h.name)
                continue

            symbol = h.ticker or h.name
            new_price = prices.get(symbol)
            if new_price and new_price > 0:
                h.current_price = round(new_price, 6)
                updated.append({"name": h.name, "price": h.current_price})
            else:
                logger.warning(
                    f"[refresh] No price for '{symbol}' "
                    f"(holding='{h.name}', type={h.asset_type})"
                )
                failed.append(h.name)

        await db.commit()

    return {"updated": updated, "skipped": skipped, "failed": failed}


# ── Refresh prices ────────────────────────────────────────────────────────────
@router.post("/refresh")
async def refresh_prices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fetch latest prices from Yahoo Finance for all holdings that look like
    market tickers (Stocks, ETFs, Crypto).
    Alternative / Real Estate / Bond holdings are skipped (no ticker).
    Returns a summary of what was updated.
    """
    summary = await _refresh_holding_prices(db, user.id)

    # Always take a snapshot after refresh (captures current state)
    await _take_snapshot(db, user.id)

    # Also update this hour's chart point so a manual click is visible on the
    # chart immediately, instead of waiting for the next automatic hourly tick.
    await _take_hourly_snapshot(db, user.id)

    return {
        **summary,
        "refreshed_at": datetime.utcnow().isoformat(),
    }


# ── Chart data ────────────────────────────────────────────────────────────────
@router.get("/chart")
async def chart_data(
    range: str = Query("1M", description="1D | 1W | 1M | YTD | 1Y | Max"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Return time-series data for the portfolio value chart.
    All ranges query all available snapshots (daily YYYY-MM-DD and hourly YYYY-MM-DD HH)
    within the time window, ordered chronologically.
    """
    now = datetime.utcnow()

    if range == "1D":
        cutoff_str = (now - timedelta(hours=24)).strftime("%Y-%m-%d")
    elif range == "1W":
        cutoff_str = (now - timedelta(weeks=1)).strftime("%Y-%m-%d")
    elif range == "1M":
        cutoff_str = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    elif range == "3M":
        cutoff_str = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    elif range == "YTD":
        cutoff_str = datetime(now.year, 1, 1).strftime("%Y-%m-%d")
    elif range == "1Y":
        cutoff_str = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    else:  # Max
        cutoff_str = "2000-01-01"

    result = await db.execute(
        select(PortfolioSnapshot)
        .where(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.snapshot_date >= cutoff_str,
        )
        .order_by(PortfolioSnapshot.snapshot_date)
    )
    snapshots = result.scalars().all()
    points = [
        {"date": s.snapshot_date, "value": s.total_value, "holdings": s.portfolio_value}
        for s in snapshots
        if " " in s.snapshot_date  # hourly snapshots only (YYYY-MM-DD HH)
    ]

    # Fallback: return single current point so chart isn't empty
    if not points:
        portfolio_value, cash_balance = await _compute_values(db, user.id)
        points = [{"date": now.strftime("%Y-%m-%d"), "value": round(portfolio_value + cash_balance, 2), "holdings": round(portfolio_value, 2)}]

    return {"range": range, "points": points}


# ── Snapshot only (no price fetch) ───────────────────────────────────────────
@router.post("/snapshot")
async def take_snapshot(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Retake today's snapshot using current holdings prices + current cash balance.
    Called on page load so the chart always reflects the latest cash changes.
    Uses overwrite=False so it never replaces an existing daily snapshot with
    potentially stale user-entered prices (prevents post-buy chart spikes).
    """
    await _take_snapshot(db, user.id, overwrite=False)
    return {"ok": True}


# ── Last updated ──────────────────────────────────────────────────────────────
@router.get("/last-updated")
async def last_updated(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.user_id == user.id)
        .order_by(PortfolioSnapshot.created_at.desc())
    )
    latest = result.scalars().first()
    return {
        "last_updated": latest.created_at.isoformat() if latest else None,
        "snapshot_date": latest.snapshot_date if latest else None,
    }
