"""
Reports router — the daily report as a live page plus its per-day archive.

  GET  /api/reports/live          → today's report computed right now (not saved)
  GET  /api/reports               → archived days, newest first (summary only)
  GET  /api/reports/{YYYY-MM-DD}  → one archived day, full payload
  POST /api/reports/save          → archive today's report now
"""

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import DailyReport, User, get_db
from app.report_service import build_live_report, save_daily_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.get("/live")
async def live_report(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_live_report(db, user.id)


@router.get("")
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(
            DailyReport.report_date,
            DailyReport.total_value,
            DailyReport.day_change_sar,
            DailyReport.day_change_pct,
            DailyReport.movers_count,
            DailyReport.updated_at,
        )
        .where(DailyReport.user_id == user.id)
        .order_by(DailyReport.report_date.desc())
    )
    return [
        {
            "report_date":    r.report_date,
            "total_value":    r.total_value,
            "day_change_sar": r.day_change_sar,
            "day_change_pct": r.day_change_pct,
            "movers_count":   r.movers_count,
            "updated_at":     r.updated_at.isoformat() + "Z" if r.updated_at else None,
        }
        for r in res.all()
    ]


@router.post("/save")
async def save_report(user: User = Depends(get_current_user)):
    payload = await save_daily_report(user.id)
    return {"status": "saved", "report_date": payload["report_date"] if payload else None}


@router.get("/{report_date}")
async def get_report(
    report_date: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _ISO_DATE.match(report_date):
        raise HTTPException(400, "Date must be YYYY-MM-DD")
    res = await db.execute(
        select(DailyReport).where(
            DailyReport.user_id == user.id,
            DailyReport.report_date == report_date,
        )
    )
    row = res.scalar_one_or_none()
    if not row:
        raise HTTPException(404, f"No report saved for {report_date}")
    return json.loads(row.payload)
