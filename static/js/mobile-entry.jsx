// mobile-entry.jsx — Mobile PWA root.
// Handles auth check, data loading, and mounts MobileApp.

function MobileRoot() {
  const [authState, setAuthState] = React.useState("checking"); // checking | loggedIn | loggedOut
  const [data, setData] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // ── Auth check on mount ────────────────────────────────────────────────────
  React.useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => {
        if (r.ok) { setAuthState("loggedIn"); loadData(); }
        else setAuthState("loggedOut");
      })
      .catch(() => setAuthState("loggedOut"));
  }, []);

  // ── Data loader ────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoadError(null);
    try {
      const d = await window.VAULT_LOAD_DATA();
      setData(d);
      fetch("/api/prices/snapshot", { method: "POST", credentials: "include" }).catch(() => {});
    } catch (err) {
      setLoadError(err.message || "Failed to load portfolio data");
    }
  };

  const afterAction = (msg) => { showToast(msg); loadData(); };

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = async ({ username, password }) => {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    const r = await fetch("/api/auth/login", { method: "POST", body: form, credentials: "include" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Incorrect username or password");
    }
    setAuthState("loggedIn");
    loadData();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setData(null);
    setAuthState("loggedOut");
  };

  const handleRefresh = async () => {
    try {
      await fetch("/api/prices/refresh", { method: "POST", credentials: "include" });
      await loadData();
      showToast("Prices refreshed · all holdings updated");
    } catch (_) {
      showToast("Refresh failed — check connection");
    }
  };

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (authState === "checking" || (authState === "loggedIn" && !data && !loadError)) {
    return (
      <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink)", color: "var(--accent-2)", display: "grid", placeItems: "center" }}>
            <MIcon name="vault" size={22} />
          </div>
          <div className="dots dim"><span></span><span></span><span></span></div>
        </div>
      </div>
    );
  }

  // ── Load error screen ──────────────────────────────────────────────────────
  if (authState === "loggedIn" && loadError) {
    return (
      <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <div style={{ color: "var(--loss)", fontSize: 13 }}>{loadError}</div>
          <button className="m-btn primary" onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  // ── Auth screen ────────────────────────────────────────────────────────────
  if (authState === "loggedOut") {
    return <MLogin onLogin={handleLogin} />;
  }

  // ── Mobile app shell ───────────────────────────────────────────────────────
  return (
    <>
      <MobileApp
        data={data}
        afterAction={afterAction}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
      />
      {toast && (
        <div className="m-toast">
          <span className="dot" />
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<MobileRoot />);
