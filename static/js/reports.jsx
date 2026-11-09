// Reports screen — the daily report as a live page, plus every saved day.
// Live view polls /api/reports/live; each day is archived server-side
// (hourly, last write wins, and again when the 23:55 email goes out).

const LIVE_POLL_MS    = 30 * 1000;       // re-read the report (DB only, cheap)
const PRICE_REFRESH_MS = 5 * 60 * 1000;  // pull fresh quotes from Yahoo

const reportDateLabel = (iso, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", opts);

const fmtPrice = (n) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 4 });

const SESSION_EXPIRED = "Your session has expired — log out and sign in again.";

const signColor = (n) => (n > 0 ? "var(--gain)" : n < 0 ? "var(--loss)" : "var(--ink-3)");

const Reports = ({ onRefreshPrices }) => {
  const fmt = window.VAULT_DATA.fmt;
  const [selected, setSelected] = React.useState("live");   // "live" | "YYYY-MM-DD"
  const [archive, setArchive]   = React.useState(null);
  const [report, setReport]     = React.useState(null);
  const [error, setError]       = React.useState(null);
  const [fetchedAt, setFetchedAt] = React.useState(null);
  const [saving, setSaving]     = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [flash, setFlash]       = React.useState({});      // name → "up" | "down"
  const [, setTick]             = React.useState(0);       // re-render "updated Xs ago"
  const lastPrices = React.useRef({});
  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;

  const loadArchive = React.useCallback(async () => {
    try {
      const r = await fetch("/api/reports", { credentials: "include" });
      if (r.ok) setArchive(await r.json());
    } catch (_) { /* rail just stays empty */ }
  }, []);

  const loadLive = React.useCallback(async () => {
    try {
      const r = await fetch("/api/reports/live", { credentials: "include" });
      if (r.status === 401) { setError(SESSION_EXPIRED); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const next = await r.json();
      if (selectedRef.current !== "live") return;   // user moved to a saved day mid-flight

      // Flash the price cells that moved since the previous poll.
      const moved = {};
      for (const h of next.holdings) {
        const prev = lastPrices.current[h.name];
        if (prev != null && prev !== h.current_price) moved[h.name] = h.current_price > prev ? "up" : "down";
        lastPrices.current[h.name] = h.current_price;
      }
      if (Object.keys(moved).length) {
        setFlash(moved);
        setTimeout(() => setFlash({}), 1600);
      }
      setReport(next);
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError("Couldn't load the live report");
    }
  }, []);

  React.useEffect(() => { loadArchive(); }, [loadArchive]);

  // Live: poll the report, and pull fresh quotes every few minutes while visible.
  React.useEffect(() => {
    if (selected !== "live") return;
    setReport(null);
    loadLive();
    const poll = setInterval(loadLive, LIVE_POLL_MS);
    const prices = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await fetch("/api/prices/refresh", { method: "POST", credentials: "include" });
        await loadLive();
      } catch (_) { /* next tick will retry */ }
    }, PRICE_REFRESH_MS);
    const tick = setInterval(() => setTick(t => t + 1), 5000);
    return () => { clearInterval(poll); clearInterval(prices); clearInterval(tick); };
  }, [selected, loadLive]);

  // Archived day: one fetch.
  React.useEffect(() => {
    if (selected === "live") return;
    let cancelled = false;
    setReport(null);
    setError(null);
    fetch(`/api/reports/${selected}`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (!cancelled) setReport(d); })
      .catch(status => {
        if (!cancelled) setError(status === 401 ? SESSION_EXPIRED : `No report saved for ${selected}`);
      });
    return () => { cancelled = true; };
  }, [selected]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshPrices?.();
      await loadLive();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/reports/save", { method: "POST", credentials: "include" });
      await loadArchive();
    } finally {
      setSaving(false);
    }
  };

  const isLive = selected === "live";
  const secsAgo = fetchedAt ? Math.round((Date.now() - fetchedAt) / 1000) : null;

  return (
    <div className="col gap-24" style={{ padding: "24px 28px 40px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Header */}
      <div className="row between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div className="col gap-4">
          <div className="eyebrow">Reports · Daily</div>
          <h1 className="serif" style={{ fontSize: 34, lineHeight: 1 }}>What moved, and when.</h1>
          <div className="dim" style={{ fontSize: 13, maxWidth: 560, marginTop: 4 }}>
            Your daily report as it happens. Every day is saved, so you can open any date and see exactly how it closed.
          </div>
        </div>
        {isLive && (
          <div className="row gap-8">
            <button className="btn" onClick={handleRefresh} disabled={refreshing}>
              <Icon name="refresh" size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              Refresh prices
            </button>
            <button className="btn gold" onClick={handleSave} disabled={saving || !report}>
              <Icon name="download" size={14} /> {saving ? "Saving…" : "Save snapshot"}
            </button>
          </div>
        )}
      </div>

      <div className="reports-grid">
        <ReportRail
          archive={archive}
          selected={selected}
          onSelect={setSelected}
          fmt={fmt}
        />

        <div className="col gap-24" style={{ minWidth: 0 }}>
          {error && !report && (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <div style={{ color: "var(--loss)", fontSize: 13 }}>{error}</div>
            </div>
          )}
          {!error && !report && (
            <div className="card" style={{ padding: 48, display: "grid", placeItems: "center" }}>
              <div className="dots dim"><span></span><span></span><span></span></div>
            </div>
          )}
          {report && (
            <ReportView
              report={report}
              fmt={fmt}
              isLive={isLive}
              flash={flash}
              status={isLive
                ? <>
                    <span className="chip gain"><span className="live-dot" /> Live</span>
                    <span className="dim mono" style={{ fontSize: 11 }}>
                      updated {secsAgo == null || secsAgo < 5 ? "just now" : `${secsAgo}s ago`} · quotes refresh every 5 min
                    </span>
                  </>
                : <>
                    <span className="chip">Saved</span>
                    <span className="dim mono" style={{ fontSize: 11 }}>
                      last captured {new Date(report.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </>}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Left rail: Live + saved days grouped by month ────────────────────────────
const ReportRail = ({ archive, selected, onSelect, fmt }) => {
  const groups = React.useMemo(() => {
    const out = [];
    for (const r of archive || []) {
      const month = reportDateLabel(r.report_date, { month: "long", year: "numeric" });
      if (!out.length || out[out.length - 1].month !== month) out.push({ month, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [archive]);

  return (
    <aside className="card reports-rail">
      <button className={`report-day ${selected === "live" ? "active" : ""}`} onClick={() => onSelect("live")}>
        <span className="row gap-8"><span className="live-dot" /><span style={{ fontWeight: 600 }}>Live</span></span>
        <span className="dim mono" style={{ fontSize: 11 }}>today</span>
      </button>

      <div className="eyebrow" style={{ padding: "14px 10px 6px" }}>
        Saved days {archive && archive.length > 0 && <span className="mono">· {archive.length}</span>}
      </div>

      {archive && archive.length === 0 && (
        <div className="dim" style={{ fontSize: 12, padding: "4px 10px 10px", lineHeight: 1.5 }}>
          Nothing saved yet. Today is captured automatically every hour — or press <b>Save snapshot</b>.
        </div>
      )}

      <div className="col" style={{ overflowY: "auto", minHeight: 0 }}>
        {groups.map(g => (
          <div key={g.month} className="col">
            <div className="dim" style={{ fontSize: 11, padding: "10px 10px 4px" }}>{g.month}</div>
            {g.rows.map(r => (
              <button key={r.report_date}
                      className={`report-day ${selected === r.report_date ? "active" : ""}`}
                      onClick={() => onSelect(r.report_date)}>
                <span>{reportDateLabel(r.report_date)}</span>
                <span className="mono" style={{ fontSize: 11.5, color: r.movers_count ? signColor(r.day_change_sar) : "var(--ink-3)" }}>
                  {r.movers_count ? fmt.PCT(r.day_change_pct) : "closed"}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
};

// ── One report (live or archived) ────────────────────────────────────────────
const ReportView = ({ report: r, fmt, isLive, flash, status }) => {
  const traded = r.movers_count > 0;
  const maxImpact = Math.max(1e-9, ...r.daily_movers.map(m => Math.abs(m.daily_sar)));
  const dayLabel = isLive ? "Change today" : "Change that day";

  return (
    <>
      {/* Hero */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row gap-12" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          {status}
          <span className="grow" />
          <span className="dim" style={{ fontSize: 12 }}>
            {reportDateLabel(r.report_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
        </div>
        <div className="report-hero">
          <div className="col gap-4" style={{ padding: 22 }}>
            <div className="eyebrow">Total portfolio value</div>
            <div className="hero-num">
              {fmt.SAR(r.total_value)}
              <span className="muted" style={{ fontFamily: "Geist", fontSize: 14, marginLeft: 6, letterSpacing: 0 }}>SAR</span>
            </div>
            <div className="dim" style={{ fontSize: 12.5 }}>
              {fmt.SAR(r.portfolio_value)} at market + {fmt.SAR(r.cash_balance)} cash
            </div>
          </div>
          <div className="col gap-4" style={{
            padding: 22,
            background: !traded ? "var(--paper-2)" : r.day_change_sar >= 0 ? "var(--gain-soft)" : "var(--loss-soft)",
          }}>
            <div className="eyebrow">{dayLabel}</div>
            {traded ? (
              <>
                <div className="hero-num" style={{ color: signColor(r.day_change_sar) }}>
                  {fmt.SAR(r.day_change_sar, { sign: true })}
                  <span style={{ fontFamily: "Geist", fontSize: 14, marginLeft: 6, letterSpacing: 0 }}>SAR</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  <b style={{ color: signColor(r.day_change_sar) }}>{fmt.PCT(r.day_change_pct)}</b>
                  {" "}· {r.movers_count} position{r.movers_count === 1 ? "" : "s"} traded · vs previous close
                </div>
              </>
            ) : (
              <>
                <div className="hero-num" style={{ color: "var(--ink-2)" }}>Markets closed</div>
                <div className="dim" style={{ fontSize: 12.5 }}>No position traded {isLive ? "today" : "this day"}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="reports-kpis">
        <KPI label="Invested" value={fmt.SAR(r.total_invested, { decimals: 0 })} suffix="SAR" />
        <KPI label="Unrealized P&L" value={fmt.SAR(r.unrealized_pnl, { sign: true, decimals: 0 })} suffix="SAR"
             accent={signColor(r.unrealized_pnl)}
             sub={<Delta value={r.unrealized_pct} suffix="%" />} />
        <KPI label="Realized P&L" value={fmt.SAR(r.realized_pnl, { sign: true, decimals: 0 })} suffix="SAR"
             accent={signColor(r.realized_pnl)} />
        <KPI label="From peak" value={fmt.PCT(-Math.abs(r.current_drawdown_pct))}
             accent={r.current_drawdown_pct < -0.005 ? "var(--loss)" : "var(--ink)"}
             sub={r.peak_value > 0 && <span className="dim" style={{ fontSize: 12 }}>Peak {fmt.SAR(r.peak_value, { decimals: 0 })} SAR</span>} />
      </div>

      {/* Movers */}
      <Section eyebrow="Movers" title={isLive ? "What's moving today" : "What moved"}
               action={<span className="dim mono" style={{ fontSize: 11 }}>vs previous close · closed markets excluded</span>}>
        <div className="card" style={{ overflow: "hidden" }}>
          {r.daily_movers.length === 0 ? (
            <div className="dim" style={{ padding: 28, textAlign: "center", fontSize: 13 }}>No position traded.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="num-cell right">Prev close</th>
                    <th className="num-cell right">Price</th>
                    <th className="num-cell right">Change</th>
                    <th className="num-cell right">Impact (SAR)</th>
                    <th style={{ width: "22%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {r.daily_movers.map(m => (
                    <tr key={m.name}>
                      <td style={{ fontWeight: 500 }}>{m.name}</td>
                      <td className="num-cell right dim">{fmtPrice(m.prev_price)}</td>
                      <td className={`num-cell right ${flash[m.name] ? "flash-" + flash[m.name] : ""}`}>{fmtPrice(m.curr_price)}</td>
                      <td className="num-cell right"><Delta value={m.daily_pct} suffix="%" /></td>
                      <td className="num-cell right" style={{ color: signColor(m.daily_sar), fontWeight: 500 }}>
                        {fmt.SAR(m.daily_sar, { sign: true })}
                      </td>
                      <td><ImpactBar value={m.daily_sar} max={maxImpact} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* That day's transactions */}
      {r.today_txs.length > 0 && (
        <Section eyebrow="Activity" title={isLive ? "Booked today" : "Booked that day"}>
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Type</th><th>Asset</th>
                  <th className="num-cell right">Qty</th>
                  <th className="num-cell right">Price</th>
                  <th className="num-cell right">Total</th>
                  <th className="num-cell right">Realized P&L</th>
                </tr>
              </thead>
              <tbody>
                {r.today_txs.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`chip ${t.tx_type === "BUY" || t.tx_type === "DEPOSIT" ? "gain" : t.tx_type === "SELL" || t.tx_type === "WITHDRAW" ? "loss" : ""}`}>
                        {t.tx_type}
                      </span>
                    </td>
                    <td>{t.asset_name || "—"}</td>
                    <td className="num-cell right">{t.quantity != null ? fmtPrice(t.quantity) : "—"}</td>
                    <td className="num-cell right">{t.price != null ? fmtPrice(t.price) : "—"}</td>
                    <td className="num-cell right">{fmt.SAR(t.total)}</td>
                    <td className="num-cell right" style={{ color: t.realized_pnl != null ? signColor(t.realized_pnl) : undefined }}>
                      {t.realized_pnl != null ? fmt.SAR(t.realized_pnl, { sign: true }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* All positions */}
      <Section eyebrow="Positions" title={`${r.positions_count} open holdings`}
               action={<span className="dim mono" style={{ fontSize: 11 }}>sorted by unrealized P&L</span>}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th className="num-cell right">Day</th>
                  <th className="num-cell right">Price</th>
                  <th className="num-cell right">Value</th>
                  <th className="num-cell right">P&L</th>
                  <th className="num-cell right">Return</th>
                </tr>
              </thead>
              <tbody>
                {r.holdings.map(h => (
                  <tr key={h.name}>
                    <td>
                      <div className="row gap-8">
                        <span style={{ fontWeight: 500 }}>{h.name}</span>
                        {h.ticker && <span className="ticker">{h.ticker}</span>}
                      </div>
                    </td>
                    <td><TypeChip type={h.asset_type} /></td>
                    <td className="num-cell right">
                      {h.day_pct == null
                        ? <span className="dim mono" style={{ fontSize: 11 }}>closed</span>
                        : <Delta value={h.day_pct} suffix="%" />}
                    </td>
                    <td className={`num-cell right ${flash[h.name] ? "flash-" + flash[h.name] : ""}`}>{fmtPrice(h.current_price)}</td>
                    <td className="num-cell right">{fmt.SAR(h.market_value, { decimals: 0 })}</td>
                    <td className="num-cell right" style={{ color: signColor(h.unrealized_pnl) }}>
                      {fmt.SAR(h.unrealized_pnl, { sign: true, decimals: 0 })}
                    </td>
                    <td className="num-cell right"><Delta value={h.unrealized_pct} suffix="%" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Allocation */}
      {r.allocation.length > 0 && (
        <Section eyebrow="Allocation" title="By asset type">
          <div className="card col gap-12" style={{ padding: 20 }}>
            {r.allocation.map(a => (
              <div key={a.asset_type} className="row gap-12">
                <div style={{ width: 120, fontSize: 13 }}>{a.asset_type}</div>
                <div className="grow" style={{ height: 8, background: "var(--paper-2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(a.pct, 100)}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
                </div>
                <div className="num mono" style={{ width: 56, textAlign: "right", fontSize: 12.5 }}>{a.pct.toFixed(1)}%</div>
                <div className="num mono dim" style={{ width: 110, textAlign: "right", fontSize: 12.5 }}>{fmt.SAR(a.value, { decimals: 0 })}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
};

// Diverging bar: losses grow left from the centre line, gains grow right.
const ImpactBar = ({ value, max }) => {
  const w = Math.min(Math.abs(value) / max, 1) * 50;
  return (
    <div style={{ position: "relative", height: 8, background: "var(--paper-2)", borderRadius: 99 }}>
      <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--line)" }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0, borderRadius: 99,
        width: `${w}%`,
        left: value >= 0 ? "50%" : `${50 - w}%`,
        background: value >= 0 ? "var(--gain)" : "var(--loss)",
      }} />
    </div>
  );
};
