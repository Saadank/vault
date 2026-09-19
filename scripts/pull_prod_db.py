"""
Pull the Railway production PostgreSQL database into the local SQLite vault.db.

Usage (from the vault/ directory):
    python scripts/pull_prod_db.py

Reads the source connection string from the PROD_DATABASE_URL env var (or .env).
Use Railway's *public* URL (Postgres service → Variables → DATABASE_PUBLIC_URL),
since the internal `postgres.railway.internal` host is only reachable from
inside Railway.

What it does:
  1. Backs up the existing ./vault.db to ./vault.db.bak-<timestamp>
  2. Creates a fresh ./vault.db with the current schema (Base.metadata)
  3. Copies every row from every model table, preserving primary keys
"""

import asyncio
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Make `app` importable when run as scripts/pull_prod_db.py
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from dotenv import load_dotenv
load_dotenv()

# Force the app's engine to point at the local SQLite file regardless of .env
os.environ.pop("DATABASE_URL", None)

import asyncpg
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.database import (
    Base, User, CashBalance, Holding, Transaction, PortfolioSnapshot,
    HoldingSnapshot, HoldingPriceHistory, BenchmarkSnapshot,
)

# Parent tables first so foreign keys resolve
TABLES = [
    User, CashBalance, Holding, Transaction, PortfolioSnapshot,
    HoldingSnapshot, HoldingPriceHistory, BenchmarkSnapshot,
]

LOCAL_DB = ROOT / "vault.db"


def _pg_url() -> str:
    url = os.environ.get("PROD_DATABASE_URL", "").strip()
    if not url:
        sys.exit(
            "PROD_DATABASE_URL is not set.\n"
            "Add it to .env (Railway → Postgres service → Variables → DATABASE_PUBLIC_URL) "
            "or pass it inline: PROD_DATABASE_URL=postgresql://... python scripts/pull_prod_db.py"
        )
    if "railway.internal" in url:
        sys.exit("That is Railway's internal URL — use DATABASE_PUBLIC_URL instead.")
    # asyncpg wants a plain postgresql:// scheme
    return url.replace("postgres://", "postgresql://", 1).split("+asyncpg")[0]


async def main() -> None:
    pg_url = _pg_url()

    print("Connecting to Railway Postgres…")
    pg = await asyncpg.connect(pg_url)

    # Pull everything first so we never touch the local file if prod is unreachable
    rows_by_table: dict[str, list[dict]] = {}
    for model in TABLES:
        name = model.__tablename__
        cols = [c.name for c in model.__table__.columns]
        try:
            recs = await pg.fetch(f'SELECT {", ".join(cols)} FROM {name} ORDER BY id')
        except asyncpg.UndefinedTableError:
            print(f"  {name:24s} (missing in prod, skipping)")
            rows_by_table[name] = []
            continue
        except asyncpg.UndefinedColumnError:
            # Prod may lag the local schema; fall back to whatever columns exist
            recs = await pg.fetch(f"SELECT * FROM {name} ORDER BY id")
        rows_by_table[name] = [dict(r) for r in recs]
        print(f"  {name:24s} {len(recs):>6} rows")
    await pg.close()

    # Back up and rebuild the local SQLite file
    if LOCAL_DB.exists():
        bak = LOCAL_DB.with_name(f"vault.db.bak-{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(LOCAL_DB, bak)
        print(f"\nBacked up local DB → {bak.name}")
        LOCAL_DB.unlink()

    engine = create_async_engine(f"sqlite+aiosqlite:///{LOCAL_DB.as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for model in TABLES:
            rows = rows_by_table[model.__tablename__]
            if not rows:
                continue
            valid = {c.name for c in model.__table__.columns}
            rows = [{k: v for k, v in r.items() if k in valid} for r in rows]
            # Chunk to stay under SQLite's bound-parameter limit
            for i in range(0, len(rows), 500):
                await conn.execute(insert(model.__table__), rows[i:i + 500])
        # Sanity check
        n_users = (await conn.execute(text("SELECT COUNT(*) FROM users"))).scalar()
    await engine.dispose()

    total = sum(len(v) for v in rows_by_table.values())
    print(f"\nDone. Wrote {total} rows into {LOCAL_DB.name} ({n_users} users).")
    print("Start the app normally — it reads ./vault.db when DATABASE_URL is unset.")


if __name__ == "__main__":
    asyncio.run(main())
