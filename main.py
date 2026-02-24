"""
VAULT — Personal Portfolio Manager
FastAPI entry point.

Run with:
    uvicorn main:app --reload

Or in production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Ensure static directory exists (Railway/Docker may not have it)
os.makedirs("static", exist_ok=True)

from app.database import init_db
from app.auth import get_current_user_optional
from app.routers import auth, portfolio, cash, prices

# Show INFO logs from our app modules in the uvicorn console
logging.basicConfig(level=logging.INFO)
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()          # create tables on startup
    yield


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
