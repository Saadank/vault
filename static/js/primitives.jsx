// Shared primitives: icons, sidebar, topbar, KPI cards, etc.
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ----- Icons (stroke-based, 1.6px) -----
const Icon = ({ name, size = 18, className, style }) => {
  const paths = {
    vault: <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8v-1.5M12 16.7v-1.5M8.8 12H7.3M16.7 12h-1.5" />
    </>,
    dashboard: <>
      <rect x="3" y="3" width="7" height="9" rx="1.4" />
      <rect x="14" y="3" width="7" height="5" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="10" width="7" height="11" rx="1.4" />
    </>,
    analytics: <>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </>,
    transactions: <>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </>,
    settings: <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </>,
    search: <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    refresh: <>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </>,
    chevDown: <path d="m6 9 6 6 6-6" />,
    chevRight: <path d="m9 6 6 6-6 6" />,
    chevLeft: <path d="m15 6-6 6 6 6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    sparkle: <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="2.4" />
    </>,
    download: <>
      <path d="M12 3v12M7 11l5 5 5-5" />
      <path d="M4 21h16" />
    </>,
    mail: <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 7 8.5-7" />
    </>,
    edit: <path d="M14 4l6 6L9 21H3v-6L14 4Z" />,
    trash: <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>,
    dots: <>
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </>,
    up: <path d="m6 14 6-6 6 6" />,
    down: <path d="m6 10 6 6 6-6" />,
    eye: <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    eyeOff: <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10.4 10.4 0 0 1 12 6c6.5 0 10 6 10 6a17.3 17.3 0 0 1-3.3 4.2M6.1 6.1C3.1 7.9 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>,
    coin: <>
      <ellipse cx="12" cy="6.5" rx="8" ry="3" />
      <path d="M4 6.5v11c0 1.7 3.6 3 8 3s8-1.3 8-3v-11" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>,
    wallet: <>
      <path d="M3 7v12a2 2 0 0 0 2 2h15v-5" />
      <path d="M19 16h-4a2 2 0 0 1 0-4h4v4Z" />
      <path d="M16 7H5a2 2 0 0 1 0-4h13a2 2 0 0 1 2 2v3" />
    </>,
    arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
    arrowDownLeft: <path d="m17 7-10 10M15 17H7V9" />,
    gift: <>
      <path d="M20 12v9H4v-9" />
      <path d="M2 8h20v4H2z" />
      <path d="M12 8v13M12 8s-3-3-5-3a2 2 0 1 0 0 4M12 8s3-3 5-3a2 2 0 1 1 0 4" />
    </>,
    bell: <>
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
    saudi: <>
      <path d="M3 14c2-1 3-1 4 0s2 1 4 0 3-1 4 0 2 1 4 0" />
      <path d="M3 18c2-1 3-1 4 0s2 1 4 0 3-1 4 0 2 1 4 0" />
    </>,
    target: <>
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>,
    flame: <path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-1 6 3 6 3-5 0-11Z" />,
    send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round"
         className={className} style={style}>
      {paths[name] || null}
    </svg>
  );
};

// ----- Brand mark -----
const Brandmark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="var(--ink)" />
    <path d="M9 9.5 16 22l7-12.5" stroke="var(--accent-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.5 9.5h9" stroke="var(--accent-2)" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="16" cy="16" r="14.25" stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.0" />
  </svg>
);

// ----- Delta (▲▼ + value) -----
const Delta = ({ value, suffix = "", decimals = 2, prefix = "", className = "" }) => {
  const up = value > 0, down = value < 0;
  const dir = up ? "up" : down ? "down" : "flat";
  const glyph = up ? "▲" : down ? "▼" : "■";
  return (
    <span className={`delta ${dir} ${className}`}>
      <span className="arrow" aria-hidden>{glyph}</span>
      <span>{prefix}{Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
    </span>
  );
};

// ----- Sidebar -----
const Sidebar = ({ route, setRoute, onLogout, user }) => {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "transactions", label: "Transactions", icon: "transactions" },
  ];
  return (
    <aside className="sidebar">
      <div className="row gap-8" style={{ padding: "4px 6px 18px" }}>
        <Brandmark />
        <div className="sidebar-brand-text col">
          <div className="serif" style={{ fontSize: 20, lineHeight: 1, letterSpacing: "0.04em" }}>VAULT</div>
          <div className="dim" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase" }}>Private Portfolio</div>
        </div>
      </div>

      <div className="sidebar-section-label" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", padding: "10px 10px 6px" }}>Workspace</div>
      <nav className="col gap-4">
        {items.map(it => (
          <button key={it.id}
                  className={`nav-item ${route === it.id ? "active" : ""}`}
                  onClick={() => setRoute(it.id)}>
            <Icon name={it.icon} size={17} className="nav-icon" />
            <span className="nav-label">{it.label}</span>
          </button>
        ))}
      </nav>

      <div style={{ marginTop: "auto" }} className="col gap-8">
        <div className="sidebar-section-label" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", padding: "10px 10px 6px" }}>Account</div>
        <div className="row gap-8" style={{ padding: "8px 10px", borderRadius: 8, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          <div style={{
            width: 30, height: 30, borderRadius: 999,
            background: "var(--ink)", color: "#f5efe0",
            display: "grid", placeItems: "center",
            fontWeight: 600, fontSize: 12, flexShrink: 0,
          }}>{(user?.full_name || user?.username || "U").slice(0, 2).toUpperCase()}</div>
          <div className="sidebar-user-text col" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>{user?.full_name || user?.username || "—"}</div>
            <div className="truncate dim" style={{ fontSize: 11 }}>{user?.email || "—"}</div>
          </div>
        </div>
        <button className="nav-item" onClick={onLogout} style={{ marginTop: 2 }}>
          <Icon name="arrowDownLeft" size={17} className="nav-icon" />
          <span className="nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
};

// ----- TopNav (horizontal alt) -----
const TopNav = ({ route, setRoute }) => {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "transactions", label: "Transactions", icon: "transactions" },
  ];
  return (
    <div className="topnav">
      <div className="row gap-8" style={{ paddingRight: 18, marginRight: 6, borderRight: "1px solid var(--line)" }}>
        <Brandmark size={22} />
        <div className="serif" style={{ fontSize: 18, letterSpacing: "0.04em" }}>VAULT</div>
      </div>
      {items.map(it => (
        <button key={it.id}
                className={`nav-item ${route === it.id ? "active" : ""}`}
                onClick={() => setRoute(it.id)}>
          <Icon name={it.icon} size={16} className="nav-icon" />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
};

// ----- TopBar (search + actions) -----
const TopBar = ({ onRefresh, lastRefreshed, onSendReport, onOpenChat, onOpenBuy, onOpenDeposit }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Format the ISO timestamp from the backend into a human-readable string
  const fmtLastUpdated = (iso) => {
    if (!iso) return "never";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1)  return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `${diffH}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const [lastTs, setLastTs] = useState(() => fmtLastUpdated(lastRefreshed));

  // Re-derive label when the prop updates (i.e. after a reload)
  useEffect(() => { setLastTs(fmtLastUpdated(lastRefreshed)); }, [lastRefreshed]);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();   // await the real API call; spinner stays until it's done
      setLastTs("just now");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 28px",
      borderBottom: "1px solid var(--line)",
      background: "var(--paper)",
      position: "sticky", top: 0, zIndex: 30,
    }}>
      <button className="row gap-8" onClick={() => setSearchOpen(true)} style={{
        flex: "0 1 320px",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid var(--line)",
        background: "var(--paper-2)",
        color: "var(--ink-3)",
        fontSize: 13,
      }}>
        <Icon name="search" size={15} />
        <span>Search holdings, tickers…</span>
        <span style={{ marginLeft: "auto" }} className="kbd">⌘K</span>
      </button>

      <div className="grow" />

      <button className="pill" onClick={doRefresh} style={{ cursor: "pointer" }}>
        <Icon name="refresh" size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
        <span className="mono dim" style={{ fontSize: 11 }}>Updated {lastTs}</span>
      </button>

      <button className="btn sm" onClick={onOpenDeposit}>
        <Icon name="wallet" size={14} />
        Deposit
      </button>
      <button className="btn sm gold" onClick={onOpenBuy}>
        <Icon name="plus" size={14} />
        Add Holding
      </button>
      <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
      <button className="btn sm ghost" onClick={onOpenChat} title="Ask Vault AI">
        <Icon name="sparkle" size={15} style={{ color: "var(--accent)" }} />
        Ask Vault
      </button>
      <button className="btn sm ghost" title="Notifications" style={{ padding: "6px 8px" }}>
        <Icon name="bell" size={16} />
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </header>
  );
};

// ----- KPI Card -----
const KPI = ({ label, value, sub, accent, hint, large, suffix }) => (
  <div className="card" style={{ padding: large ? 22 : 18, position: "relative", overflow: "hidden" }}>
    <div className="row between" style={{ marginBottom: large ? 14 : 10 }}>
      <div className="eyebrow">{label}</div>
      {hint}
    </div>
    <div className={large ? "hero-num" : "mid-num"} style={{ color: accent || "var(--ink)" }}>
      {value}
      {suffix && <span className="muted" style={{ fontFamily: "Geist", fontSize: large ? 14 : 12, marginLeft: 6, letterSpacing: 0 }}>{suffix}</span>}
    </div>
    {sub && <div style={{ marginTop: large ? 12 : 8, fontSize: 12.5 }}>{sub}</div>}
  </div>
);

// ----- Section Header -----
const Section = ({ eyebrow, title, action, children }) => (
  <section className="col gap-16">
    <div className="row between" style={{ alignItems: "flex-end" }}>
      <div className="col gap-4">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <h2 className="section-title">{title}</h2>}
      </div>
      <div>{action}</div>
    </div>
    {children}
  </section>
);

// ----- Asset type chip -----
const TypeChip = ({ type }) => {
  const map = {
    Stock: { c: "var(--ink-2)", bg: "var(--paper-2)" },
    ETF: { c: "var(--ink-2)", bg: "var(--paper-2)" },
    Crypto: { c: "#7c3aed", bg: "#f0eaff" },
    "Real Estate": { c: "#0e7490", bg: "#dcf3f3" },
    Bond: { c: "#a16207", bg: "#fbf0d4" },
    Alternative: { c: "var(--ink-2)", bg: "var(--paper-2)" },
  };
  const s = map[type] || map.Stock;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10.5, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 4,
      color: s.c, background: s.bg,
    }}>{type}</span>
  );
};

// ----- Toast -----
const useToasts = () => {
  const [list, setList] = useState([]);
  const push = useCallback((msg, kind = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setList(s => [...s, { id, msg, kind }]);
    setTimeout(() => setList(s => s.filter(t => t.id !== id)), 3000);
  }, []);
  const node = (
    <div className="toast-stack">
      {list.map(t => (
        <div key={t.id} className="toast">
          <span className={t.kind === "ok" ? "ok" : ""}>●</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
  return [node, push];
};

// Expose globals for other babel scripts
Object.assign(window, { Icon, Brandmark, Delta, Sidebar, TopNav, TopBar, KPI, Section, TypeChip, useToasts });
