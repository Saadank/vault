// VAULT mobile — shared atoms: Icon, MicroChart, Sparkline, Delta, TypeChip, helpers

const MIcon = ({ name, size = 20, color = "currentColor", stroke = 1.6, style }) => {
  const paths = {
    home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
    ledger: <><path d="M4 7h13l-3-3M20 17H7l3 3" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    bell: <><path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></>,
    chevRight: <path d="m9 6 6 6-6 6" />,
    chevDown: <path d="m6 9 6 6 6-6" />,
    chevLeft: <path d="m15 6-6 6 6 6" />,
    chevUp: <path d="m6 15 6-6 6 6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.1A10.4 10.4 0 0 1 12 6c6.5 0 10 6 10 6a17.3 17.3 0 0 1-3.3 4.2M6.1 6.1C3.1 7.9 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    sparkle: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="2.4" /></>,
    arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
    arrowDownLeft: <path d="m17 7-10 10M15 17H7V9" />,
    arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /></>,
    wallet: <><path d="M3 7v12a2 2 0 0 0 2 2h15v-5" /><path d="M19 16h-4a2 2 0 0 1 0-4h4v4Z" /><path d="M16 7H5a2 2 0 0 1 0-4h13a2 2 0 0 1 2 2v3" /></>,
    fingerprint: <><path d="M6 14a6 6 0 0 1 12 0v2" /><path d="M9 10a3 3 0 0 1 6 0v6" /><path d="M12 13v4" /><path d="M5 20a14 14 0 0 1 14 0" /></>,
    download: <><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 21h16" /></>,
    filter: <><path d="M3 5h18M6 12h12M10 19h4" /></>,
    dots: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    gift: <><path d="M20 12v9H4v-9" /><path d="M2 8h20v4H2z" /><path d="M12 8v13M12 8s-3-3-5-3a2 2 0 1 0 0 4M12 8s3-3 5-3a2 2 0 1 1 0 4" /></>,
    flame: <path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-1 6 3 6 3-5 0-11Z" />,
    pie: <><path d="M12 2a10 10 0 1 0 10 10H12V2Z" /><path d="M12 2a10 10 0 0 1 10 10" /></>,
    send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
    note: <><path d="M5 3h11l3 3v15H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    swap: <><path d="M7 7h13l-3-3M17 17H4l3 3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
    apple: <path d="M16 4c-1.5 0-3 1.2-3 2.5 1.6 0 3-1.4 3-2.5Zm3.5 6c-1.5-2-4-2-5-2s-2 .7-3 .7S9.5 8 8 8c-2 0-4 2-4 5.5 0 4 3 8.5 5 8.5 1 0 1.7-.7 3-.7 1.4 0 2 .7 3 .7 2 0 4-3 4.5-5.5-2-.7-3-3-3-4 0-1.4 1-2.5 3-2.5Z" />,
    face: <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" /></>,
    arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
    camera: <><rect x="2" y="7" width="20" height="15" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    scan: <><path d="M3 9V5a2 2 0 0 1 2-2h4M3 15v4a2 2 0 0 0 2 2h4M15 3h4a2 2 0 0 1 2 2v4M15 21h4a2 2 0 0 0 2-2v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/></>,
    arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
    vault: <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8v-1.5M12 16.7v-1.5M8.8 12H7.3M16.7 12h-1.5" />
    </>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke={color} strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths[name] || null}
    </svg>
  );
};

// Brand mark — triangular checkmark monogram on dark
const MBrandmark = ({ size = 36, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect x="1" y="1" width="30" height="30" rx="8" fill={light ? "#f5efe0" : "var(--ink)"} />
    <path d="M9 9.5 16 22l7-12.5" stroke={light ? "var(--ink)" : "var(--accent-2)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.5 9.5h9" stroke={light ? "var(--ink)" : "var(--accent-2)"} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Delta with arrow
const MDelta = ({ value, suffix = "", decimals = 2, small = false }) => {
  const up = value > 0, down = value < 0;
  const dir = up ? "up" : down ? "down" : "flat";
  const glyph = up ? "▲" : down ? "▼" : "■";
  return (
    <span className={`delta ${dir}`} style={{ fontSize: small ? 11 : 13 }}>
      <span className="arrow" aria-hidden>{glyph}</span>
      <span>{Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
    </span>
  );
};

// Asset type chip — same vocabulary as web
const MTypeChip = ({ type, small = false }) => {
  const map = {
    Stock: { c: "var(--ink-2)", bg: "var(--paper-2)" },
    ETF: { c: "var(--ink-2)", bg: "var(--paper-2)" },
    Crypto: { c: "#7c3aed", bg: "#f0eaff" },
    "Real Estate": { c: "#0e7490", bg: "#dcf3f3" },
    Bond: { c: "#a16207", bg: "#fbf0d4" },
  };
  const s = map[type] || map.Stock;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: small ? 9.5 : 10, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase",
      padding: small ? "1px 5px" : "2px 6px", borderRadius: 4,
      color: s.c, background: s.bg,
    }}>{type}</span>
  );
};

// Privacy-masked value: ●●●●● when hidden
const MValue = ({ value, hidden, suffix }) => {
  if (hidden) return <span>{"•".repeat(6)}<span style={{ fontFamily: "Geist", fontSize: "0.6em", marginLeft: 6, color: "var(--ink-3)" }}>{suffix}</span></span>;
  return <span>{value}{suffix && <span style={{ fontFamily: "Geist", fontSize: "0.42em", marginLeft: 6, color: "var(--ink-3)", letterSpacing: 0 }}>{suffix}</span>}</span>;
};

// ───── Area chart (mobile size) ─────
const MAreaChart = ({ data, width = 358, height = 160, accent = "var(--accent)", showAxis = true, gain = true }) => {
  if (!data || !data.length) return null;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.1 || 1;
  const lo = min - pad, hi = max + pad;
  const x = i => (i / (data.length - 1)) * width;
  const y = v => height - ((v - lo) / (hi - lo)) * height;
  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPts = `0,${height} ${linePts} ${width},${height}`;
  const gid = "g_" + Math.random().toString(36).slice(2);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showAxis && [0.25, 0.5, 0.75].map(t => (
        <line key={t} x1="0" x2={width} y1={height * t} y2={height * t} stroke="var(--line-2)" strokeDasharray="2 4" />
      ))}
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={linePts} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="3.5" fill={accent} />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="7" fill={accent} opacity="0.18" />
    </svg>
  );
};

// Sparkline (tiny inline)
const MSpark = ({ data, width = 60, height = 22, up = true }) => {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={up ? "var(--gain)" : "var(--loss)"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

// Donut (allocation)
const MDonut = ({ data, size = 180, thickness = 22, accent = "var(--accent)" }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const colors = ["var(--ink)", "var(--accent)", "#7c3aed", "#0e7490", "#a16207", "var(--accent-2)", "#475569", "#94a3b8"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-2)" strokeWidth={thickness} />
      {data.map((d, i) => {
        const frac = d.value / total;
        const len = c * frac;
        const dash = `${len} ${c - len}`;
        const dashOff = c * 0.25 - offset;
        offset += len;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                  stroke={colors[i % colors.length]} strokeWidth={thickness}
                  strokeDasharray={dash} strokeDashoffset={dashOff}
                  strokeLinecap="butt" />
        );
      })}
    </svg>
  );
};

// Format helpers — proxy to window.VAULT_DATA.fmt
const F = {
  SAR: (n, d = 0) => window.VAULT_DATA.fmt.SAR(n, { decimals: d }),
  USD: (n) => window.VAULT_DATA.fmt.USD(n),
  PCT: (n, opts) => window.VAULT_DATA.fmt.PCT(n, opts),
  COMPACT: (n) => window.VAULT_DATA.fmt.COMPACT(n),
};

Object.assign(window, { MIcon, MBrandmark, MDelta, MTypeChip, MValue, MAreaChart, MSpark, MDonut, F });
