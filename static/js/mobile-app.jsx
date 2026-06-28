// VAULT mobile — production app shell
// Receives real data + callbacks from the parent App component.
// Handles routing, tab bar, FAB, bottom sheets, and wires all API calls.

async function mobileApiFetch(path, opts = {}) {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) {
    const msg = await r.json().catch(() => ({}));
    throw new Error(msg.detail || `Request failed (${r.status})`);
  }
  return r.json();
}

function MobileApp({ data, afterAction, onLogout, onRefresh }) {
  const [route, setRoute] = React.useState("dashboard");
  const [sheet, setSheet] = React.useState(null);
  const [holding, setHolding] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  // Privacy mode — persisted in localStorage
  const [privacy, setPrivacy] = React.useState(
    () => localStorage.getItem("vault_privacy") === "1"
  );
  const tweaks = { privacy };
  const togglePrivacy = () => {
    const next = !privacy;
    setPrivacy(next);
    localStorage.setItem("vault_privacy", next ? "1" : "0");
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const navigate = (r) => { setRoute(r); setSheet(null); };
  const openHolding = (h) => { setHolding(h); setRoute("holding"); };

  // ── Buy / Add Holding ───────────────────────────────────────────────────────
  const handleBuy = async (args) => {
    try {
      await mobileApiFetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.name,
          ticker: args.ticker || null,
          asset_type: args.asset_type || args.type || "Stock",
          quantity: parseFloat(args.qty),
          avg_cost: parseFloat(args.price),
          current_price: parseFloat(args.price),
          purchase_date: args.purchase_date || new Date().toISOString().slice(0, 10),
          notes: args.notes || null,
        }),
      });
      afterAction(`Bought ${args.qty} × ${args.name}`);
    } catch (e) {
      showToast(e.message);
    }
  };

  // ── Sell (used by both manual and OCR scan) ─────────────────────────────────
  const handleSell = async (args) => {
    try {
      await mobileApiFetch("/api/portfolio/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holding_id: args.holding.id,
          quantity: parseFloat(args.qty),
          price: parseFloat(args.price),
          tx_date: new Date().toISOString().slice(0, 10),
        }),
      });
      afterAction(`Sold ${args.qty} × ${args.holding.name}`);
      navigate("dashboard");
    } catch (e) {
      showToast(e.message);
    }
  };

  // ── Deposit / Withdraw ──────────────────────────────────────────────────────
  const handleCash = async (amount, kind) => {
    try {
      const path = kind === "deposit" ? "/api/cash/deposit" : "/api/cash/withdraw";
      await mobileApiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount) }),
      });
      afterAction(kind === "deposit" ? "Deposit settled to wallet" : "Withdrawal sent");
    } catch (e) {
      showToast(e.message);
    }
  };

  // ── Fund flow (wallet-style add / withdraw for Fund holdings) ────────────────
  const handleFundFlow = async (args) => {
    try {
      await mobileApiFetch("/api/portfolio/fund-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holding_id: args.holding.id,
          amount: parseFloat(args.amount),
          direction: args.direction,
          tx_date: new Date().toISOString().slice(0, 10),
        }),
      });
      afterAction(
        `${args.direction === "ADD" ? "Added" : "Withdrew"} ${parseFloat(args.amount).toLocaleString()} SAR · ${args.holding.name}`
      );
      navigate("dashboard");
    } catch (e) {
      showToast(e.message);
    }
  };

  // ── Refresh prices ──────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    try {
      await mobileApiFetch("/api/prices/refresh", { method: "POST" });
      afterAction("Prices refreshed · all holdings updated");
    } catch (e) {
      showToast("Refresh failed — check connection");
    }
  };

  // ── Screen router ───────────────────────────────────────────────────────────
  let screen;
  if (route === "holding" && holding) {
    screen = (
      <MHoldingDetail
        data={data}
        tweaks={tweaks}
        holding={holding}
        onBack={() => navigate("dashboard")}
        openSell={() => setSheet("sell")}
        openBuy={() => setSheet("buy-more")}
        openFundFlow={() => setSheet("fund-flow")}
      />
    );
  } else if (route === "analytics") {
    screen = <MAnalytics data={data} tweaks={tweaks} navigate={navigate} route={route} />;
  } else if (route === "transactions") {
    screen = <MTransactions data={data} tweaks={tweaks} />;
  } else if (route === "profile") {
    screen = (
      <MProfile
        data={data}
        tweaks={tweaks}
        privacy={privacy}
        togglePrivacy={togglePrivacy}
        onLogout={onLogout}
        onRefresh={handleRefresh}
      />
    );
  } else {
    screen = (
      <MDashboard
        data={data}
        tweaks={tweaks}
        navigate={navigate}
        openHolding={openHolding}
        openBuy={() => setSheet("buy")}
        openDeposit={() => setSheet("deposit")}
        openWithdraw={() => setSheet("withdraw")}
        openAsk={() => setSheet("ask")}
        route={route}
      />
    );
  }

  const showTabBar = route !== "holding";
  const showFab    = route === "dashboard";

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100dvh",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      {screen}

      {/* Floating Action Buttons — Add Holding + Scan Invoice */}
      {showFab && (
        <>
          {/* Scan FAB — floats 66px above the main FAB */}
          <button
            className="fab"
            style={{
              width: 46, height: 46, borderRadius: 14,
              background: "var(--paper)", border: "1.5px solid var(--line)", color: "var(--ink)",
              bottom: "calc(max(72px, env(safe-area-inset-bottom, 0px) + 72px) + 66px)",
            }}
            onClick={() => setSheet("scan")}
            title="Scan invoice"
          >
            <MIcon name="scan" size={19} />
          </button>
          {/* Main FAB — Add holding */}
          <button className="fab" onClick={() => setSheet("buy")}>
            <MIcon name="plus" size={22} />
          </button>
        </>
      )}

      {/* Bottom Tab Bar */}
      {showTabBar && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <MTabBar route={route} navigate={navigate} style="labeled" />
        </div>
      )}

      {/* ── Sheets ─────────────────────────────────────────────────────── */}
      {sheet === "buy" && (
        <MBuySheet
          data={data}
          onClose={() => setSheet(null)}
          onSubmit={(args) => { handleBuy(args); setSheet(null); }}
        />
      )}
      {sheet === "buy-more" && holding && (
        <MBuySheet
          data={data}
          prefill={holding}
          onClose={() => setSheet(null)}
          onSubmit={(args) => { handleBuy(args); setSheet(null); }}
        />
      )}
      {sheet === "fund-flow" && holding && (
        <MFundFlowSheet
          holding={holding}
          data={data}
          onClose={() => setSheet(null)}
          onSubmit={(args) => { handleFundFlow(args); setSheet(null); }}
        />
      )}
      {sheet === "sell" && holding && (
        <MSellSheet
          holding={holding}
          onClose={() => setSheet(null)}
          onSubmit={(args) => { handleSell(args); setSheet(null); }}
        />
      )}
      {sheet === "deposit" && (
        <MDepositSheet
          onClose={() => setSheet(null)}
          onSubmit={(amount) => { handleCash(amount, "deposit"); setSheet(null); }}
          kind="deposit"
        />
      )}
      {sheet === "withdraw" && (
        <MDepositSheet
          onClose={() => setSheet(null)}
          onSubmit={(amount) => { handleCash(amount, "withdraw"); setSheet(null); }}
          kind="withdraw"
        />
      )}
      {sheet === "ask" && (
        <MAskSheet onClose={() => setSheet(null)} data={data} />
      )}
      {sheet === "scan" && (
        <MOCRSheet
          data={data}
          onClose={() => setSheet(null)}
          onBuy={(args) => { handleBuy(args); setSheet(null); }}
          onSell={(args) => { handleSell(args); setSheet(null); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="m-toast">
          <span className="dot" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

window.MobileApp = MobileApp;
window.mobileApiFetch = mobileApiFetch;
