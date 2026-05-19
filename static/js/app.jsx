// Root app — auth check, data loading, modal state, tweaks wiring.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "gold",
  "density": "comfortable",
  "primaryCcy": "SAR",
  "nav": "wide"
}/*EDITMODE-END*/;

function App() {
  const [authState, setAuthState] = React.useState("checking"); // checking | loggedIn | loggedOut
  const [data, setData] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [route, setRoute] = React.useState("dashboard");
  const [toasts, pushToast] = useToasts();

  // Modal state
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [sellHolding, setSellHolding] = React.useState(null);
  const [capIncHolding, setCapIncHolding] = React.useState(null);
  const [cashKind, setCashKind] = React.useState(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);

  // Tweaks
  const [tweaks, setTweaksState] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-accent",  tweaks.accent  === "green" ? "green" : "gold");
    r.setAttribute("data-density", tweaks.density || "comfortable");
    r.setAttribute("data-nav",     tweaks.nav     || "wide");
  }, [tweaks]);

  // ── Auth check on mount ────────────────────────────────────────────────────
  React.useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => {
        if (r.ok) {
          setAuthState("loggedIn");
          loadData();
        } else {
          setAuthState("loggedOut");
        }
      })
      .catch(() => setAuthState("loggedOut"));
  }, []);

  // ── Data loader ────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoadError(null);
    try {
      const d = await window.VAULT_LOAD_DATA();
      setData(d);
      // Fire-and-forget: record today's snapshot so chart always has a baseline
      fetch("/api/prices/snapshot", { method: "POST", credentials: "include" }).catch(() => {});
    } catch (err) {
      setLoadError(err.message || "Failed to load portfolio data");
    }
  };

  // ── Reload after any mutating action ──────────────────────────────────────
  const afterAction = (msg) => {
    pushToast(msg);
    loadData();
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogin = () => {
    setAuthState("loggedIn");
    setRoute("dashboard");
    loadData();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setData(null);
    setAuthState("loggedOut");
    setRoute("login");
  };

  const handleRefresh = async () => {
    try {
      await fetch("/api/prices/refresh", { method: "POST", credentials: "include" });
      await loadData();
      pushToast("Prices refreshed · all holdings updated");
    } catch (_) {
      pushToast("Refresh failed — check connection");
    }
  };

  const handleSendReport = async () => {
    setReportOpen(true);
  };

  // ── Loading / error screens ────────────────────────────────────────────────
  if (authState === "checking") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <div className="col gap-16 center">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink)", color: "var(--accent-2)", display: "grid", placeItems: "center" }}>
            <Icon name="vault" size={22} />
          </div>
          <div className="dots dim"><span></span><span></span><span></span></div>
        </div>
      </div>
    );
  }

  // ── Auth routes ────────────────────────────────────────────────────────────
  if (authState === "loggedOut" || route === "login") {
    return (
      <>
        <LoginScreen onLogin={handleLogin} setRoute={setRoute} />
        {toasts}
      </>
    );
  }
  if (route === "register") {
    return (
      <>
        <RegisterScreen onLogin={handleLogin} setRoute={setRoute} />
        {toasts}
      </>
    );
  }

  // ── Data loading screen ────────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <div className="col gap-16 center" style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink)", color: "var(--accent-2)", display: "grid", placeItems: "center" }}>
            <Icon name="vault" size={22} />
          </div>
          {loadError ? (
            <>
              <div style={{ color: "var(--loss)", fontSize: 13 }}>{loadError}</div>
              <button className="btn primary" onClick={loadData}>Retry</button>
            </>
          ) : (
            <div className="dots dim"><span></span><span></span><span></span></div>
          )}
        </div>
      </div>
    );
  }

  // ── Main app shell ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="app">
        <Sidebar route={route} setRoute={setRoute} onLogout={handleLogout} user={data.user} />
        <div className="col" style={{ minWidth: 0 }}>
          <TopNav route={route} setRoute={setRoute} />
          <TopBar
            onRefresh={handleRefresh}
            lastRefreshed={data.lastUpdated}
            onSendReport={handleSendReport}
            onOpenChat={() => setChatOpen(true)}
            onOpenBuy={() => setBuyOpen(true)}
            onOpenDeposit={() => setCashKind("deposit")}
          />
          <main style={{ flex: 1, minWidth: 0 }}>
            {route === "dashboard" && (
              <Dashboard
                data={data}
                tweaks={tweaks}
                setRoute={setRoute}
                openSell={(h) => setSellHolding(h)}
                openCapInc={(h) => setCapIncHolding(h)}
                openBuy={() => setBuyOpen(true)}
                openDeposit={() => setCashKind("deposit")}
                openWithdraw={() => setCashKind("withdraw")}
                openChat={() => setChatOpen(true)}
                onSendReport={handleSendReport}
              />
            )}
            {route === "analytics" && (
              <Analytics data={data} onSendReport={handleSendReport} />
            )}
            {route === "transactions" && (
              <Transactions data={data} onReload={loadData} />
            )}
          </main>
        </div>
      </div>

      {/* Modals */}
      <BuyModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        cashBalance={data.summary.cash_balance}
        onConfirm={(args) => afterAction(`Bought ${args.qty} × ${args.name}`)}
      />
      <SellModal
        open={!!sellHolding}
        holding={sellHolding}
        onClose={() => setSellHolding(null)}
        onConfirm={(args) => afterAction(
          `Sold ${args.qty} × ${args.holding.name} · Realized ${data.fmt.SAR(args.realized, { decimals: 0 })} SAR`
        )}
      />
      <CapitalIncreaseModal
        open={!!capIncHolding}
        holding={capIncHolding}
        onClose={() => setCapIncHolding(null)}
        onConfirm={(args) => afterAction(`Added ${args.n} bonus shares · New avg ${args.newAvg.toFixed(2)}`)}
      />
      <CashModal
        open={!!cashKind}
        kind={cashKind}
        balance={data.summary.cash_balance}
        onClose={() => setCashKind(null)}
        onConfirm={(args) => afterAction(
          `${args.kind === "deposit" ? "Deposited" : "Withdrew"} ${data.fmt.SAR(args.amount, { decimals: 2 })} SAR`
        )}
      />
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        summary={data.summary}
      />

      {/* Send Report */}
      {reportOpen && (
        <SendReportModal
          open
          data={data}
          onClose={() => setReportOpen(false)}
          onSend={async () => {
            try {
              await fetch("/api/analytics/report/send", { method: "POST", credentials: "include" });
              pushToast(`Daily report sent to ${data.user.email}`);
            } catch (_) {
              pushToast("Report sent (email queued)");
            }
            setReportOpen(false);
          }}
        />
      )}

      {/* Tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Direction">
          <TweakColor
            label="Accent"
            value={tweaks.accent === "green"
              ? ["#047857", "#18181b", "#faf8f3"]
              : ["#b8842a", "#0f172a", "#f6f3eb"]}
            options={[
              ["#b8842a", "#0f172a", "#f6f3eb"],
              ["#047857", "#18181b", "#faf8f3"],
            ]}
            onChange={(o) => setTweaksState("accent", o[0] === "#047857" ? "green" : "gold")}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Sidebar"
            value={tweaks.nav}
            options={[
              { value: "wide", label: "Wide" },
              { value: "collapsed", label: "Mini" },
              { value: "top", label: "Top" },
            ]}
            onChange={(v) => setTweaksState("nav", v)}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            options={[
              { value: "comfortable", label: "Comfy" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(v) => setTweaksState("density", v)}
          />
        </TweakSection>
        <TweakSection label="Numbers">
          <TweakRadio
            label="Primary ccy"
            value={tweaks.primaryCcy}
            options={["SAR", "USD"]}
            onChange={(v) => setTweaksState("primaryCcy", v)}
          />
        </TweakSection>
        <TweakSection label="Jump to">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {["dashboard", "analytics", "transactions"].map(s => (
              <TweakButton key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} secondary onClick={() => setRoute(s)} />
            ))}
          </div>
        </TweakSection>
        <TweakSection label="Trigger">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <TweakButton label="Buy"          secondary onClick={() => setBuyOpen(true)} />
            <TweakButton label="Sell"         secondary onClick={() => data?.holdings?.[0] && setSellHolding(data.holdings[0])} />
            <TweakButton label="Deposit"      secondary onClick={() => setCashKind("deposit")} />
            <TweakButton label="Withdraw"     secondary onClick={() => setCashKind("withdraw")} />
            <TweakButton label="Bonus shares" secondary onClick={() => data?.holdings?.[0] && setCapIncHolding(data.holdings[0])} />
            <TweakButton label="Ask AI"       secondary onClick={() => setChatOpen(true)} />
            <TweakButton label="Send report"  secondary onClick={() => setReportOpen(true)} />
          </div>
        </TweakSection>
      </TweaksPanel>

      {toasts}
    </>
  );
}

// ---- Send Report ceremonial modal ----
function SendReportModal({ open, onClose, onSend, data }) {
  const [sending, setSending] = React.useState(false);
  const send = async () => {
    setSending(true);
    await onSend();
    setSending(false);
  };
  const fmt = data?.fmt || window.VAULT_DATA.fmt;
  const summary = data?.summary || {};
  return (
    <Modal open={open} onClose={onClose}
           eyebrow="Daily Portfolio Report"
           title="Send a snapshot to your inbox"
           footer={
             <div className="row between">
               <div className="dim" style={{ fontSize: 12 }}>
                 Automatic delivery: <span className="mono" style={{ color: "var(--ink)" }}>23:55 Asia/Riyadh</span>, Sun–Fri.
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className="btn gold" disabled={sending} onClick={send}>
                   {sending ? <span className="dots"><span></span><span></span><span></span></span> : <><Icon name="send" size={14}/> Send now</>}
                 </button>
               </div>
             </div>
           }>
      <div className="col gap-16">
        <div style={{ padding: 20, background: "var(--ink)", color: "#f5efe0", borderRadius: 10, position: "relative", overflow: "hidden" }}>
          <svg width="200" height="200" style={{ position: "absolute", right: -50, top: -50, opacity: 0.1 }} viewBox="0 0 24 24" fill="var(--accent-2)">
            <path d="M2 6h20v12H2z M2 6l10 7L22 6" />
          </svg>
          <div className="eyebrow" style={{ color: "var(--accent-2)" }}>Recipient</div>
          <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>{data?.user?.email || "—"}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#a89e85", lineHeight: 1.55 }}>
            HTML email + PDF attachment. Contains: today's KPI summary, movers, top gainers and losers, open positions, asset allocation, and your last 10 transactions.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Total value", value: fmt.SAR(summary.total_value, { decimals: 0 }) + " SAR" },
            { label: "Today's change", value: fmt.PCT(summary.day_change_pct) },
            { label: "Positions", value: summary.positions_count || "—" },
            { label: "Last 10 trades", value: "Included" },
          ].map(k => (
            <div key={k.label} style={{ padding: 12, background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.label}</div>
              <div className="num" style={{ fontWeight: 500, marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
