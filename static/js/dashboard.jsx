// Dashboard screen — KPI strip, chart, holdings table, cash card

const Dashboard = ({ data, tweaks, setRoute, openSell, openCapInc, openUpdatePrice, openBuy, openDeposit, openWithdraw, openChat, onSendReport }) => {
  const { summary, holdings, chart, fmt } = data;
  const [range, setRange] = React.useState("1M");
  const [hoverPt, setHoverPt] = React.useState(null);
  const [primaryCcy, setPrimaryCcy] = React.useState(tweaks.primaryCcy || "SAR");
  const [rowMenu, setRowMenu] = React.useState(null);
  const [sort, setSort] = React.useState({ col: "unrealized_pnl_sar", dir: -1 });

  const toggleSort = (col) => {
    setSort(s => s.col === col ? { col, dir: s.dir * -1 } : { col, dir: -1 });
  };

  const sortedHoldings = React.useMemo(() => {
    return [...holdings].sort((a, b) => {
      const va = a[sort.col], vb = b[sort.col];
      if (typeof va === "string") return sort.dir * va.localeCompare(vb);
      return sort.dir * ((va ?? 0) - (vb ?? 0));
    });
  }, [holdings, sort]);

  React.useEffect(() => { setPrimaryCcy(tweaks.primaryCcy || "SAR"); }, [tweaks.primaryCcy]);

  const filteredChart = React.useMemo(() => {
    if (!chart || chart.length === 0) return [];
    if (range === "Max") return chart;
    const today = new Date();
    const cutoff = new Date(today);
    if      (range === "1D")  cutoff.setDate(today.getDate() - 1);
    else if (range === "1W")  cutoff.setDate(today.getDate() - 7);
    else if (range === "1M")  cutoff.setMonth(today.getMonth() - 1);
    else if (range === "3M")  cutoff.setMonth(today.getMonth() - 3);
    else if (range === "YTD") { cutoff.setMonth(0); cutoff.setDate(1); }
    else if (range === "1Y")  cutoff.setFullYear(today.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = chart.filter(p => p.date >= cutoffStr);
    return filtered.length > 1 ? filtered : chart.slice(-2);
  }, [chart, range]);

  const totalValue = summary.total_value;
  const showPt = hoverPt || filteredChart[filteredChart.length - 1];
  const firstPt = filteredChart[0];
  const rangeChange = (showPt?.value || 0) - (firstPt?.value || 0);
  const rangeChangePct = firstPt ? (rangeChange / firstPt.value) * 100 : 0;

  return (
    <div className="col gap-24" style={{ padding: "24px 28px 40px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Page header */}
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="col gap-4">
          <div className="eyebrow">Portfolio · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="serif" style={{ fontSize: 34, lineHeight: 1, letterSpacing: "-0.01em" }}>
            {(() => {
              const h = new Date().getHours();
              const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
              const name = data.user?.full_name?.split(" ")[0] || data.user?.username || "there";
              return `${greet}, ${name}.`;
            })()}
          </h1>
        </div>
        <div className="row gap-8">
          <button className="btn" onClick={onSendReport}>
            <Icon name="mail" size={14} />
            Send daily report
          </button>
        </div>
      </div>

      {/* Hero — total value + chart */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row between" style={{ padding: "24px 28px 0", alignItems: "flex-start" }}>
          <div className="col gap-6">
            <div className="eyebrow">Total Portfolio Value</div>
            <div className="row gap-12" style={{ alignItems: "baseline" }}>
              <div className="hero-num" style={{ fontSize: 56 }}>
                {fmt.SAR(showPt.value, { decimals: 2 })}
                <span className="muted" style={{ fontFamily: "Geist", fontSize: 14, marginLeft: 8, letterSpacing: 0 }}>SAR</span>
              </div>
              <Delta value={summary.day_change_pct} suffix="% today" />
            </div>
            <div className="row gap-10 dim" style={{ fontSize: 12.5, marginTop: 4 }}>
              <span className="mono">{showPt.date}</span>
              <span>·</span>
              <span>{range} change <Delta className="" value={rangeChangePct} suffix="%" /></span>
              <span>·</span>
              <span>≈ ${fmt.USD(showPt.value / 3.75)} USD</span>
            </div>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <div style={{ padding: "8px 14px 14px" }}>
          <AreaChart data={filteredChart} height={300} accent="var(--accent)" onHover={setHoverPt} />
        </div>

        {/* KPI strip embedded in chart card footer */}
        <div className="hairline" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {[
            { label: "Invested", value: fmt.SAR(summary.total_invested, { decimals: 0 }), suffix: "SAR" },
            { label: "Unrealized P&L", value: fmt.SAR(summary.unrealized_pnl, { decimals: 0 }), suffix: "SAR", delta: summary.unrealized_pct },
            { label: "Realized P&L", value: fmt.SAR(summary.realized_pnl, { decimals: 0 }), suffix: "SAR", deltaUp: true },
            { label: "Cash on hand", value: fmt.SAR(summary.cash_balance, { decimals: 0 }), suffix: "SAR" },
            { label: "Open positions", value: summary.positions_count, suffix: "" },
          ].map((k, i) => (
            <div key={k.label} style={{
              padding: "16px 22px",
              borderRight: i < 4 ? "1px solid var(--line)" : "none",
            }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>{k.label}</div>
              <div className="mid-num" style={{ marginTop: 6, fontSize: 22 }}>
                {k.value}
                {k.suffix && <span className="muted" style={{ fontFamily: "Geist", fontSize: 11, marginLeft: 4 }}>{k.suffix}</span>}
              </div>
              {k.delta !== undefined && (
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  <Delta value={k.delta} suffix="%" />
                </div>
              )}
              {k.deltaUp && (
                <div style={{ marginTop: 4, fontSize: 11.5 }} className="dim">From closed positions</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Holdings table + Cash sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24 }}>
        {/* Holdings */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="row between" style={{ padding: "18px 20px" }}>
            <div className="col gap-2">
              <div className="row gap-10">
                <h3 className="serif" style={{ fontSize: 22 }}>Holdings</h3>
                <span className="chip">{holdings.length} positions</span>
              </div>
              <div className="dim" style={{ fontSize: 12 }}>Hover a row to act on it · Live prices via Yahoo Finance</div>
            </div>
            <div className="row gap-8">
              <button className="btn sm">
                <Icon name="download" size={13} /> Export CSV
              </button>
              <button className="btn sm gold" onClick={openBuy}>
                <Icon name="plus" size={13} /> Buy
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    { label: "Asset",       col: "name",               cls: "" },
                    { label: "Type",        col: null,                 cls: "" },
                    { label: "Qty",         col: "quantity",           cls: "num-cell right" },
                    { label: "Avg Cost",    col: "avg_cost",           cls: "num-cell right" },
                    { label: "Price",       col: "current_price",      cls: "num-cell right" },
                    { label: "Value (SAR)", col: "market_value_sar",   cls: "num-cell right" },
                    { label: "Value (USD)", col: "market_value_usd",   cls: "num-cell right" },
                    { label: "P&L",         col: "unrealized_pnl_sar", cls: "num-cell right" },
                    { label: "Return",      col: "unrealized_pct",     cls: "num-cell right" },
                  ].map(({ label, col, cls }) => (
                    <th key={label} className={cls}
                        onClick={col ? () => toggleSort(col) : undefined}
                        style={col ? { cursor: "pointer", userSelect: "none" } : {}}>
                      {label}
                      {col && sort.col === col && (
                        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>
                          {sort.dir === -1 ? "▼" : "▲"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th style={{ width: 64 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map(h => {
                  const up = h.unrealized_pct >= 0;
                  return (
                    <tr key={h.id}>
                      <td>
                        <div className="col gap-2">
                          <div className="row gap-8">
                            <span style={{ fontWeight: 500 }}>{h.name}</span>
                            {h.ticker && <span className="ticker">{h.ticker}</span>}
                          </div>
                        </div>
                      </td>
                      <td><TypeChip type={h.asset_type} /></td>
                      <td className="num-cell right">{h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="num-cell right dim">{h.avg_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="mono" style={{ fontSize: 10 }}>{h.currency}</span></td>
                      <td className="num-cell right">{h.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="num-cell right" style={{ fontWeight: 500 }}>{fmt.SAR(h.market_value_sar, { decimals: 0 })}</td>
                      <td className="num-cell right dim">${fmt.USD(h.market_value_usd)}</td>
                      <td className="num-cell right">
                        <span className={`delta ${up ? "up" : "down"}`}>
                          <span className="arrow">{up ? "▲" : "▼"}</span>
                          <span>{fmt.SAR(Math.abs(h.unrealized_pnl_sar), { decimals: 0 })}</span>
                        </span>
                      </td>
                      <td className="num-cell right">
                        <Delta value={h.unrealized_pct} suffix="%" />
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          {h.asset_type === "Fund" && (
                            <button className="btn xs gold" onClick={() => openUpdatePrice(h)}>Update value</button>
                          )}
                          <button className="btn xs" onClick={() => openSell(h)}>Sell</button>
                          <button className="btn xs ghost" onClick={() => setRowMenu(rowMenu === h.id ? null : h.id)} style={{ padding: "4px 6px", position: "relative" }}>
                            <Icon name="dots" size={14} />
                            {rowMenu === h.id && (
                              <div style={{
                                position: "absolute", right: 0, top: "calc(100% + 4px)",
                                background: "var(--paper)", border: "1px solid var(--line)",
                                borderRadius: 8, boxShadow: "var(--shadow-md)",
                                minWidth: 160, padding: 4, zIndex: 10,
                                textAlign: "left",
                              }} onClick={e => e.stopPropagation()}>
                                {[
                                  { label: "Update price", icon: "edit", onClick: () => { openUpdatePrice(h); setRowMenu(null); } },
                                  { label: "Bonus shares", icon: "gift", onClick: () => { openCapInc(h); setRowMenu(null); } },
                                  { label: "Delete holding", icon: "trash", danger: true },
                                ].map((it, i) => (
                                  <button key={i} onClick={e => { e.stopPropagation(); it.onClick && it.onClick(); }}
                                          style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            width: "100%", padding: "8px 10px",
                                            fontSize: 12.5, color: it.danger ? "var(--loss)" : "var(--ink)",
                                            borderRadius: 6, textAlign: "left",
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
                                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    <Icon name={it.icon} size={13} />
                                    {it.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column — Cash + AI nudge + Movers */}
        <div className="col gap-16">
          {/* Cash card */}
          <div className="card" style={{ padding: 20, background: "var(--ink)", color: "#f5efe0", borderColor: "var(--ink)" }}>
            <div className="row between">
              <div className="eyebrow" style={{ color: "var(--accent-2)" }}>Cash Wallet</div>
              <Icon name="wallet" size={16} style={{ color: "var(--accent-2)" }} />
            </div>
            <div className="hero-num" style={{ marginTop: 16, color: "#f5efe0" }}>
              {fmt.SAR(summary.cash_balance, { decimals: 2 })}
              <span style={{ fontFamily: "Geist", fontSize: 14, marginLeft: 6, color: "#a89e85" }}>SAR</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#a89e85" }}>
              ≈ ${fmt.USD(summary.cash_balance / 3.75)} USD
            </div>
            <div style={{ height: 1, background: "#2a2316", margin: "16px 0" }} />
            <div className="row gap-8">
              <button onClick={openDeposit} className="btn gold sm grow">
                <Icon name="arrowDownLeft" size={13} /> Deposit
              </button>
              <button onClick={openWithdraw} className="btn sm grow" style={{ background: "transparent", color: "#f5efe0", border: "1px solid #3a3322" }}>
                <Icon name="arrowUpRight" size={13} /> Withdraw
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "#7c7460", lineHeight: 1.5 }}>
              All buys deduct from this wallet. Sells and deposits credit it.
            </div>
          </div>

          {/* AI nudge */}
          <button onClick={openChat} style={{
            textAlign: "left",
            padding: 18,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
          }}>
            <svg style={{ position: "absolute", top: -20, right: -20, opacity: 0.08 }} width="120" height="120" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
            </svg>
            <div className="row gap-10">
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>
                <Icon name="sparkle" size={14} />
              </div>
              <div className="col gap-2">
                <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>Ask Vault AI</div>
                <div className="dim" style={{ fontSize: 11.5 }}>Why is SABIC down? · 1-tap</div>
              </div>
              <Icon name="chevRight" size={14} style={{ marginLeft: "auto", color: "var(--ink-3)" }} />
            </div>
          </button>

          {/* Top movers — sorted by unrealized return */}
          <div className="card" style={{ padding: 18 }}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <div className="eyebrow">Top movers</div>
              <span className="mono dim" style={{ fontSize: 10 }}>Total return</span>
            </div>
            {holdings.length === 0 ? (
              <div className="dim" style={{ fontSize: 12, textAlign: "center", padding: "12px 0" }}>No positions yet</div>
            ) : [...holdings]
              .sort((a, b) => Math.abs(b.unrealized_pct) - Math.abs(a.unrealized_pct))
              .slice(0, 5)
              .map(m => (
                <div key={m.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
                  <div className="col gap-2" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                    {m.ticker && <div className="ticker">{m.ticker}</div>}
                  </div>
                  <div className="num-cell right" style={{ fontSize: 12 }}>
                    {fmt.SAR(m.unrealized_pnl_sar, { decimals: 0 })}
                  </div>
                  <Delta value={m.unrealized_pct} suffix="%" decimals={2} className="" />
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Recent activity preview */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "18px 20px" }}>
          <div className="col gap-2">
            <h3 className="serif" style={{ fontSize: 22 }}>Recent activity</h3>
            <div className="dim" style={{ fontSize: 12 }}>Last 5 transactions across all positions</div>
          </div>
          <button className="btn sm" onClick={() => setRoute?.("transactions")}>View all transactions →</button>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Asset</th>
              <th className="num-cell right">Quantity</th>
              <th className="num-cell right">Price</th>
              <th className="num-cell right">Total</th>
              <th className="num-cell right">Realized P&L</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.slice(0, 5).map(t => {
              const isBuy = t.tx_type === "BUY";
              const isSell = t.tx_type === "SELL";
              const isCash = t.tx_type === "DEPOSIT" || t.tx_type === "WITHDRAW";
              const isCap = t.tx_type === "CAPITAL_INCREASE";
              const color = isBuy ? "var(--ink-2)" : isSell ? "var(--accent-ink)" : isCap ? "var(--accent-ink)" : "var(--ink-2)";
              const bg = isBuy ? "var(--paper-2)" : isSell ? "var(--accent-soft)" : isCap ? "var(--accent-soft)" : "var(--paper-2)";
              return (
                <tr key={t.id}>
                  <td className="mono dim" style={{ fontSize: 11.5 }}>{t.tx_date}</td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 10.5, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                      padding: "2px 7px", borderRadius: 4, color, background: bg,
                    }}>{t.tx_type.replace("_", " ")}</span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{t.asset_name}</td>
                  <td className="num-cell right">{t.quantity ?? "—"}</td>
                  <td className="num-cell right">{t.price != null ? t.price.toLocaleString() : "—"}</td>
                  <td className="num-cell right" style={{ fontWeight: 500 }}>{fmt.SAR(t.total, { decimals: 2 })} <span className="mono dim" style={{ fontSize: 10 }}>SAR</span></td>
                  <td className="num-cell right">
                    {t.realized_pnl != null ? <Delta value={t.realized_pnl} suffix="" /> : <span className="dim">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Empty-state dashboard (for new users with no holdings / no cash)
const DashboardEmpty = ({ openDeposit, openBuy }) => (
  <div className="col gap-24" style={{ padding: "24px 28px 40px", maxWidth: 1480, margin: "0 auto" }}>
    <div className="col gap-4">
      <div className="eyebrow">Portfolio</div>
      <h1 className="serif" style={{ fontSize: 34, lineHeight: 1 }}>Welcome to VAULT, Saad.</h1>
    </div>

    <div className="card stripe-bg" style={{ padding: 40, textAlign: "center", position: "relative" }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--ink)", color: "var(--accent-2)", display: "grid", placeItems: "center", margin: "0 auto" }}>
        <Icon name="vault" size={28} />
      </div>
      <h2 className="serif" style={{ fontSize: 32, marginTop: 18 }}>Your vault is empty.</h2>
      <p className="dim" style={{ maxWidth: 460, margin: "8px auto 0", fontSize: 14, lineHeight: 1.6 }}>
        VAULT tracks every halala from cash deposit to capital gain. Start by depositing funds into your wallet,
        then buy your first position. We'll handle the rest.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600, margin: "32px auto 0" }}>
        <div className="card" style={{ padding: 20, textAlign: "left", background: "var(--paper)" }}>
          <div className="row gap-10">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>
              <span className="serif" style={{ fontSize: 16 }}>1</span>
            </div>
            <div className="col gap-2">
              <div style={{ fontWeight: 500 }}>Deposit cash</div>
              <div className="dim" style={{ fontSize: 11.5 }}>Funds your buying power.</div>
            </div>
          </div>
          <button className="btn primary full" style={{ marginTop: 14 }} onClick={openDeposit}>
            <Icon name="wallet" size={14} /> Deposit funds
          </button>
        </div>
        <div className="card" style={{ padding: 20, textAlign: "left", background: "var(--paper)", opacity: 0.6 }}>
          <div className="row gap-10">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--paper-2)", color: "var(--ink-3)", display: "grid", placeItems: "center", border: "1px solid var(--line)" }}>
              <span className="serif" style={{ fontSize: 16 }}>2</span>
            </div>
            <div className="col gap-2">
              <div style={{ fontWeight: 500 }}>Buy your first position</div>
              <div className="dim" style={{ fontSize: 11.5 }}>Tadawul, US stocks, crypto, real estate.</div>
            </div>
          </div>
          <button className="btn full" style={{ marginTop: 14 }} disabled>
            Add holding (after deposit)
          </button>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { Dashboard, DashboardEmpty });
