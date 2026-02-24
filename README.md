# VAULT — Personal Portfolio Manager

A full-stack FastAPI application for tracking personal investments with authentication.

## Project Structure

```
vault/
├── main.py                  # FastAPI app entry point
├── requirements.txt         # Python dependencies
├── vault.db                 # SQLite database (auto-created on first run)
│
├── app/
│   ├── database.py          # SQLAlchemy models & DB setup
│   ├── auth.py              # JWT auth, password hashing, dependencies
│   ├── schemas.py           # Pydantic request/response schemas
│   └── routers/
│       ├── auth.py          # /api/auth/* (register, login, logout, me)
│       ├── portfolio.py     # /api/portfolio/* (holdings, sell, price update)
│       └── cash.py          # /api/cash/*, /api/transactions
│
├── templates/
│   ├── login.html           # Login page
│   ├── register.html        # Registration page
│   └── dashboard.html       # Main portfolio dashboard
│
└── static/                  # Static assets (CSS/JS if separated later)
```

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. (Optional) Set environment variables

```bash
export VAULT_SECRET_KEY="your-very-long-random-secret-key-here"
export ACCESS_TOKEN_EXPIRE_MINUTES=1440   # 24 hours (default)
```

> ⚠️ **Important**: Change `VAULT_SECRET_KEY` in production! Never use the default.

### 3. Run the server

```bash
uvicorn main:app --reload
```

Open your browser at **http://localhost:8000**

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/logout` | Clear auth cookie |
| GET  | `/api/auth/me` | Get current user info |

### Portfolio
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/portfolio/summary` | Portfolio stats |
| GET  | `/api/portfolio/holdings` | List all holdings |
| POST | `/api/portfolio/holdings` | Add new holding |
| PATCH | `/api/portfolio/holdings/{id}/price` | Update current price |
| DELETE | `/api/portfolio/holdings/{id}` | Delete holding |
| POST | `/api/portfolio/sell` | Sell a position |

### Cash & Transactions
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/cash` | Get cash balance |
| POST | `/api/cash/deposit` | Deposit cash |
| POST | `/api/cash/withdraw` | Withdraw cash |
| GET  | `/api/transactions` | Transaction history |

### Interactive Docs
Visit **http://localhost:8000/docs** for the auto-generated Swagger UI.

---

## Switching to PostgreSQL

1. Install the async driver:
   ```bash
   pip install asyncpg
   ```

2. In `app/database.py`, change the `DATABASE_URL`:
   ```python
   DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5432/vault"
   ```

That's it — SQLAlchemy handles the rest.

---

## Production Deployment

```bash
# Install production server
pip install gunicorn

# Run with multiple workers
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Set these environment variables in production:
- `VAULT_SECRET_KEY` — long random string (e.g. `openssl rand -hex 32`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` — session duration in minutes

---

## Features

- ✅ User registration & login (bcrypt passwords, JWT sessions)
- ✅ HTTP-only cookie auth for browser + Bearer token for API clients
- ✅ Add investments (stocks, ETFs, crypto, alternatives, etc.)
- ✅ Automatic cost-basis averaging when buying more of same asset
- ✅ Real-time P&L (unrealized & realized)
- ✅ Sell positions → proceeds auto-added to cash balance
- ✅ Manual price updates per holding
- ✅ Deposit/withdraw cash independently
- ✅ Full transaction history
- ✅ Per-user isolated data
- ✅ SQLite by default, easy switch to PostgreSQL/MySQL
- ✅ Auto-generated API docs at `/docs`
