// VAULT — API data loader.
// Fetches from the real FastAPI backend and assembles the VAULT_DATA structure
// expected by all React components.

(function () {
  const FX = 3.75; // SAR per USD

  // ── Formatting helpers (always available, even before data loads) ────────────
  function fmtSAR(n, opts = {}) {
    const { sign = false, decimals = 2 } = opts;
    if (n === null || n === undefined) return "—";
    const abs = Math.abs(n);
    const s = abs.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const prefix = n < 0 ? "−" : sign ? "+" : "";
    return prefix + s;
  }
  function fmtPct(n, opts = {}) {
    const { sign = true, decimals = 2 } = opts;
    if (n === null || n === undefined) return "—";
    const prefix = sign ? (n > 0 ? "+" : n < 0 ? "−" : "") : (n < 0 ? "−" : "");
    return prefix + Math.abs(n).toFixed(decimals) + "%";
  }
  function fmtUSD(n) {
    if (n === null || n === undefined) return "—";
    return Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  function fmtCompact(n) {
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return Math.round(n).toString();
  }

  // ── Snapshot time helpers ─────────────────────────────────────────────────────
  // The backend keys hourly snapshots as "YYYY-MM-DD HH" in **UTC**
  // (datetime.utcnow()). Parse them as UTC so the browser shows them in the
  // viewer's local time (e.g. "2026-11-09 09" UTC → 12:00 in Riyadh).
  // Date-only keys ("YYYY-MM-DD") are calendar days — keep them at local midnight.
  function snapTime(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}))?/);
    if (!m) return null;
    return m[4] !== undefined
      ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]))
      : new Date(+m[1], +m[2] - 1, +m[3]);
  }
  // Local calendar day "YYYY-MM-DD" for a snapshot key.
  function snapLocalDay(s) {
    const d = snapTime(s);
    if (!d) return String(s || "").slice(0, 10);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // Human label: "9 Nov 2026, 12:00" for hourly keys, "9 Nov 2026" for daily ones.
  function fmtSnap(s) {
    const d = snapTime(s);
    if (!d) return String(s || "");
    const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (!/[ T]\d/.test(String(s))) return day;
    return day + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  // Keep the points inside a time range ending now. Time-based (not point
  // counts), because chart points are hourly.
  function filterByRange(points, range) {
    if (!points || points.length === 0) return [];
    if (range === "Max") return points;
    const now = new Date();
    const cutoff = new Date(now);
    if      (range === "1D")  cutoff.setHours(now.getHours() - 24);
    else if (range === "1W")  cutoff.setDate(now.getDate() - 7);
    else if (range === "1M")  cutoff.setMonth(now.getMonth() - 1);
    else if (range === "3M")  cutoff.setMonth(now.getMonth() - 3);
    else if (range === "YTD") { cutoff.setMonth(0, 1); cutoff.setHours(0, 0, 0, 0); }
    else if (range === "1Y")  cutoff.setFullYear(now.getFullYear() - 1);
    const filtered = points.filter(p => { const t = snapTime(p.date); return t && t >= cutoff; });
    return filtered.length > 1 ? filtered : points.slice(-2);
  }
  const time = { snapTime, snapLocalDay, fmtSnap, filterByRange };

  const fmt = { SAR: fmtSAR, USD: fmtUSD, PCT: fmtPct, COMPACT: fmtCompact };

  // ── API helper ───────────────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const r = await fetch(path, { credentials: "include", ...opts });
    if (!r.ok) {
      const msg = await r.json().catch(() => ({}));
      throw new Error(msg.detail || `${r.status} — ${path}`);
    }
    return r.json();
  }

  // ── Main loader — call this after login to populate window.VAULT_DATA ────────
  async function loadVaultData() {
    const [
      userRaw,
      summaryRaw,
      holdingsRaw,
      txRaw,
      chartRaw,
      overviewRaw,
      allocRaw,
      pnlRaw,
      txActivityRaw,
      cashflowRaw,
      scoreboardRaw,
      lastUpdatedRaw,
      performanceRaw,
    ] = await Promise.all([
      apiFetch("/api/auth/me"),
      apiFetch("/api/portfolio/summary"),
      apiFetch("/api/portfolio/holdings"),
      apiFetch("/api/transactions?limit=200"),
      apiFetch("/api/prices/chart?range=Max").then(r => r.points || r || []).catch(() => []),
      apiFetch("/api/analytics/overview").catch(() => ({})),
      apiFetch("/api/analytics/allocation").catch(() => ({
        current: [], by_type: [], history: [], all_types: [],
      })),
      apiFetch("/api/analytics/pnl").catch(() => ({ summary: {}, by_asset: [] })),
      apiFetch("/api/analytics/transactions").catch(() => ({ monthly: [], most_traded: [] })),
      apiFetch("/api/analytics/cashflow").catch(() => ({ summary: {}, monthly: [] })),
      apiFetch("/api/analytics/scoreboard").catch(() => []),
      apiFetch("/api/prices/last-updated").catch(() => ({ last_updated: null, snapshot_date: null })),
      apiFetch("/api/analytics/performance").catch(() => ({
        twr_start_date: null,
        twr_start_reason: null,
        twr_cumulative_return_pct: null,
        unrealized_pnl: null,
        realized_pnl: null,
        net_pnl: null,
        geo_classifications_heuristic: true,
        series: [],
        metric_descriptions: {},
      })),
    ]);

    // ── Holdings: add client-side computed fields ────────────────────────────
    // All prices in DB are stored in SAR (converted at buy time). No FX needed here.
    const holdings = holdingsRaw.map(h => {
      const market_value_sar   = h.quantity * h.current_price;
      const cost_basis_sar     = h.quantity * h.avg_cost;
      const unrealized_pnl_sar = market_value_sar - cost_basis_sar;
      const unrealized_pct     = cost_basis_sar > 0
        ? (unrealized_pnl_sar / cost_basis_sar) * 100 : 0;
      return {
        ...h,
        currency: "SAR",                       // DB always stores SAR
        sector: h.sector || h.asset_type,
        market_value_sar,
        cost_basis_sar,
        unrealized_pnl_sar,
        unrealized_pct,
        market_value_usd: market_value_sar / FX,
      };
    });

    // ── Summary: add total_value & day-change ────────────────────────────────
    const summary = {
      ...summaryRaw,
      total_value: (summaryRaw.portfolio_value || 0) + (summaryRaw.cash_balance || 0),
      day_change_sar: 0,
      day_change_pct: 0,
    };

    // Derive "today's change" as latest value vs the previous session's close.
    // (Comparing the last two hourly snapshots gave a near-zero number that
    //  looked static — an hourly gap is tiny. Anchor to the prior day instead.)
    if (Array.isArray(chartRaw) && chartRaw.length >= 2) {
      const lastPt  = chartRaw[chartRaw.length - 1];
      const curr    = lastPt?.value || summary.total_value;
      // Compare by the viewer's local day, not the UTC day in the key.
      const currDay = snapLocalDay(lastPt?.date);
      let baseline  = null;
      for (let i = chartRaw.length - 2; i >= 0; i--) {
        if (snapLocalDay(chartRaw[i].date) < currDay) { baseline = chartRaw[i].value; break; }
      }
      if (baseline == null) baseline = chartRaw[0]?.value || 0;   // all same day → first point of the day
      summary.day_change_sar = curr - baseline;
      summary.day_change_pct = baseline > 0 ? ((curr - baseline) / baseline) * 100 : 0;
    }

    // ── Chart: use real snapshots; generate minimal fallback if empty ─────────
    let chart = Array.isArray(chartRaw) && chartRaw.length > 1 ? chartRaw : null;
    if (!chart) {
      const points = [];
      const today  = new Date();
      const base   = summary.total_value * 0.82;
      for (let i = 365; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const v = base + (summary.total_value - base) * ((365 - i) / 365);
        points.push({ date: d.toISOString().slice(0, 10), value: Math.round(v) });
      }
      chart = points;
    }

    // ── Transactions ─────────────────────────────────────────────────────────
    const transactions = (txRaw || []).map(t => ({
      ...t,
      tx_date: t.tx_date || (t.created_at ? t.created_at.slice(0, 10) : ""),
    }));

    // ── Allocation: reshape history into {months, types} for StackedBars ────
    const allTypes = allocRaw.all_types || [];
    const allocation = {
      current: allocRaw.current || [],
      by_type: allocRaw.by_type || [],
      history: {
        months: (allocRaw.history || []).map(row => ({ ...row })),
        types: allTypes,
      },
    };

    // ── P&L: enrich by_asset with asset_type ─────────────────────────────────
    // Open positions come from holdings; closed ones from the scoreboard, which
    // resolves them server-side from snapshot history (was: everything → "Stock").
    const typeMap = {};
    (scoreboardRaw || []).forEach(s => { typeMap[s.name] = s.asset_type; });
    holdings.forEach(h => { typeMap[h.name] = h.asset_type; });
    const pnl = {
      summary: pnlRaw.summary || {},
      by_asset: (pnlRaw.by_asset || []).map(row => ({
        ...row,
        asset_type: typeMap[row.name] || "Other",
      })),
    };

    // ── Overview: safe fallbacks ──────────────────────────────────────────────
    // total_return_pct is the deposit-adjusted TWR and total_return_sar is net
    // trade P&L — the same figures /performance reports, so the page agrees
    // with itself. null (not 0) when there isn't enough history yet.
    const overview = {
      total_return_pct:     overviewRaw.total_return_pct     ?? null,
      total_return_sar:     overviewRaw.total_return_sar     ?? ((summary.unrealized_pnl || 0) + (summary.realized_pnl || 0)),
      twr_start_date:       overviewRaw.twr_start_date       || null,
      current_value:        overviewRaw.current_value        ?? summary.total_value,
      peak_value:           overviewRaw.peak_value           || summary.total_value,
      current_drawdown_pct: overviewRaw.current_drawdown_pct || 0,
      best_month:           overviewRaw.best_month           || { month: null, return_pct: 0 },
      worst_month:          overviewRaw.worst_month          || { month: null, return_pct: 0 },
      total_deposited:      overviewRaw.total_deposited      || 0,
      total_withdrawn:      overviewRaw.total_withdrawn      || 0,
      win_rate_pct:         overviewRaw.win_rate_pct         ?? pnl.summary.win_rate_pct ?? 0,
      winning_sells:        overviewRaw.winning_sells        ?? pnl.summary.winning_sells ?? 0,
      total_sells:          overviewRaw.total_sells          ?? pnl.summary.total_sells ?? 0,
      avg_win:              overviewRaw.avg_win              ?? pnl.summary.avg_win ?? 0,
      avg_loss:             overviewRaw.avg_loss             ?? pnl.summary.avg_loss ?? 0,
    };

    // ── Assemble & publish ────────────────────────────────────────────────────
    window.VAULT_DATA = {
      user: userRaw,
      holdings,
      summary,
      chart,
      transactions,
      allocation,
      overview,
      pnl,
      monthlyTx: txActivityRaw.monthly || [],
      mostTraded: txActivityRaw.most_traded || [],
      cashflow: {
        summary: cashflowRaw.summary || {},
        monthly:  cashflowRaw.monthly  || [],
      },
      scoreboard: scoreboardRaw || [],
      lastUpdated: lastUpdatedRaw.last_updated || null,
      performance: {
        twr_start_date:            performanceRaw.twr_start_date            || null,
        twr_start_reason:          performanceRaw.twr_start_reason          || null,
        twr_excluded_days:         performanceRaw.twr_excluded_days         || [],
        twr_cumulative_return_pct: performanceRaw.twr_cumulative_return_pct ?? null,
        unrealized_pnl:            performanceRaw.unrealized_pnl            ?? null,
        realized_pnl:              performanceRaw.realized_pnl              ?? null,
        net_pnl:                   performanceRaw.net_pnl                   ?? null,
        geo_heuristic:             performanceRaw.geo_classifications_heuristic ?? true,
        series:                    performanceRaw.series                    || [],
        monthly:                   performanceRaw.monthly                   || [],
        metric_descriptions:       performanceRaw.metric_descriptions       || {},
        benchmark_symbol:              performanceRaw.benchmark_symbol              || null,
        benchmark_cumulative_return_pct: performanceRaw.benchmark_cumulative_return_pct ?? null,
        benchmark_alpha_pct:            performanceRaw.benchmark_alpha_pct           ?? null,
      },
      fmt,
      time,
    };

    return window.VAULT_DATA;
  }

  // ── Per-holding price history — fetched on demand (not part of the bulk load) ─
  async function fetchHoldingHistory(holdingId) {
    try {
      return await apiFetch(`/api/analytics/holding-history/${holdingId}`);
    } catch (e) {
      return [];
    }
  }

  // Pre-seed fmt so components that reference VAULT_DATA.fmt at parse time work
  window.VAULT_DATA = { fmt, time };
  window.VAULT_TIME = time;
  window.VAULT_LOAD_DATA = loadVaultData;
  window.fetchHoldingHistory = fetchHoldingHistory;
})();
