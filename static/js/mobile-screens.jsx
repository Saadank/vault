// VAULT mobile — primary screens: Login, Dashboard, HoldingDetail, Analytics, Transactions, Profile
// Each screen returns a full m-app (without IOSDevice — the canvas wraps them).
// Props: { data, tweaks, open*, navigate, route }

const { useState, useMemo, useEffect } = React;

// ─────────────────────────────────────────────────────────────
// Status bar spacer + top bar
// ─────────────────────────────────────────────────────────────
const MTopBar = ({ title, eyebrow, right, back, onBack, large = false }) => (
  <div style={{ padding: large ? "8px 20px 4px" : "10px 20px 8px", display: "flex", alignItems: "flex-start", gap: 12 }}>
    {back && (
      <button onClick={onBack} style={{
        width: 36, height: 36, borderRadius: 10,
        border: "1px solid var(--line)", background: "var(--paper)",
        display: "grid", placeItems: "center", flexShrink: 0,
        color: "var(--ink)",
      }}>
        <MIcon name="chevLeft" size={18} />
      </button>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
      <h1 className="serif" style={{
        fontSize: large ? 34 : 24,
        lineHeight: 1.05, letterSpacing: "-0.01em",
        color: "var(--ink)",
      }}>{title}</h1>
    </div>
    {right && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Bottom tab bar
// ─────────────────────────────────────────────────────────────
const MTabBar = ({ route, navigate, style = "labeled" }) => {
  const tabs = [
    { id: "dashboard", label: "Portfolio", icon: "home" },
    { id: "analytics", label: "Analytics", icon: "chart" },
    { id: "transactions", label: "Ledger", icon: "ledger" },
    { id: "profile", label: "Profile", icon: "profile" },
  ];
  return (
    <div className={"m-tabbar " + (style === "floating" ? "floating" : "")}>
      {tabs.map(t => {
        const active = route === t.id;
        return (
          <button key={t.id} className={"m-tab " + (active ? "active" : "")} onClick={() => navigate(t.id)}>
            <MIcon name={t.icon} size={22} stroke={active ? 1.9 : 1.5} />
            {style !== "icon" && <span>{t.label}</span>}
            <span className="tab-dot" />
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
const MLogin = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !pwd) return;
    setLoading(true);
    setError("");
    try {
      await onLogin({ username: username.trim(), password: pwd });
    } catch (e) {
      setError(e.message || "Incorrect username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      <div className="m-content" style={{ padding: "32px 24px 24px", display: "flex", flexDirection: "column" }}>
        {/* Brand block */}
        <div style={{ marginTop: 12 }}>
          <MBrandmark size={48} />
          <div className="serif" style={{ fontSize: 44, lineHeight: 1, marginTop: 22, letterSpacing: "0.02em" }}>
            VAULT
          </div>
          <div className="eyebrow" style={{ marginTop: 8 }}>Private Portfolio · Riyadh</div>
        </div>

        <div style={{ marginTop: 48, marginBottom: 8 }}>
          <h2 className="serif" style={{ fontSize: 28, lineHeight: 1.1, color: "var(--ink)" }}>
            Welcome back.
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Username</div>
            <input className="m-input" placeholder="username" value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoCapitalize="none" autoCorrect="off" autoComplete="username" />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Password</div>
            <input className="m-input" type="password" placeholder="••••••••" value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoComplete="current-password" />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "var(--loss-soft)", color: "var(--loss)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button className="m-btn primary full" style={{ marginTop: 18 }} onClick={handleSubmit} disabled={loading}>
          {loading
            ? <span className="dots"><span/><span/><span/></span>
            : <><span>Open vault</span><MIcon name="arrowRight" size={16} /></>
          }
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 14px" }}>
          <div className="hairline" style={{ flex: 1 }} />
          <span className="eyebrow">or</span>
          <div className="hairline" style={{ flex: 1 }} />
        </div>

        <button onClick={handleSubmit} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 18px", borderRadius: 12,
          background: "var(--paper)", border: "1px solid var(--line)",
          color: "var(--ink)", justifyContent: "center", minHeight: 48,
        }}>
          <MIcon name="face" size={20} color="var(--accent)" />
          <span style={{ fontWeight: 500 }}>Sign in with Face ID</span>
        </button>

        <div style={{ marginTop: "auto", paddingTop: 32, display: "flex", justifyContent: "center", gap: 18 }}>
          <span className="eyebrow">Create account</span>
          <span className="eyebrow" style={{ color: "var(--ink-4)" }}>·</span>
          <span className="eyebrow">Forgot password</span>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
          v2.4 · Encrypted on this device
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
const MDashboard = ({ data, tweaks, navigate, openHolding, openBuy, openDeposit, openWithdraw, openAsk, route }) => {
  const { summary, holdings, chart } = data;
  const [range, setRange] = useState("1M");
  const [sortBy, setSortBy] = useState("value");
  const hidden = !!tweaks.privacy;

  const SORTS = {
    value: { label: "By value", fn: (a, b) => b.market_value_sar - a.market_value_sar },
    gain:  { label: "By gain",  fn: (a, b) => b.unrealized_pct - a.unrealized_pct },
    name:  { label: "By name",  fn: (a, b) => a.name.localeCompare(b.name) },
  };
  const SORT_ORDER = ["value", "gain", "name"];
  const cycleSort = () => setSortBy(s => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]);
  const sortedHoldings = useMemo(
    () => [...holdings].sort(SORTS[sortBy].fn),
    [holdings, sortBy]
  );

  const filteredChart = useMemo(() => {
    const n = chart.length;
    const slice = { "1D": 7, "1W": 14, "1M": 30, "3M": 90, "1Y": 365, "Max": n }[range] || 30;
    return chart.slice(Math.max(0, n - slice));
  }, [chart, range]);

  const last = filteredChart[filteredChart.length - 1];
  const first = filteredChart[0];
  const rangePct = first ? ((last.value - first.value) / first.value) * 100 : 0;

  // Pick top 4 movers by abs % return
  const movers = [...holdings].sort((a, b) => Math.abs(b.unrealized_pct) - Math.abs(a.unrealized_pct)).slice(0, 4);

  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      {/* Top bar — brand left, bell+avatar right */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 18px 6px", gap: 10 }}>
        <MBrandmark size={32} />
        <div className="serif" style={{ fontSize: 20, letterSpacing: "0.04em" }}>VAULT</div>
        <div style={{ flex: 1 }} />
        <button style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", display: "grid", placeItems: "center", position: "relative" }}>
          <MIcon name="bell" size={17} />
          <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }} />
        </button>
        <button style={{ width: 36, height: 36, borderRadius: 999, background: "var(--ink)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }} onClick={() => navigate("profile")}>
          {(data.user?.username || "U").slice(0,2).toUpperCase()}
        </button>
      </div>

      <div className="m-content" style={{ paddingBottom: 96 }}>
        {/* Pull-to-refresh affordance */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 4, marginBottom: 2 }}>
          <span className="ptr"><span/><span/><span/></span>
        </div>

        {/* Hero — portfolio value */}
        <div style={{ padding: "8px 20px 14px" }}>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Total Portfolio Value</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: "var(--ink-3)" }} />
            <span style={{ color: "var(--ink-3)" }}>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          </div>
          <div className="serif" style={{
            fontSize: 52, lineHeight: 1.02, letterSpacing: "-0.02em",
            marginTop: 8, fontVariantNumeric: "tabular-nums", color: "var(--ink)",
          }}>
            <MValue value={F.SAR(summary.total_value, 2)} hidden={hidden} suffix="SAR" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <MDelta value={summary.day_change_pct} suffix="%" />
            <span className="eyebrow" style={{ color: "var(--ink-3)" }}>today</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: "var(--ink-4)" }} />
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontFamily: "Geist Mono" }}>
              ≈ ${hidden ? "•••••" : F.USD(summary.total_value / 3.75)} USD
            </span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ padding: "0 12px" }}>
          <MAreaChart data={filteredChart} width={368} height={180} accent="var(--accent)" />
        </div>
        {/* Range selector */}
        <div style={{ display: "flex", gap: 0, padding: "8px 20px 18px", justifyContent: "space-between" }}>
          {["1D","1W","1M","3M","1Y","Max"].map(r => (
            <button key={r} className={"m-pill " + (range === r ? "on" : "")} onClick={() => setRange(r)}
                    style={{ flex: 1, justifyContent: "center", padding: "6px 0", fontSize: 11.5 }}>
              {r}
            </button>
          ))}
        </div>

        {/* Quick actions row — Deposit / Buy / Sell / Ask */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "0 20px 18px" }}>
          {[
            { icon: "arrowDownLeft", label: "Deposit", onClick: openDeposit },
            { icon: "plus", label: "Buy", onClick: openBuy, gold: true },
            { icon: "arrowUpRight", label: "Withdraw", onClick: openWithdraw },
            { icon: "sparkle", label: "Ask Vault", onClick: openAsk },
          ].map(a => (
            <button key={a.label} onClick={a.onClick} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "12px 0", borderRadius: 12,
              background: a.gold ? "var(--accent)" : "var(--paper)",
              color: a.gold ? "#fff" : "var(--ink)",
              border: "1px solid " + (a.gold ? "var(--accent)" : "var(--line)"),
            }}>
              <MIcon name={a.icon} size={18} />
              <span style={{ fontSize: 11, fontWeight: 500 }}>{a.label}</span>
            </button>
          ))}
        </div>

        {/* KPI strip — 2x2 */}
        <div style={{ padding: "0 20px 18px" }}>
          <div className="m-card" style={{ padding: 0, overflow: "hidden" }}>
            {[
              [
                { label: "Invested", value: F.SAR(summary.total_invested), suffix: "SAR" },
                { label: "Cash on hand", value: F.SAR(summary.cash_balance), suffix: "SAR" },
              ],
              [
                { label: "Unrealized P&L", value: F.SAR(summary.unrealized_pnl), suffix: "SAR", deltaUp: true, deltaVal: summary.unrealized_pct },
                { label: "Realized P&L", value: F.SAR(summary.realized_pnl), suffix: "SAR", deltaUp: true },
              ],
            ].map((row, r) => (
              <div key={r} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: r ? "1px solid var(--line-2)" : "none" }}>
                {row.map((k, i) => (
                  <div key={k.label} style={{ padding: "14px 16px", borderLeft: i ? "1px solid var(--line-2)" : "none" }}>
                    <div className="eyebrow" style={{ fontSize: 9 }}>{k.label}</div>
                    <div className="serif" style={{ fontSize: 20, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                      <MValue value={k.value} hidden={hidden} suffix={k.suffix} />
                    </div>
                    {k.deltaVal !== undefined && (
                      <div style={{ marginTop: 2 }}><MDelta value={k.deltaVal} suffix="%" small /></div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Cash card — dark, mirrors web */}
        <div style={{ padding: "0 20px 18px" }}>
          <div style={{ borderRadius: 14, padding: 18, background: "var(--ink)", color: "#f5efe0", overflow: "hidden", position: "relative" }}>
            <svg style={{ position: "absolute", top: -30, right: -30, opacity: 0.06 }} width="160" height="160" viewBox="0 0 24 24" fill="var(--accent-2)">
              <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="eyebrow" style={{ color: "var(--accent-2)" }}>Cash Wallet</div>
              <MIcon name="wallet" size={16} color="var(--accent-2)" />
            </div>
            <div className="serif" style={{ fontSize: 36, lineHeight: 1, marginTop: 14, fontVariantNumeric: "tabular-nums" }}>
              <MValue value={F.SAR(summary.cash_balance, 2)} hidden={hidden} suffix="SAR" />
            </div>
            <div style={{ fontSize: 12, color: "#a89e85", marginTop: 4 }}>
              ≈ ${hidden ? "•••••" : F.USD(summary.cash_balance / 3.75)} USD · ready to deploy
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={openDeposit} className="m-btn gold" style={{ flex: 1, padding: "10px", minHeight: 40, fontSize: 13 }}>
                <MIcon name="arrowDownLeft" size={14} /> Deposit
              </button>
              <button onClick={openWithdraw} className="m-btn" style={{ flex: 1, background: "transparent", border: "1px solid #3a3322", color: "#f5efe0", padding: "10px", minHeight: 40, fontSize: 13 }}>
                <MIcon name="arrowUpRight" size={14} /> Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Holdings — list with swipe affordance */}
        <div style={{ padding: "0 20px 6px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h3 className="serif" style={{ fontSize: 22 }}>Holdings</h3>
          <button onClick={cycleSort} style={{ fontSize: 12, color: "var(--ink-2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {SORTS[sortBy].label} <MIcon name="chevDown" size={12} />
          </button>
        </div>

        <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {sortedHoldings.map(h => {
            const up = h.unrealized_pct >= 0;
            // Small synthetic spark
            const seed = h.id;
            const spark = Array.from({ length: 14 }, (_, i) => Math.sin(seed * 0.7 + i * (up ? 0.4 : 0.7)) * (up ? 1 : -1) * 0.5 + i * (up ? 0.1 : -0.05) + 5);
            return (
              <button key={h.id} onClick={() => openHolding(h)} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12, padding: "14px 14px",
                background: "var(--paper)", border: "1px solid var(--line)",
                borderRadius: 12, alignItems: "center", textAlign: "left",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "var(--paper-2)", border: "1px solid var(--line-2)",
                  display: "grid", placeItems: "center",
                  fontFamily: "Instrument Serif", fontSize: 18, color: "var(--ink-2)",
                }}>{h.name[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{h.name}</span>
                    <MTypeChip type={h.asset_type} small />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                    {h.ticker && <span className="ticker">{h.ticker}</span>}
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} units</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {hidden ? "•••••" : F.SAR(h.market_value_sar)}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <MDelta value={h.unrealized_pct} suffix="%" small />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Today's movers strip */}
        <div style={{ padding: "0 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 className="serif" style={{ fontSize: 22 }}>Today's movers</h3>
            <span className="eyebrow">1D</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {movers.map(m => (
              <div key={m.id} className="m-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div className="ticker" style={{ marginTop: 1 }}>{m.ticker || m.asset_type}</div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <MDelta value={m.unrealized_pct} suffix="%" small />
                  <MSpark data={Array.from({ length: 10 }, (_, i) => Math.sin(m.id + i * 0.6) * 0.5 + i * (m.unrealized_pct >= 0 ? 0.1 : -0.1) + 5)} up={m.unrealized_pct >= 0} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI nudge */}
        <div style={{ padding: "0 20px 24px" }}>
          <button onClick={openAsk} style={{
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: 16, background: "var(--paper)",
            border: "1px solid var(--line)", borderRadius: 14,
            position: "relative", overflow: "hidden", textAlign: "left",
          }}>
            <svg style={{ position: "absolute", top: -10, right: -10, opacity: 0.07 }} width="80" height="80" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
            </svg>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>
              <MIcon name="sparkle" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>Ask Vault</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>
                Why is SABIC down today? · How should I rebalance?
              </div>
            </div>
            <MIcon name="chevRight" size={16} color="var(--ink-3)" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// HOLDING DETAIL
// ─────────────────────────────────────────────────────────────
const MHoldingDetail = ({ data, tweaks, holding, onBack, openSell, openBuy, openFundFlow }) => {
  const h = holding;
  const hidden = !!tweaks.privacy;
  const [range, setRange] = useState("1M");

  // Real daily close price history (append-only — never overwritten, unlike
  // Holding.current_price). null = loading, [] = no history captured yet.
  const [history, setHistory] = useState(null);
  useEffect(() => {
    setHistory(null);
    window.fetchHoldingHistory(h.id).then(setHistory);
  }, [h.id]);

  const RANGE_DAYS = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "Max": Infinity };
  const chart = useMemo(() => {
    if (!history || history.length === 0) return [];
    const days = RANGE_DAYS[range] ?? Infinity;
    let rows = history;
    if (days !== Infinity) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutStr = cutoff.toISOString().slice(0, 10);
      const filtered = history.filter(r => r.date >= cutStr);
      if (filtered.length) rows = filtered;
    }
    return rows.map(r => ({ date: r.date, value: r.price }));
  }, [history, range]);
  const up = h.unrealized_pct >= 0;

  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      <MTopBar
        back onBack={onBack}
        eyebrow={(h.ticker || h.asset_type)}
        title={h.name}
        right={
          <>
            <button style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", display: "grid", placeItems: "center" }}>
              <MIcon name="dots" size={16} />
            </button>
          </>
        }
      />

      <div className="m-content" style={{ paddingBottom: 110 }}>
        {/* Type + Sector */}
        <div style={{ padding: "0 20px 14px", display: "flex", gap: 8, alignItems: "center" }}>
          <MTypeChip type={h.asset_type} />
          <span className="m-chip">{h.sector}</span>
          <span className="m-chip">{h.currency}</span>
        </div>

        {/* Price hero */}
        <div style={{ padding: "0 20px 8px" }}>
          <div className="eyebrow">Current price</div>
          <div className="serif" style={{ fontSize: 44, lineHeight: 1.02, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            <MValue value={h.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 })} hidden={hidden} suffix={h.currency} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <MDelta value={h.unrealized_pct} suffix="%" />
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {up ? "+" : "−"}{Math.abs(h.current_price - h.avg_cost).toFixed(2)} from avg cost
            </span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ padding: "8px 12px 0" }}>
          {history === null ? (
            <div style={{ height: 170, display: "grid", placeItems: "center" }}>
              <span className="dim" style={{ fontSize: 12 }}>Loading price history…</span>
            </div>
          ) : chart.length < 2 ? (
            // MAreaChart needs ≥2 points to draw a line; a single day's close
            // can't show a trend anyway.
            <div style={{ height: 170, display: "grid", placeItems: "center", textAlign: "center", padding: "0 24px" }}>
              <span className="dim" style={{ fontSize: 12 }}>
                Not enough history yet — VAULT records {h.name}'s close price daily starting today. Check back tomorrow.
              </span>
            </div>
          ) : (
            <MAreaChart data={chart} width={368} height={170} accent={up ? "var(--gain)" : "var(--loss)"} />
          )}
        </div>
        <div style={{ display: "flex", padding: "10px 20px 18px", justifyContent: "space-between" }}>
          {["1D","1W","1M","3M","1Y","Max"].map(r => (
            <button key={r} className={"m-pill " + (range === r ? "on" : "")} onClick={() => setRange(r)}
                    style={{ flex: 1, justifyContent: "center", padding: "6px 0", fontSize: 11.5 }}>{r}</button>
          ))}
        </div>

        {/* Position summary card */}
        <div style={{ padding: "0 20px 14px" }}>
          <div className="m-card" style={{ padding: 0, overflow: "hidden" }}>
            {[
              { label: "Market Value", value: F.SAR(h.market_value_sar, 2), suffix: "SAR" },
              { label: "Cost Basis", value: F.SAR(h.cost_basis_sar, 2), suffix: "SAR" },
              { label: "Unrealized P&L", value: F.SAR(h.unrealized_pnl_sar, 2), suffix: "SAR", delta: h.unrealized_pct },
              { label: "Quantity", value: h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }), suffix: h.asset_type === "Crypto" ? "BTC" : "units" },
              { label: "Avg Cost", value: h.avg_cost.toLocaleString(undefined, { maximumFractionDigits: 2 }), suffix: h.currency },
              { label: "First Bought", value: h.purchase_date, suffix: "" },
            ].map((row, i) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
                borderTop: i ? "1px solid var(--line-2)" : "none",
              }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>{row.label}</span>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {hidden && /SAR|USD/.test(row.suffix) ? "•••••" : row.value}
                    {row.suffix && <span style={{ marginLeft: 4, color: "var(--ink-3)", fontSize: 11, fontFamily: "Geist Mono" }}>{row.suffix}</span>}
                  </span>
                  {row.delta !== undefined && (
                    <div style={{ marginTop: 2 }}><MDelta value={row.delta} suffix="%" small /></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ padding: "0 20px 14px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Notes</div>
          <div className="m-card" style={{ padding: 14, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, fontStyle: "italic", fontFamily: "Instrument Serif", fontSize: 16 }}>
            "{h.notes || 'No notes yet — tap to add.'}"
          </div>
        </div>

        {/* Transactions for this asset */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h3 className="serif" style={{ fontSize: 20 }}>Transactions</h3>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>3 records</span>
          </div>
          <div className="m-card" style={{ padding: 0, overflow: "hidden" }}>
            {[
              { type: "BUY", qty: h.quantity * 0.6, price: h.avg_cost * 0.94, date: "2024-08-12" },
              { type: "BUY", qty: h.quantity * 0.4, price: h.avg_cost * 1.08, date: "2025-02-04" },
              { type: "CAPITAL_INCREASE", qty: h.quantity * 0.05, price: 0, date: "2025-08-21" },
            ].map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderTop: i ? "1px solid var(--line-2)" : "none",
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: t.type === "BUY" ? "var(--paper-2)" : "var(--accent-soft)",
                  color: t.type === "BUY" ? "var(--ink-2)" : "var(--accent-ink)",
                  display: "grid", placeItems: "center", fontSize: 9, fontWeight: 600, letterSpacing: "0.05em",
                }}>{t.type === "BUY" ? "BUY" : "BNS"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.type.replace("_", " ")}</div>
                  <div className="ticker" style={{ marginTop: 1 }}>{t.date} · {t.qty.toFixed(2)} @ {t.price.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  {hidden ? "•••" : F.SAR(t.qty * t.price * (h.currency === "USD" ? 3.75 : 1))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed bottom action bar */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "12px 20px 32px", display: "flex", gap: 8,
        background: "linear-gradient(to top, var(--bg) 70%, transparent)",
        zIndex: 10,
      }}>
        {h.asset_type === "Fund" ? (
          <button className="m-btn gold" style={{ flex: 1 }} onClick={openFundFlow}>
            <MIcon name="plus" size={15} /> Add / Withdraw
          </button>
        ) : (
          <>
            <button className="m-btn" style={{ flex: 1 }} onClick={openSell}>
              <MIcon name="arrowUpRight" size={15} /> Sell
            </button>
            <button className="m-btn gold" style={{ flex: 1.5 }} onClick={openBuy}>
              <MIcon name="plus" size={15} /> Buy more
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────
const MAnalytics = ({ data, tweaks, navigate, route }) => {
  const { summary, allocation, pnl, overview, performance } = data;
  const hidden = !!tweaks.privacy;
  const [tab, setTab] = useState("overview"); // overview | allocation | pnl

  const byType = allocation.by_type;
  const colors = ["var(--ink)", "var(--accent)", "#7c3aed", "#0e7490", "#a16207", "var(--accent-2)", "#475569"];

  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      <MTopBar large eyebrow="Insights" title="Analytics" />

      {/* Segmented control */}
      <div style={{ padding: "4px 20px 18px" }}>
        <div style={{ display: "flex", background: "var(--paper-2)", borderRadius: 10, padding: 4, border: "1px solid var(--line-2)" }}>
          {[
            { id: "overview", label: "Overview" },
            { id: "allocation", label: "Allocation" },
            { id: "pnl", label: "P&L" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "8px 0", fontSize: 12.5, fontWeight: 500,
              borderRadius: 7,
              background: tab === t.id ? "var(--paper)" : "transparent",
              color: tab === t.id ? "var(--ink)" : "var(--ink-2)",
              boxShadow: tab === t.id ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="m-content" style={{ paddingBottom: 96 }}>
        {tab === "overview" && (
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Hero stat */}
            <div className="m-card" style={{ padding: 20, background: "var(--ink)", color: "#f5efe0", borderColor: "var(--ink)" }}>
              <div className="eyebrow" style={{ color: "var(--accent-2)" }}>All-time return</div>
              <div className="serif" style={{ fontSize: 48, lineHeight: 1, marginTop: 8, color: "#f5efe0" }}>
                +{overview.total_return_pct.toFixed(1)}<span style={{ fontSize: 28, color: "var(--accent-2)" }}>%</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#a89e85" }}>
                +{F.SAR(overview.total_return_sar)} SAR · realized + unrealized
              </div>
              <div style={{ height: 1, background: "#2a2316", margin: "16px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div className="eyebrow" style={{ color: "#a89e85" }}>Peak Value</div>
                  <div className="serif" style={{ fontSize: 18, color: "#f5efe0", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{F.COMPACT(overview.peak_value)}<span style={{ fontSize: 10, color: "#a89e85", marginLeft: 4 }}>SAR</span></div>
                </div>
                <div>
                  <div className="eyebrow" style={{ color: "#a89e85" }}>Drawdown</div>
                  <div className="serif" style={{ fontSize: 18, color: "var(--loss-soft)", marginTop: 4 }}>{overview.current_drawdown_pct.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* Best / worst month */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="m-card" style={{ padding: 14 }}>
                <div className="eyebrow">Best month</div>
                <div className="serif" style={{ fontSize: 26, marginTop: 4, color: "var(--gain)" }}>+{overview.best_month.return_pct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, fontFamily: "Geist Mono" }}>{overview.best_month.month}</div>
              </div>
              <div className="m-card" style={{ padding: 14 }}>
                <div className="eyebrow">Worst month</div>
                <div className="serif" style={{ fontSize: 26, marginTop: 4, color: "var(--loss)" }}>{overview.worst_month.return_pct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, fontFamily: "Geist Mono" }}>{overview.worst_month.month}</div>
              </div>
            </div>

            {/* Cashflow */}
            <div className="m-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="eyebrow">Cashflow · all time</div>
                <span className="ticker">Net injected · {F.COMPACT(overview.total_deposited - overview.total_withdrawn)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Deposited</div>
                  <div className="serif" style={{ fontSize: 22, marginTop: 2, color: "var(--gain)", fontVariantNumeric: "tabular-nums" }}>+{F.COMPACT(overview.total_deposited)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Withdrawn</div>
                  <div className="serif" style={{ fontSize: 22, marginTop: 2, color: "var(--loss)", fontVariantNumeric: "tabular-nums" }}>−{F.COMPACT(overview.total_withdrawn)}</div>
                </div>
              </div>
              {/* Mini bar */}
              <div style={{ marginTop: 12, height: 10, borderRadius: 5, background: "var(--loss-soft)", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${(overview.total_deposited / (overview.total_deposited + 50000)) * 100}%`, background: "var(--gain)" }} />
              </div>
            </div>

            {/* Benchmark comparison — TWR vs S&P 500 over the same window */}
            {performance && performance.twr_cumulative_return_pct !== null && (
              <div className="m-card" style={{ padding: 16 }}>
                <div className="eyebrow">True return vs. S&amp;P 500</div>
                {performance.benchmark_cumulative_return_pct !== null ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>You</div>
                        <div className="serif" style={{ fontSize: 22, marginTop: 2, color: performance.twr_cumulative_return_pct >= 0 ? "var(--gain)" : "var(--loss)" }}>
                          {performance.twr_cumulative_return_pct >= 0 ? "+" : ""}{performance.twr_cumulative_return_pct.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>S&amp;P 500</div>
                        <div className="serif" style={{ fontSize: 22, marginTop: 2, color: "var(--ink-2)" }}>
                          {performance.benchmark_cumulative_return_pct >= 0 ? "+" : ""}{performance.benchmark_cumulative_return_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    {performance.benchmark_alpha_pct !== null && (
                      <div style={{ marginTop: 10, fontSize: 12, color: performance.benchmark_alpha_pct >= 0 ? "var(--gain)" : "var(--loss)" }}>
                        {performance.benchmark_alpha_pct >= 0
                          ? `Beating the market by ${performance.benchmark_alpha_pct.toFixed(1)}%`
                          : `Trailing the market by ${Math.abs(performance.benchmark_alpha_pct).toFixed(1)}%`}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                    Benchmark comparison accumulates daily — check back soon.
                  </div>
                )}
              </div>
            )}

            {/* Win rate */}
            <div className="m-card" style={{ padding: 16 }}>
              <div className="eyebrow">Sell win-rate</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <span className="serif" style={{ fontSize: 38, fontVariantNumeric: "tabular-nums" }}>{overview.win_rate_pct.toFixed(1)}%</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>5 of 7 trades profitable</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 4 }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 36, borderRadius: 6,
                    background: i < 5 ? "var(--gain-soft)" : "var(--loss-soft)",
                    border: "1px solid " + (i < 5 ? "var(--gain)" : "var(--loss)"),
                    opacity: 0.7,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "allocation" && (
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Donut */}
            <div className="m-card" style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="eyebrow" style={{ alignSelf: "flex-start" }}>By asset type</div>
              <div style={{ position: "relative", marginTop: 10 }}>
                <MDonut data={byType} size={200} thickness={26} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div className="eyebrow" style={{ fontSize: 9 }}>Portfolio</div>
                  <div className="serif" style={{ fontSize: 22, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{hidden ? "•••••" : F.COMPACT(summary.portfolio_value)}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)" }}>SAR</div>
                </div>
              </div>
              <div style={{ width: "100%", marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {byType.map((t, i) => (
                  <div key={t.asset_type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length] }} />
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{t.asset_type}</span>
                    <span className="ticker" style={{ minWidth: 50, textAlign: "right" }}>{t.pct.toFixed(1)}%</span>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right" }}>{hidden ? "•••" : F.COMPACT(t.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Treemap-ish row */}
            <div className="m-card" style={{ padding: 16 }}>
              <div className="eyebrow">Position weighting</div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {data.holdings.sort((a, b) => b.market_value_sar - a.market_value_sar).map((h, i) => {
                  const pct = (h.market_value_sar / summary.portfolio_value) * 100;
                  return (
                    <div key={h.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{h.name}</span>
                        <span className="ticker">{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: "var(--paper-2)", overflow: "hidden" }}>
                        <div style={{ width: `${pct * 2.5}%`, height: "100%", background: colors[i % colors.length], borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "pnl" && (
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Realized vs unrealized */}
            <div className="m-card" style={{ padding: 18 }}>
              <div className="eyebrow">Total Profit & Loss</div>
              <div className="serif" style={{ fontSize: 38, marginTop: 6, color: "var(--gain)", fontVariantNumeric: "tabular-nums" }}>
                +{hidden ? "••••" : F.SAR(pnl.summary.total_realized + pnl.summary.total_unrealized)} <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "Geist" }}>SAR</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Unrealized</div>
                  <div className="serif" style={{ fontSize: 22, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>+{hidden ? "•••" : F.COMPACT(pnl.summary.total_unrealized)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Realized</div>
                  <div className="serif" style={{ fontSize: 22, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>+{hidden ? "•••" : F.COMPACT(pnl.summary.total_realized)}</div>
                </div>
              </div>
              {/* split bar */}
              <div style={{ marginTop: 14, height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                <div style={{ flex: pnl.summary.total_unrealized, background: "var(--accent)" }} />
                <div style={{ flex: pnl.summary.total_realized * 8, background: "var(--ink)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "Geist Mono" }}>
                <span>Unrealized</span><span>Realized</span>
              </div>
            </div>

            {/* By asset */}
            <div className="m-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 8px" }}>
                <div className="eyebrow">By asset · total return</div>
              </div>
              {pnl.by_asset.map((a, i) => {
                const up = a.return_pct >= 0;
                return (
                  <div key={a.name} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px",
                    borderTop: i ? "1px solid var(--line-2)" : "1px solid var(--line)",
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                        <MTypeChip type={a.asset_type} small />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: up ? "var(--gain)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
                        {up ? "+" : "−"}{hidden ? "••••" : F.COMPACT(Math.abs(a.total))}
                      </div>
                      <div style={{ marginTop: 2 }}><MDelta value={a.return_pct} suffix="%" small /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TRANSACTIONS / Ledger
// ─────────────────────────────────────────────────────────────
const MTransactions = ({ data, tweaks }) => {
  const { transactions } = data;
  const hidden = !!tweaks.privacy;
  const [filter, setFilter] = useState("All");
  const types = ["All", "Buys", "Sells", "Deposits", "Withdrawals", "Other"];

  const filtered = transactions.filter(t => {
    if (filter === "All") return true;
    if (filter === "Buys") return t.tx_type === "BUY";
    if (filter === "Sells") return t.tx_type === "SELL";
    if (filter === "Deposits") return t.tx_type === "DEPOSIT";
    if (filter === "Withdrawals") return t.tx_type === "WITHDRAW";
    if (filter === "Other") return !["BUY","SELL","DEPOSIT","WITHDRAW"].includes(t.tx_type);
    return true;
  });

  // Group by month
  const grouped = useMemo(() => {
    const out = {};
    filtered.forEach(t => {
      const month = t.tx_date.slice(0, 7);
      if (!out[month]) out[month] = [];
      out[month].push(t);
    });
    return out;
  }, [filtered]);

  const monthLabel = (m) => {
    const [y, mm] = m.split("-");
    return new Date(parseInt(y), parseInt(mm) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  const tagFor = (t) => {
    if (t.tx_type === "BUY") return { c: "var(--ink-2)", bg: "var(--paper-2)", label: "BUY" };
    if (t.tx_type === "SELL") return { c: "var(--accent-ink)", bg: "var(--accent-soft)", label: "SELL" };
    if (t.tx_type === "DEPOSIT") return { c: "var(--gain)", bg: "var(--gain-soft)", label: "DEP" };
    if (t.tx_type === "WITHDRAW") return { c: "var(--loss)", bg: "var(--loss-soft)", label: "WDR" };
    if (t.tx_type === "CAPITAL_INCREASE") return { c: "var(--accent-ink)", bg: "var(--accent-soft)", label: "BNS" };
    return { c: "var(--ink-2)", bg: "var(--paper-2)", label: t.tx_type };
  };

  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      <MTopBar
        large
        eyebrow="Audit trail"
        title="Ledger"
        right={
          <>
            <button style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", display: "grid", placeItems: "center" }}>
              <MIcon name="search" size={16} />
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", display: "grid", placeItems: "center" }}>
              <MIcon name="filter" size={16} />
            </button>
          </>
        }
      />

      {/* Filter chips */}
      <div style={{ padding: "0 20px 14px", display: "flex", gap: 6, overflowX: "auto" }}>
        {types.map(t => (
          <button key={t} className={"m-pill " + (filter === t ? "on" : "")}
                  onClick={() => setFilter(t)}
                  style={{ flexShrink: 0, fontSize: 12.5, padding: "6px 12px",
                           border: "1px solid " + (filter === t ? "var(--ink)" : "var(--line)") }}>
            {t}
          </button>
        ))}
      </div>

      <div className="m-content" style={{ paddingBottom: 96 }}>
        {Object.keys(grouped).sort().reverse().map(month => (
          <div key={month} style={{ marginBottom: 18 }}>
            <div style={{
              padding: "8px 20px", display: "flex", justifyContent: "space-between",
              position: "sticky", top: 0, background: "var(--bg)", zIndex: 1,
            }}>
              <span className="eyebrow">{monthLabel(month)}</span>
              <span className="ticker">{grouped[month].length} {grouped[month].length === 1 ? "tx" : "txs"}</span>
            </div>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped[month].map(t => {
                const tag = tagFor(t);
                const isCash = t.tx_type === "DEPOSIT" || t.tx_type === "WITHDRAW";
                return (
                  <div key={t.id} className="m-card" style={{
                    padding: "14px 14px", display: "grid",
                    gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: tag.bg, color: tag.c,
                      display: "grid", placeItems: "center",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                      fontFamily: "Geist Mono",
                    }}>{tag.label}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.asset_name}</div>
                      <div className="ticker" style={{ marginTop: 2 }}>
                        {t.tx_date}{!isCash && t.quantity != null && (<> · {t.quantity} @ {t.price}</>)}
                        {t.notes && (<> · <span style={{ fontStyle: "italic" }}>{t.notes}</span></>)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: t.tx_type === "WITHDRAW" ? "var(--loss)" : t.tx_type === "DEPOSIT" ? "var(--gain)" : "var(--ink)" }}>
                        {t.tx_type === "WITHDRAW" ? "−" : t.tx_type === "DEPOSIT" || t.tx_type === "SELL" ? "+" : ""}
                        {hidden ? "••••" : F.SAR(t.total, 2)}
                      </div>
                      {t.realized_pnl != null && (
                        <div style={{ marginTop: 2 }}><MDelta value={t.realized_pnl} suffix="" small /></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────
const MProfile = ({ data, tweaks, onLogout }) => {
  const u = data.user;
  return (
    <div className="m-app">
      <div className="m-status-spacer" />
      <MTopBar large title="Profile" />
      <div className="m-content" style={{ padding: "0 20px 96px" }}>
        {/* Avatar block */}
        <div className="m-card" style={{ padding: 22, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: "var(--ink)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 600 }}>SA</div>
          <div className="serif" style={{ fontSize: 26, marginTop: 12 }}>{u.full_name}</div>
          <div className="ticker" style={{ marginTop: 4 }}>{u.email}</div>
          <div className="m-chip" style={{ marginTop: 12 }}>Member since {new Date(u.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
        </div>

        {/* Settings groups */}
        {[
          {
            title: "Account",
            items: [
              { icon: "wallet", label: "Cash & bank links", value: "1 linked" },
              { icon: "fingerprint", label: "Biometrics", value: "Face ID" },
              { icon: "bell", label: "Notifications", value: "3 alerts" },
            ],
          },
          {
            title: "Preferences",
            items: [
              { icon: "settings", label: "Display currency", value: "SAR" },
              { icon: "eye", label: "Privacy mode", value: tweaks.privacy ? "On" : "Off" },
              { icon: "note", label: "Daily report", value: "8:00 am" },
            ],
          },
          {
            title: "Data",
            items: [
              { icon: "download", label: "Export CSV", value: "" },
              { icon: "info", label: "About VAULT", value: "v2.4" },
            ],
          },
        ].map(group => (
          <div key={group.title} style={{ marginTop: 22 }}>
            <div className="eyebrow" style={{ paddingLeft: 4, marginBottom: 8 }}>{group.title}</div>
            <div className="m-card" style={{ padding: 0, overflow: "hidden" }}>
              {group.items.map((it, i) => (
                <button key={it.label} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px", width: "100%", textAlign: "left",
                  borderTop: i ? "1px solid var(--line-2)" : "none",
                  background: "transparent",
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--paper-2)", color: "var(--ink-2)", display: "grid", placeItems: "center", border: "1px solid var(--line-2)" }}>
                    <MIcon name={it.icon} size={15} />
                  </div>
                  <span style={{ flex: 1, fontSize: 14 }}>{it.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "Geist Mono" }}>{it.value}</span>
                  <MIcon name="chevRight" size={14} color="var(--ink-3)" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <button onClick={onLogout} className="m-btn full" style={{ marginTop: 24, color: "var(--loss)", borderColor: "var(--loss-soft)" }}>
          Log out
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { MTopBar, MTabBar, MLogin, MDashboard, MHoldingDetail, MAnalytics, MTransactions, MProfile });
