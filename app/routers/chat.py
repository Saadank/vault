"""
AI Chat router — POST /api/chat
Injects live portfolio context into the system prompt and proxies to
Claude (Anthropic) or ChatGPT (OpenAI).
"""

import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Literal
from datetime import datetime, timedelta

from app.database import get_db, User, Holding, CashBalance, Transaction, PortfolioSnapshot
from app.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: Literal["claude", "openai"] = "claude"


# ── Build portfolio context string ────────────────────────────────────────────
async def _build_context(db: AsyncSession, user_id: int) -> str:
    # Holdings
    h_result = await db.execute(select(Holding).where(Holding.user_id == user_id))
    holdings = h_result.scalars().all()

    portfolio_value = sum(h.quantity * h.current_price for h in holdings)
    total_invested  = sum(h.quantity * h.avg_cost      for h in holdings)
    unrealized_pnl  = portfolio_value - total_invested
    unrealized_pct  = (unrealized_pnl / total_invested * 100) if total_invested else 0

    # Cash
    c_result = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cash = c_result.scalar_one_or_none()
    cash_balance = cash.balance if cash else 0.0
    total_value = portfolio_value + cash_balance

    # Recent transactions (last 10)
    t_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
        .limit(10)
    )
    transactions = t_result.scalars().all()

    # Snapshot history (last 30)
    s_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.snapshot_date.desc())
        .limit(30)
    )
    snapshots = s_result.scalars().all()
    snapshots = list(reversed(snapshots))  # chronological order

    # ── Format context ────────────────────────────────────────────────────────
    lines = [
        "You are a personal investment advisor with full access to the user's live portfolio data.",
        "All monetary values are in SAR (Saudi Riyals). Be concise and reference actual numbers.",
        "",
        "## Portfolio Summary",
        f"- Total Value:      SAR {total_value:,.2f}",
        f"- Holdings Value:   SAR {portfolio_value:,.2f}",
        f"- Cash Balance:     SAR {cash_balance:,.2f}",
        f"- Total Invested:   SAR {total_invested:,.2f}",
        f"- Unrealized P&L:   SAR {unrealized_pnl:+,.2f} ({unrealized_pct:+.2f}%)",
        f"- Positions:        {len(holdings)}",
        "",
        "## Holdings",
        "| Asset | Type | Qty | Avg Cost | Current Price | Market Value | P&L | P&L% |",
        "|-------|------|-----|----------|---------------|--------------|-----|------|",
    ]

    for h in holdings:
        mv  = h.quantity * h.current_price
        cb  = h.quantity * h.avg_cost
        pnl = mv - cb
        pct = (pnl / cb * 100) if cb else 0
        ticker_label = f" ({h.ticker})" if h.ticker and h.ticker != h.name else ""
        lines.append(
            f"| {h.name}{ticker_label} | {h.asset_type} | {h.quantity:.4f} "
            f"| {h.avg_cost:,.2f} | {h.current_price:,.2f} "
            f"| {mv:,.2f} | {pnl:+,.2f} | {pct:+.2f}% |"
        )

    if transactions:
        lines += ["", "## Recent Transactions (last 10, newest first)"]
        for tx in transactions:
            detail = f"{tx.tx_type}"
            if tx.asset_name:
                detail += f" {tx.asset_name}"
            if tx.quantity and tx.price:
                detail += f" × {tx.quantity:.4f} @ SAR {tx.price:,.2f}"
            detail += f" = SAR {tx.total:,.2f}"
            if tx.realized_pnl is not None:
                detail += f" (P&L: SAR {tx.realized_pnl:+,.2f})"
            if tx.tx_date:
                detail += f" on {tx.tx_date}"
            lines.append(f"- {detail}")

    if snapshots:
        lines += ["", "## Portfolio Value History (oldest → newest)"]
        lines.append("| Date | Total Value | Holdings Value |")
        lines.append("|------|------------|----------------|")
        for s in snapshots:
            lines.append(f"| {s.snapshot_date} | SAR {s.total_value:,.2f} | SAR {s.portfolio_value:,.2f} |")

    lines += [
        "",
        f"## Current Date/Time (UTC): {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
    ]

    return "\n".join(lines)


# ── Chat endpoint ─────────────────────────────────────────────────────────────
@router.post("/")
async def chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not req.messages:
        raise HTTPException(400, "No messages provided")

    system_prompt = await _build_context(db, user.id)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    # ── Claude ────────────────────────────────────────────────────────────────
    if req.provider == "claude":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(
                503,
                "ANTHROPIC_API_KEY is not set. Add it in Railway → Variables "
                "(or your local environment) to enable Claude."
            )
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            )
            reply = response.content[0].text
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            raise HTTPException(502, f"Claude error: {str(e)}")

    # ── OpenAI ────────────────────────────────────────────────────────────────
    elif req.provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                503,
                "OPENAI_API_KEY is not set. Add it in Railway → Variables "
                "(or your local environment) to enable ChatGPT."
            )
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=1024,
                messages=[{"role": "system", "content": system_prompt}] + messages,
            )
            reply = response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise HTTPException(502, f"OpenAI error: {str(e)}")

    else:
        raise HTTPException(400, "provider must be 'claude' or 'openai'")

    return {"reply": reply, "provider": req.provider}
