"""
VAULT — Personal Portfolio Manager
FastAPI entry point.

Run with:
    uvicorn main:app --reload

Or in production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
load_dotenv()  # loads .env locally; no-op on Railway where env vars are set directly
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Ensure static directory exists (Railway/Docker may not have it)
os.makedirs("static", exist_ok=True)

from app.database import init_db, SessionLocal, User
from app.auth import get_current_user_optional
from app.routers import auth, portfolio, cash, prices, chat, analytics
from app.routers.prices import _take_hourly_snapshot, _refresh_holding_prices, _take_holding_snapshot
from sqlalchemy import select

# Show INFO logs from our app modules in the uvicorn console
logging.basicConfig(level=logging.INFO)
logging.getLogger("app").setLevel(logging.INFO)
logger = logging.getLogger(__name__)


async def _hourly_snapshot_loop():
    """Background task: take an hourly snapshot for every user."""
    while True:
        await asyncio.sleep(3600)  # wait 1 hour
        try:
            async with SessionLocal() as db:
                result = await db.execute(select(User))
                users = result.scalars().all()
                for user in users:
                    try:
                        await _refresh_holding_prices(db, user.id)
                        await _take_hourly_snapshot(db, user.id)
                        await _take_holding_snapshot(db, user.id)
                    except Exception as e:
                        logger.warning(f"Hourly snapshot failed for user {user.id}: {e}")
        except Exception as e:
            logger.error(f"Hourly snapshot loop error: {e}")


async def _daily_report_loop():
    """Background task: send portfolio report at 11:55 on Sun–Fri (Asia/Riyadh by default)."""
    from app.report_service import send_daily_report

    tz = ZoneInfo(os.getenv("REPORT_TZ", "Asia/Riyadh"))

    while True:
        now    = datetime.now(tz)
        target = now.replace(hour=23, minute=55, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)

        # Skip Saturday (Python weekday: Mon=0 … Sat=5, Sun=6)
        while target.weekday() == 5:
            target += timedelta(days=1)

        sleep_secs = (target - now).total_seconds()
        logger.info(f"Next daily report scheduled at {target.strftime('%Y-%m-%d %H:%M %Z')}")
        await asyncio.sleep(sleep_secs)

        try:
            async with SessionLocal() as db:
                result = await db.execute(select(User))
                users = result.scalars().all()
            for user in users:
                try:
                    await send_daily_report(user.id)
                except Exception as e:
                    logger.warning(f"Daily report failed for user {user.id}: {e}")
        except Exception as e:
            logger.error(f"Daily report loop error: {e}")

        await asyncio.sleep(70)  # guard against double-trigger within same minute


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()          # create tables on startup
    task1 = asyncio.create_task(_hourly_snapshot_loop())
    task2 = asyncio.create_task(_daily_report_loop())
    yield
    task1.cancel()
    task2.cancel()
    for t in (task1, task2):
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="VAULT — Portfolio Manager",
    description="Personal investment tracking API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Static files & templates ──────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ── API routers ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(portfolio.router)
app.include_router(cash.router)
app.include_router(prices.router)
app.include_router(chat.router)
app.include_router(analytics.router)


# ── Page routes ───────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def root(request: Request, user=Depends(get_current_user_optional)):
    if user:
        return RedirectResponse("/dashboard")
    return RedirectResponse("/login")


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, user=Depends(get_current_user_optional)):
    if user:
        return RedirectResponse("/dashboard")
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request, user=Depends(get_current_user_optional)):
    if user:
        return RedirectResponse("/dashboard")
    return templates.TemplateResponse("register.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, user=Depends(get_current_user_optional)):
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request, user=Depends(get_current_user_optional)):
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse("analytics.html", {"request": request, "user": user})
