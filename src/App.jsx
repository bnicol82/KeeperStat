import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";
import { authClient, refreshAuthToken, setCachedAuthToken } from "./authClient.js";
import { createDemoApi } from "./demoApi.js";
import { parseScheduleText } from "./scheduleImport.js";
import welcomeBg from "./assets/welcome-bg.webp";

/* ============================================================
   KEEPERSTAT — Goalkeeper tracking app prototype
   Screens: Welcome, Live Tracker, Match Stats, Coach Dashboard,
   Parent View, Keeper Development, Match Report, Season Progress,
   Training Recommendations, Interview & Feedback

   Navigation: single bottom nav (Tracker / Stats / Home / Progress /
   More) — everything else lives in the More sheet. No phone chrome,
   no top breadcrumb strip.
   ============================================================ */

const C = {
  bg: "#050505",
  card: "#121212",
  card2: "#1A1A1A",
  border: "#262626",
  orange: "#FF5C00",
  green: "#8CE21B",
  greenDark: "#173311",
  greenMid: "#2E7D32",
  red: "#D32F2F",
  blue: "#1565D8",
  gray: "#9E9E9E",
  grayDark: "#616161",
  white: "#FFFFFF",
  gold: "#F5A623",
};

const font = "'Barlow', -apple-system, 'Segoe UI', Roboto, sans-serif";
const fontCond = "'Barlow Condensed', 'Arial Narrow', sans-serif";

const drills = [
  { title: "Low Dive Reaction Drill", mins: 8, emoji: "🧤", desc: "Rapid-fire low balls to alternate sides. Focus on collapse technique and quick recovery to set position." },
  { title: "Close Range Saves", mins: 10, emoji: "⚡", desc: "Reaction saves from 6–8 yards. Trains hand speed and blocking shape under pressure." },
  { title: "Angle & Positioning", mins: 12, emoji: "📐", desc: "Cone-guided arc work. Learn to narrow shooting angles as the ball travels across the box." },
  { title: "Distribution Under Pressure", mins: 10, emoji: "🎯", desc: "Throw and pass to moving targets with a defender closing down. Builds the next goal: 80% distribution accuracy." },
];

const coachQuestions = [
  "What statistics influence your coaching decisions the most?",
  "How do you decide when a keeper is ready to move up a level?",
  "What does a keeper's body language tell you during a match?",
  "What's the one habit you wish every young keeper built early?",
];

const LEVELS = {
  youth: { label: "Youth (U8–U14)", short: "Youth", baseline: 0.65 },
  highschool: { label: "High School", short: "High School", baseline: 0.72 },
  adult: { label: "Adult / Club", short: "Adult", baseline: 0.76 },
  semipro: { label: "Semi-Pro", short: "Semi-Pro", baseline: 0.80 },
};

const MORE_ITEMS = [
  { key: "report", label: "Match Report", icon: "📋", desc: "Full breakdown of your last match" },
  { key: "training", label: "Training Plan", icon: "🏋️", desc: "Drills picked for your focus area" },
  { key: "development", label: "Keeper Development", icon: "🚀", desc: "Strengths, focus areas & next goal" },
  { key: "parent", label: "Parent View", icon: "⭐", desc: "A simple performance summary" },
  { key: "interview", label: "Interview & Feedback", icon: "🎙️", desc: "Reflection questions after matches" },
  { key: "settings", label: "Settings", icon: "⚙️", desc: "Level of play, scoring & notifications" },
];

const TABS = [
  { key: "tracker", label: "Tracker", icon: "🎯" },
  { key: "stats", label: "Stats", icon: "📊" },
  { key: "dashboard", label: "Home", icon: "🏠" },
  { key: "progress", label: "Progress", icon: "📈" },
  { key: "more", label: "More", icon: "•••" },
];

const activeTabFor = (screen) => {
  if (["report", "training", "development", "parent", "interview", "settings"].includes(screen)) return "more";
  if (screen === "dashboard") return "dashboard";
  return screen; // tracker, stats, progress
};

// ---------- tiny UI atoms ----------
const Header = ({ title, left, right, onLeft, onRight }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px", flexShrink: 0 }}>
    <button onClick={onLeft} style={{ background: "none", border: "none", color: C.white, fontSize: 22, width: 36, textAlign: "left", cursor: "pointer", padding: 0 }}>
      {left}
    </button>
    <div style={{ fontFamily: fontCond, fontWeight: 600, fontSize: 20, letterSpacing: 0.3, color: C.white }}>{title}</div>
    {onRight ? (
      <button onClick={onRight} style={{ background: "none", border: "none", width: 36, textAlign: "right", color: C.white, fontSize: 18, cursor: "pointer", padding: 0 }}>{right || ""}</button>
    ) : (
      <div style={{ width: 36, textAlign: "right", color: C.white, fontSize: 18 }}>{right || ""}</div>
    )}
  </div>
);

const Card = ({ children, style, className = "" }) => (
  <div className={`panel ${className}`} style={{ padding: 14, ...style }}>{children}</div>
);

// ---------- global bottom nav ----------
const NavBar = ({ active, onNav }) => (
  <div className="navbar">
    {TABS.map((t) => (
      <button key={t.key} onClick={() => onNav(t.key)} className={`navbtn ${active === t.key ? "navbtn-active" : ""}`}>
        <span className="navbtn-icon">{t.icon}</span>
        <span className="navbtn-label">{t.label}</span>
      </button>
    ))}
  </div>
);

// ---------- "More" bottom sheet ----------
const MoreSheet = ({ open, onClose, onNav }) => (
  <>
    <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
    <div className={`sheet ${open ? "open" : ""}`}>
      <div className="sheet-handle" />
      <div className="sheet-header">
        <span>More</span>
        <button className="sheet-close" onClick={onClose}>✕</button>
      </div>
      {MORE_ITEMS.map((it) => (
        <button key={it.key} className="sheet-row" onClick={() => onNav(it.key)}>
          <span className="sheet-row-icon">{it.icon}</span>
          <span className="sheet-row-text">
            <span className="sheet-row-title">{it.label}</span>
            <span className="sheet-row-desc">{it.desc}</span>
          </span>
          <span className="sheet-row-chev">›</span>
        </button>
      ))}
    </div>
  </>
);

// ---------- share sheet (match report → text summary, copy / native share) ----------
const buildShareText = ({ keeperName, m, score, savePct }) => {
  const lines = [
    "🧤 KeeperStat Match Report",
    `${keeperName} vs ${m.opp} — ${m.res}`,
    "",
    `GK Impact Score: ${score} (${scoreWord(score)})`,
    `Saves: ${m.saves} | Shots Faced: ${m.shotsFaced} | Goals Against: ${m.ga}`,
    `Save %: ${savePct}%`,
    m.ga === 0 ? "Clean Sheet ✅" : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
};

const ShareSheet = ({ open, onClose, data }) => {
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildShareText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  const handleNativeShare = async () => {
    if (!data) return;
    try {
      await navigator.share({ title: "KeeperStat Match Report", text: buildShareText(data) });
    } catch {
      /* user cancelled or share unsupported — no-op */
    }
  };

  return (
    <>
      <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sheet ${open ? "open" : ""}`}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span>Share Match Report</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        {data && (
          <>
            <Card style={{ textAlign: "center", margin: "4px 0 14px" }}>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>{data.keeperName} vs {data.m.opp}</div>
              <div className={data.m.res.startsWith("W") ? "win-badge" : data.m.res.startsWith("L") ? "loss-badge" : "draw-badge"} style={{ display: "inline-block", marginTop: 8 }}>
                {data.m.goalsScored}–{data.m.ga}
              </div>
              <div style={{ fontFamily: fontCond, fontSize: 40, fontWeight: 800, color: C.green, marginTop: 10, textShadow: `0 0 18px ${C.green}55` }}>{data.score}</div>
              <div style={{ fontFamily: fontCond, fontSize: 14, fontWeight: 700, color: C.green, letterSpacing: 1.5 }}>{scoreWord(data.score)}</div>
              <div style={{ fontSize: 12.5, color: C.grayDark, marginTop: 8 }}>{data.m.saves} saves · {data.savePct}% save rate{data.m.ga === 0 ? " · Clean sheet" : ""}</div>
            </Card>
            <button onClick={handleCopy} className="btn3d btn3d-orange" style={{ width: "100%", padding: 14, borderRadius: 14, fontFamily: fontCond, fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>
              {copied ? "Copied ✓" : "Copy Summary"}
            </button>
            {canNativeShare && (
              <button onClick={handleNativeShare} className="btn3d btn3d-outline" style={{ width: "100%", padding: 13, borderRadius: 12, marginTop: 10, fontWeight: 700, fontSize: 14 }}>
                Share…
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};

const Ring = ({ value, size = 120, stroke = 10, color = C.green, label, sub }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value)) / 100;
  return (
    <div className="ring-well" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#242424" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset .6s ease", filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: fontCond, fontSize: size / 3.2, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 16px ${color}55` }}>{label}</div>
        {sub && <div style={{ fontSize: 9, fontWeight: 700, color: C.gray, letterSpacing: 0.5, textAlign: "center", marginTop: 2, whiteSpace: "pre-line" }}>{sub}</div>}
      </div>
    </div>
  );
};

const scoreWord = (s) => (s >= 85 ? "ELITE" : s >= 70 ? "STRONG" : s >= 55 ? "GOOD" : s >= 40 ? "DEVELOPING" : "TOUGH DAY");

// ---------- scoring engine ----------
// Goals Prevented: how many goals the keeper saved relative to what a
// baseline keeper at this level of play would be expected to concede,
// given the same shot volume. This is the core of the GK Impact Score —
// unlike raw save %, it isn't warped by a light or heavy shot count, and
// it rewards workload rather than punishing a keeper for facing more shots.
const goalsPrevented = (shotsFaced, goalsAgainst, baseline) => {
  if (shotsFaced <= 0) return 0;
  const expectedGoalsAgainst = shotsFaced * (1 - baseline);
  return expectedGoalsAgainst - goalsAgainst;
};

// Converts Goals Prevented into the 0–100 GK Impact Score shown throughout
// the app: 50 is "performed exactly at the level-of-play baseline."
const impactScoreFromStats = (shotsFaced, saves, goalsAgainst, baseline) => {
  const gp = goalsPrevented(shotsFaced, goalsAgainst, baseline);
  let s = 50 + gp * 10;
  if (goalsAgainst === 0 && shotsFaced > 0) s += 5; // clean sheet bonus
  s += Math.min(shotsFaced * 0.5, 6); // small reward for workload/volume
  return Math.round(Math.min(99, Math.max(5, s)));
};

// GDE — Goalkeeper Defensive Efficiency: saves / shots faced (0–1)
const gde = (saves, shotsFaced) => (shotsFaced > 0 ? saves / shotsFaced : 0);
// TOE — Team Offensive Efficiency: goals scored / team shots on goal (0–1).
// Returns null when team shot data isn't available (e.g. live-tracked
// matches, which only capture the keeper's own stats today) rather than
// silently reporting 0, which would misrepresent the attack as wasteful.
const toe = (goalsScored, teamShotsOnGoal) => (teamShotsOnGoal ? goalsScored / teamShotsOnGoal : null);
// GMIS — Goalkeeper Match Impact Score: GDE − TOE. Positive = keeper
// outperformed the attack this match; negative = the attack carried more
// of the game than the keeper did. This is match *context*, not a grade —
// it depends on teammates' finishing, which the keeper doesn't control.
const gmis = (gdeVal, toeVal) => (toeVal === null ? null : gdeVal - toeVal);

const gmisNarrative = (gmisVal, res) => {
  const win = res.startsWith("W"), loss = res.startsWith("L");
  if (gmisVal > 0.05 && loss) return "The keeper kept this competitive despite the loss — the attack didn't finish its chances.";
  if (gmisVal < -0.05 && win) return "The attack did the heavy lifting in this win — a quieter game for the keeper.";
  if (gmisVal > 0.15) return "The keeper significantly outperformed the attack this match.";
  if (gmisVal > 0.02) return "The keeper edged out the attack — a solid game between the posts.";
  if (gmisVal > -0.02) return "A balanced match — keeper and attack contributed evenly.";
  if (gmisVal > -0.15) return "The attack carried more of the game than the keeper this time.";
  return "A tough day — the attack did most of the heavy lifting.";
};

// Derives 1–2 strength tags from season-wide numbers rather than hardcoding
// them — used on the Keeper Development screen.
const strengthTags = (savePct, cleanSheetRate, aggregateGoalsPrevented) => {
  const tags = [];
  if (savePct >= 68) tags.push("Shot Stopping");
  if (cleanSheetRate >= 0.25) tags.push("Composure Under Pressure");
  if (aggregateGoalsPrevented > 0 && tags.length < 2) tags.push("Consistency");
  if (tags.length === 0) tags.push("Effort & Resilience");
  return tags.slice(0, 2);
};

// Compact sparkline path for small trend charts (Parent View).
const sparklinePath = (values, w = 110, h = 40, pad = 6) => {
  if (values.length < 2) return { path: "", last: { x: w - pad, y: h / 2 } };
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: pad + (i * (w - pad * 2)) / (values.length - 1),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }));
  return { path: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), last: pts[pts.length - 1] };
};

// ---------- empty state (used by any screen with no logged matches yet) ----------
const EmptyState = ({ icon = "🧤", title, sub, cta, onCta }) => (
  <Card style={{ textAlign: "center", padding: "34px 20px" }}>
    <div style={{ fontSize: 40 }}>{icon}</div>
    <div style={{ fontFamily: fontCond, fontSize: 19, fontWeight: 800, color: C.white, marginTop: 10 }}>{title}</div>
    <div style={{ fontSize: 13.5, color: C.gray, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>
    {cta && (
      <button onClick={onCta} className="btn3d btn3d-orange" style={{ marginTop: 16, padding: "12px 22px", borderRadius: 22, fontFamily: fontCond, fontWeight: 700, fontSize: 14 }}>
        {cta}
      </button>
    )}
  </Card>
);

// ---------- line chart (SVG) ----------
const LineChart = ({ data, height = 160 }) => {
  const w = 320, pad = { l: 30, r: 12, t: 12, b: 24 };
  const max = 100, min = 0;
  const pts = data.map((v, i) => ({
    x: pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1),
    y: pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b),
  }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = `${path} L${pts[pts.length - 1].x},${height - pad.b} L${pts[0].x},${height - pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.green} stopOpacity="0.32" />
          <stop offset="100%" stopColor={C.green} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => {
        const y = pad.t + (1 - g / 100) * (height - pad.t - pad.b);
        return (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#222" strokeWidth="1" />
            <text x={pad.l - 6} y={y + 3} fill={C.grayDark} fontSize="8" textAnchor="end">{g}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#chartFill)" />
      <path d={path} fill="none" stroke={C.green} strokeWidth="3" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 4px ${C.green}66)` }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="#0a0a0a" stroke={C.green} strokeWidth="2.5" />
          <text x={p.x} y={height - 8} fill={C.grayDark} fontSize="8" textAnchor="middle">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
};

/* ============================================================ SCREENS */

// ---------- 1. Welcome ----------
const Welcome = ({ onDemo, onLogin }) => (
  <div
    style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end",
      backgroundImage: `url(${welcomeBg})`, backgroundSize: "cover", backgroundPosition: "center",
      position: "relative", overflow: "hidden",
    }}
  >
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.8) 100%)" }} />
    <div style={{ position: "relative", padding: `24px 28px calc(env(safe-area-inset-bottom, 0px) + 24px)` }}>
      <button onClick={onDemo} className="btn3d btn3d-orange" style={{ width: "100%", padding: "16px", borderRadius: 30, fontFamily: fontCond, fontWeight: 700, fontSize: 19, letterSpacing: 1.5 }}>
        DEMO APP
      </button>
      <button onClick={onLogin} className="btn3d btn3d-outline" style={{ width: "100%", padding: "15px", borderRadius: 30, marginTop: 14, fontFamily: fontCond, fontWeight: 700, fontSize: 17, letterSpacing: 1.5 }}>
        LOG IN
      </button>
    </div>
  </div>
);

const Login = ({ onAuthenticated, onBack }) => {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password });
      if (result?.error) {
        setError(result.error.message || "Something went wrong. Please try again.");
        return;
      }
      await refreshAuthToken();
      onAuthenticated();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim() && password.length >= 8 && !loading;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: C.bg }}>
      <Header title={mode === "signin" ? "Log In" : "Create Account"} left="‹" onLeft={onBack} />
      <div style={{ padding: "0 16px 16px", flex: 1, overflowY: "auto" }}>
        <Card>
          {mode === "signup" && (
            <>
              <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="input-well"
                style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none", marginBottom: 12 }}
              />
            </>
          )}
          <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-well"
            style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none", marginBottom: 12 }}
          />
          <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
            className="input-well"
            style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none" }}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
          />
        </Card>

        {error && <div style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{error}</div>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="btn3d btn3d-orange"
          style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: canSubmit ? 1 : 0.5 }}
        >
          {loading ? "…" : mode === "signin" ? "LOG IN" : "CREATE ACCOUNT"}
        </button>
        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
          style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}
        >
          {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
};

// ---------- 2. Live Match Tracker ----------
const BigButton = ({ accent, icon, lines, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="tile-btn"
    style={{
      border: `1px solid ${accent}4D`,
      boxShadow: `0 6px 0 #030303, 0 10px 20px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 28px ${accent}12`,
      opacity: disabled ? 0.42 : 1,
    }}
  >
    <span className="tile-icon" style={{ background: `radial-gradient(circle at 35% 30%, ${accent}30, ${accent}0D)`, border: `1.5px solid ${accent}59`, boxShadow: `0 4px 10px ${accent}26, inset 0 1px 0 rgba(255,255,255,.12)` }}>{icon}</span>
    <span style={{ fontFamily: fontCond, fontWeight: 700, fontSize: 15, lineHeight: 1.1, letterSpacing: 1, textAlign: "center", whiteSpace: "pre-line", color: C.white }}>{lines}</span>
    <span className="tile-accent" style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }} />
  </button>
);

const SmallActionButton = ({ icon, label, count, color, onClick }) => (
  <button
    onClick={onClick}
    className="btn3d"
    style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
      padding: "10px 12px", borderRadius: 12, background: "linear-gradient(180deg, #1c1c1c, #101010)",
      border: `1px solid ${color}40`, boxShadow: "0 3px 0 #050505, inset 0 1px 0 rgba(255,255,255,.05)",
      color: C.white, fontFamily: font, textAlign: "left",
    }}
  >
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>{label}
    </span>
    <span style={{ fontFamily: fontCond, fontSize: 18, fontWeight: 800, color }}>{count}</span>
  </button>
);

const Tracker = ({ match, dispatch, go, activeKeeper, onOpenKeeperSwitch, matchStatus, onStartMatch, onEndMatch, onResumeMatch, onSaveMatch, onDiscardMatch, onNotesChange, baseline, fixtures }) => {
  const nextFixture = fixtures?.[0];
  const [opponentInput, setOpponentInput] = useState(() => nextFixture?.opponent || "");

  if (matchStatus === "idle") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Live Match Tracker" left="☰" right="⚙" onLeft={onOpenKeeperSwitch} onRight={() => go("settings")} />
        <div style={{ padding: "0 16px", flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <Card>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 12 }}>NEW MATCH</div>
            <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Opponent</div>
            <input
              value={opponentInput}
              onChange={(e) => setOpponentInput(e.target.value)}
              placeholder="e.g. River City FC"
              className="input-well"
              style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none", marginBottom: nextFixture ? 6 : 12 }}
            />
            {nextFixture && (
              <div style={{ fontSize: 11, color: C.orange, fontWeight: 600, marginBottom: 12 }}>
                From your schedule{nextFixture.date ? ` · ${nextFixture.date}` : ""}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Team</div>
            <div style={{ fontSize: 14, color: C.white, fontWeight: 600 }}>{activeKeeper.team}</div>
          </Card>
          <button
            disabled={!opponentInput.trim()}
            onClick={() => onStartMatch(opponentInput.trim())}
            className="btn3d btn3d-orange"
            style={{ width: "100%", marginTop: 16, padding: 16, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 17, letterSpacing: 1.5, opacity: opponentInput.trim() ? 1 : 0.5 }}
          >
            START MATCH
          </button>
        </div>
      </div>
    );
  }

  if (matchStatus === "ended") {
    const faced = Math.max(match.shotsFaced, match.saves + match.goalsAgainst);
    const savePct = faced ? Math.round((match.saves / faced) * 100) : 0;
    const score = impactScoreFromStats(faced, match.saves, match.goalsAgainst, baseline);
    const win = match.ourGoals > match.goalsAgainst, loss = match.ourGoals < match.goalsAgainst;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Match Ended" left="☰" onLeft={onOpenKeeperSwitch} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>vs {match.opponent}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 10 }}>
              <span style={{ fontFamily: fontCond, fontSize: 44, fontWeight: 800, color: C.white }}>{match.ourGoals} – {match.goalsAgainst}</span>
              <span className={win ? "win-badge" : loss ? "loss-badge" : "draw-badge"}>{win ? "WIN" : loss ? "LOSS" : "DRAW"}</span>
            </div>
          </Card>
          <Card style={{ marginTop: 12, textAlign: "center", padding: "16px" }}>
            <div style={{ fontFamily: fontCond, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.gold }}>GK IMPACT SCORE</div>
            <div style={{ fontFamily: fontCond, fontSize: 52, fontWeight: 800, color: C.green, lineHeight: 1.05, textShadow: `0 0 22px ${C.green}55` }}>{score}</div>
            <div style={{ fontFamily: fontCond, fontSize: 17, fontWeight: 700, color: C.green, letterSpacing: 2 }}>{scoreWord(score)}</div>
          </Card>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {cellBox("Shots Faced", faced)}{cellBox("Saves", match.saves)}{cellBox("Goals Against", match.goalsAgainst)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {cellBox("Save %", `${savePct}%`)}{cellBox("Clean Sheet", match.goalsAgainst === 0 ? "Yes" : "No")}{cellBox("Minutes", match.clock.split(":")[0] + "'")}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {cellBox("Distribution", `${match.distributionCompleted}/${match.distributionAttempted}`)}{cellBox("Claims", match.claims)}{cellBox("Punches", match.punches)}{cellBox("Errors", match.errors)}
          </div>
          {(match.bigSaves > 0 || match.penaltySaves > 0) && (
            <div style={{ fontSize: 12.5, color: C.gold, fontWeight: 600, textAlign: "center", marginTop: 10 }}>
              {match.bigSaves > 0 && `⭐ ${match.bigSaves} Big Save${match.bigSaves > 1 ? "s" : ""}`}
              {match.bigSaves > 0 && match.penaltySaves > 0 && " · "}
              {match.penaltySaves > 0 && `🥇 ${match.penaltySaves} Penalty Save${match.penaltySaves > 1 ? "s" : ""}`}
            </div>
          )}
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8 }}>POST-MATCH NOTES</div>
            <textarea
              value={match.notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Sweeper actions, 1v1 duels, anything else worth remembering about this match…"
              className="input-well"
              style={{ width: "100%", minHeight: 70, padding: "10px 12px", color: C.white, fontSize: 14, fontFamily: font, outline: "none", resize: "vertical" }}
            />
          </Card>
          <button onClick={onSaveMatch} className="btn3d btn3d-orange" style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
            SAVE TO SEASON
          </button>
          <button onClick={onDiscardMatch} className="btn3d btn3d-outline" style={{ width: "100%", marginTop: 10, padding: 13, borderRadius: 12, color: C.red, fontWeight: 700, fontSize: 14 }}>
            Discard Match
          </button>
          <button onClick={onResumeMatch} style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}>
            ‹ Back to Live Match
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Live Match Tracker" left="☰" right="⚙" onLeft={onOpenKeeperSwitch} onRight={() => go("settings")} />
      <div style={{ padding: "0 16px", flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.white, fontWeight: 600 }}>
            <span>vs {match.opponent}</span>
            <button onClick={onEndMatch} style={{ background: "none", border: "none", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>End Match</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.grayDark, marginTop: 2 }}>
            <span>{activeKeeper.team}</span>
            <span style={{ color: C.white, fontWeight: 700 }}>{match.clock}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 26, marginTop: 10 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: fontCond, fontSize: 52, fontWeight: 800, color: C.orange, lineHeight: 1, textShadow: "0 3px 8px rgba(255,92,0,.35)" }}>{match.ourGoals}</div>
              <div style={{ fontSize: 10, color: C.gray, letterSpacing: 1, fontWeight: 700 }}>OUR TEAM</div>
            </div>
            <div style={{ width: 1, height: 48, background: C.border }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: fontCond, fontSize: 52, fontWeight: 800, color: C.white, lineHeight: 1, textShadow: "0 3px 8px rgba(0,0,0,.5)" }}>{match.goalsAgainst}</div>
              <div style={{ fontSize: 10, color: C.gray, letterSpacing: 1, fontWeight: 700 }}>OPPONENT</div>
            </div>
          </div>
        </Card>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {cellBox("Saves", match.saves)}{cellBox("Shots Faced", match.shotsFaced)}{cellBox("Goals Against", match.goalsAgainst)}{cellBox("Save %", `${match.shotsFaced ? Math.round((match.saves / match.shotsFaced) * 100) : 0}%`)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12, padding: "14px 0 10px", minHeight: 210 }}>
          <BigButton accent="#4CAF50" icon="🧤" lines={"SAVE"} onClick={() => dispatch({ type: "save" })} />
          <BigButton accent="#4A90E2" icon="🎯" lines={"SHOT ON TARGET\n(FACED)"} onClick={() => dispatch({ type: "shot" })} />
          <BigButton accent="#EF5350" icon="🥅" lines={"GOAL\nAGAINST"} onClick={() => dispatch({ type: "goal" })} />
          <BigButton accent={C.orange} icon="⚽" lines={"GOAL\nFOR"} onClick={() => dispatch({ type: "goalFor" })} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: 1, margin: "6px 0 8px" }}>MORE ACTIONS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <SmallActionButton icon="🎯" label="Distribution ✓" count={match.distributionCompleted} color={C.green} onClick={() => dispatch({ type: "distributionComplete" })} />
          <SmallActionButton icon="🚫" label="Distribution ✗" count={match.distributionAttempted - match.distributionCompleted} color={C.gray} onClick={() => dispatch({ type: "distributionMiss" })} />
          <SmallActionButton icon="🙌" label="Claim" count={match.claims} color={C.blue} onClick={() => dispatch({ type: "claim" })} />
          <SmallActionButton icon="👊" label="Punch" count={match.punches} color={C.blue} onClick={() => dispatch({ type: "punch" })} />
          <SmallActionButton icon="🥇" label="Penalty Save" count={match.penaltySaves} color={C.gold} onClick={() => dispatch({ type: "penaltySave" })} />
          <SmallActionButton icon="⭐" label="Big Save" count={match.bigSaves} color={C.gold} onClick={() => dispatch({ type: "bigSave" })} />
        </div>

        <button
          onClick={() => dispatch({ type: "undo" })}
          disabled={!match.log.length}
          className="btn3d btn3d-outline"
          style={{ width: "100%", padding: 11, borderRadius: 12, fontWeight: 700, fontSize: 13, opacity: match.log.length ? 1 : 0.4, marginBottom: 8 }}
        >
          ↩ Undo Last
        </button>
        {match.log.length > 0 && (
          <div style={{ fontSize: 12, color: C.gray, textAlign: "center", paddingBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Last: <span style={{ color: C.white, fontWeight: 600 }}>{match.log[match.log.length - 1].label}</span> · {match.log.length} event{match.log.length > 1 ? "s" : ""} logged</span>
            {match.log[match.log.length - 1].t === "goal" && (
              <button
                onClick={() => dispatch({ type: "toggleError" })}
                style={{
                  background: match.log[match.log.length - 1].isError ? C.red : "transparent",
                  border: `1px solid ${C.red}`, color: match.log[match.log.length - 1].isError ? "#fff" : C.red,
                  borderRadius: 10, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                ⚠ {match.log[match.log.length - 1].isError ? "Keeper Error" : "Mark as Error"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- 3. Match Stats (Live) ----------
const StatRow = ({ icon, label, value, valueColor }) => (
  <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", marginBottom: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="icon-chip">{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: C.white }}>{label}</span>
    </div>
    <span style={{ fontFamily: fontCond, fontSize: 22, fontWeight: 700, color: valueColor || C.white }}>{value}</span>
  </Card>
);

const MatchStats = ({ match, go, baseline }) => {
  const faced = Math.max(match.shotsFaced, match.saves + match.goalsAgainst);
  const savePct = faced ? Math.round((match.saves / faced) * 100) : 0;
  const score = impactScoreFromStats(faced, match.saves, match.goalsAgainst, baseline);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Match Stats (Live)" left="‹" onLeft={() => go("tracker")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <StatRow icon="⚽" label="Shots on Target Faced" value={faced} />
        <StatRow icon="🧤" label="Saves" value={match.saves} />
        <StatRow icon="🥅" label="Goals Against" value={match.goalsAgainst} />
        <StatRow icon="📊" label="Save Percentage" value={`${savePct}%`} valueColor={C.green} />
        <StatRow icon="🛡" label="Clean Sheet" value={match.goalsAgainst === 0 ? "Yes" : "No"} valueColor={match.goalsAgainst === 0 ? C.green : C.white} />
        <Card style={{ textAlign: "center", padding: "18px 16px", marginTop: 4 }}>
          <div style={{ fontFamily: fontCond, fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: C.gold }}>GK IMPACT SCORE</div>
          <div style={{ fontFamily: fontCond, fontSize: 64, fontWeight: 800, color: C.green, lineHeight: 1.05, textShadow: `0 0 24px ${C.green}55` }}>{score}</div>
          <div style={{ fontFamily: fontCond, fontSize: 20, fontWeight: 700, color: C.green, letterSpacing: 2 }}>{scoreWord(score)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 10, color: C.grayDark }}>0</span>
            <div className="groove-track">
              <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg, ${C.greenMid}, ${C.green})`, borderRadius: 4, transition: "width .5s", boxShadow: `0 0 10px ${C.green}66` }} />
            </div>
            <span style={{ fontSize: 10, color: C.grayDark }}>100</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ---------- 4. Coach Dashboard ----------
const trendDelta = (cur, prev, unit = "", goodWhenPositive = true, neutral = false) => {
  const d = cur - prev;
  if (d === 0) return { text: "— even", color: C.grayDark };
  const positive = d > 0;
  const arrow = positive ? "↗" : "↘";
  const sign = positive ? "+" : "−";
  const good = goodWhenPositive ? positive : !positive;
  return { text: `${arrow} ${sign}${Math.abs(d)}${unit}`, color: neutral ? C.gray : good ? C.green : C.red };
};

const Dashboard = ({ go, baseline, matches, activeKeeper, onOpenKeeperSwitch }) => {
  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Coach Dashboard" left="☰" onLeft={onOpenKeeperSwitch} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <button onClick={onOpenKeeperSwitch} className="dropdown-pill" style={{ width: "100%", marginBottom: 12, border: "none", cursor: "pointer" }}>
            🧤 {activeKeeper.name} <span style={{ color: C.gray }}>▾</span>
          </button>
          <EmptyState title="No matches yet" sub={`Log ${activeKeeper.name}'s first live match to start seeing performance trends here.`} cta="Start Live Match" onCta={() => go("tracker")} />
        </div>
      </div>
    );
  }
  const scored = matches.map((m) => ({ ...m, score: impactScoreFromStats(m.shotsFaced, m.saves, m.ga, baseline) }));
  const last5 = scored.slice(-5);
  const prev5 = scored.slice(0, Math.max(scored.length - 5, 0));
  const avgOf = (arr) => (arr.length ? Math.round(arr.reduce((a, m) => a + m.score, 0) / arr.length) : 0);
  const avg = avgOf(last5);
  const avgPrev = avgOf(prev5);

  const savesL = last5.reduce((a, m) => a + m.saves, 0), shotsL = last5.reduce((a, m) => a + m.shotsFaced, 0);
  const savesP = prev5.reduce((a, m) => a + m.saves, 0), shotsP = prev5.reduce((a, m) => a + m.shotsFaced, 0);
  const savePct = shotsL ? Math.round((savesL / shotsL) * 100) : 0;
  const savePctPrev = shotsP ? Math.round((savesP / shotsP) * 100) : 0;

  const ga = last5.reduce((a, m) => a + m.ga, 0), gaPrev = prev5.reduce((a, m) => a + m.ga, 0);
  const cs = last5.filter((m) => m.ga === 0).length, csPrev = prev5.filter((m) => m.ga === 0).length;

  const cell = (label, value, d) => (
    <Card style={{ flex: 1, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: fontCond, fontSize: 30, fontWeight: 800, color: C.white, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: d.color }}>{d.text}</div>
    </Card>
  );
  const hasPrev = prev5.length > 0;
  const trendUp = avg > avgPrev, trendFlat = avg === avgPrev;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Coach Dashboard" left="☰" onLeft={onOpenKeeperSwitch} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <button onClick={onOpenKeeperSwitch} className="dropdown-pill" style={{ width: "100%", marginBottom: 10, border: "none", cursor: "pointer" }}>
          🧤 {activeKeeper.name} <span style={{ color: C.gray }}>▾</span>
        </button>
        <div className="dropdown-pill">
          Last {last5.length} Match{last5.length === 1 ? "" : "es"} <span style={{ color: C.gray }}>▾</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 6, marginTop: 6 }}>
          <Ring value={avg} size={140} stroke={11} label={avg} sub={"AVG. GK\nIMPACT SCORE"} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px 14px", fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: C.gray }}>Trend</span>
          <span style={{ color: !hasPrev ? C.gray : trendFlat ? C.gray : trendUp ? C.green : C.red }}>
            {!hasPrev ? "— Not enough matches yet" : trendFlat ? "→ Steady" : trendUp ? "↗ Improving" : "↘ Declining"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {cell("Save %", `${savePct}%`, hasPrev ? trendDelta(savePct, savePctPrev, "%") : { text: "—", color: C.grayDark })}
          {cell("Shots Faced", shotsL, hasPrev ? trendDelta(shotsL, shotsP, "", true, true) : { text: "—", color: C.grayDark })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {cell("Clean Sheets", cs, hasPrev ? trendDelta(cs, csPrev) : { text: "—", color: C.grayDark })}
          {cell("Goals Against", ga, hasPrev ? trendDelta(ga, gaPrev, "", false) : { text: "—", color: C.grayDark })}
        </div>
        <button onClick={() => go("training")} className="btn3d btn3d-outline" style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 12, color: C.orange, fontWeight: 700, fontSize: 14 }}>
          View Training Recommendations →
        </button>
      </div>
    </div>
  );
};

// ---------- 5. Parent View ----------
const performanceLabel = (word) => ({
  ELITE: "ELITE PERFORMANCE",
  STRONG: "STRONG PERFORMANCE",
  GOOD: "SOLID PERFORMANCE",
  DEVELOPING: "A LEARNING GAME",
  "TOUGH DAY": "A TOUGH DAY",
}[word] || "MATCH PERFORMANCE");

const parentBlurb = (name, m, word) => {
  if (m.ga === 0) return `${name} kept a clean sheet with ${m.saves} save${m.saves === 1 ? "" : "s"} — a strong game between the posts.`;
  if (word === "ELITE" || word === "STRONG") return `${name} made ${m.saves} saves and gave the team a real chance to win, even with ${m.ga} goal${m.ga === 1 ? "" : "s"} against.`;
  if (word === "GOOD") return `${name} made ${m.saves} saves and stayed competitive all match.`;
  if (word === "DEVELOPING") return `A tough test in front of goal — ${name} made ${m.saves} saves and kept battling to the final whistle.`;
  return `It was a difficult match in goal, but ${name} stayed on their feet and kept competing. Every match is a chance to grow.`;
};

const parentTip = (word) => ({
  ELITE: "This is the kind of performance to celebrate loudly — let them know it.",
  STRONG: "That composure under pressure is worth pointing out on the ride home.",
  GOOD: "A solid, steady game — celebrate the effort, not just the scoreline.",
  DEVELOPING: "Keep it positive — development areas are best handled in training, not the car.",
  "TOUGH DAY": "Tough games happen to every keeper. Keep it encouraging — resilience is built after days like this.",
}[word] || "Keep it positive — development areas are handled in training.");

const ParentView = ({ go, baseline, matches, activeKeeper }) => {
  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Parent View" left="‹" onLeft={() => go("dashboard")} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <EmptyState icon="⭐" title="No matches yet" sub={`Once ${activeKeeper.name} plays a tracked match, a parent-friendly summary will appear here.`} cta="Start Live Match" onCta={() => go("tracker")} />
        </div>
      </div>
    );
  }
  const scored = matches.map((m) => ({ ...m, score: impactScoreFromStats(m.shotsFaced, m.saves, m.ga, baseline) }));
  const latest = scored[scored.length - 1];
  const word = scoreWord(latest.score);
  const last5 = scored.slice(-5), prev5 = scored.slice(0, Math.max(scored.length - 5, 0));
  const avgOf = (arr) => (arr.length ? arr.reduce((a, m) => a + m.score, 0) / arr.length : 0);
  const trendUp = prev5.length ? avgOf(last5) > avgOf(prev5) : null;
  const recent = scored.slice(-6).map((m) => m.score);
  const { path, last } = sparklinePath(recent, 110, 40, 5);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Parent View" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card style={{ background: `linear-gradient(180deg, #1c3a12 0%, ${C.greenDark} 100%)`, border: `1.5px solid ${C.green}55`, textAlign: "center", padding: "22px 16px" }}>
          <div style={{ width: 58, height: 58, margin: "0 auto 10px", borderRadius: "50%", border: `2.5px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: `0 4px 14px ${C.green}55, inset 0 2px 3px rgba(255,255,255,.2)` }}>⭐</div>
          <div style={{ fontFamily: fontCond, fontSize: 21, fontWeight: 800, letterSpacing: 1, color: C.white }}>{performanceLabel(word)}</div>
          <div style={{ fontSize: 12, color: "#B9D9A0", fontWeight: 600, marginTop: 2 }}>GK Impact Score</div>
          <div style={{ fontFamily: fontCond, fontSize: 46, fontWeight: 800, color: C.white, lineHeight: 1.1, textShadow: "0 3px 10px rgba(0,0,0,.4)" }}>{latest.score}</div>
        </Card>
        <Card style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.55, color: "#DADADA" }}>
          {parentBlurb(activeKeeper.name, latest, word)}
        </Card>
        <Card style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Season Trend</div>
            <div style={{ fontFamily: fontCond, fontSize: 24, fontWeight: 700, color: trendUp === null ? C.gray : trendUp ? C.green : C.red }}>
              {trendUp === null ? "Early Days" : trendUp ? "Improving" : "Declining"}
            </div>
          </div>
          <svg width="110" height="40" viewBox="0 0 110 40">
            <path d={path} fill="none" stroke={trendUp === false ? C.red : C.green} strokeWidth="2.5" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 3px ${trendUp === false ? C.red : C.green}66)` }} />
            <circle cx={last.x} cy={last.y} r="3.5" fill={trendUp === false ? C.red : C.green} />
          </svg>
        </Card>
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, letterSpacing: 0.5, marginBottom: 8 }}>WHAT TO SAY IN THE CAR RIDE HOME</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: "#DADADA" }}>{parentTip(word)}</div>
        </Card>
      </div>
    </div>
  );
};

// ---------- 6. Keeper Development ----------
const Development = ({ go, baseline, matches, activeKeeper }) => {
  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Keeper Development" left="‹" onLeft={() => go("dashboard")} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <EmptyState icon="🚀" title="No matches yet" sub={`${activeKeeper.name}'s strengths and focus areas will show up here after the first tracked match.`} cta="Start Live Match" onCta={() => go("tracker")} />
        </div>
      </div>
    );
  }
  const scored = matches.map((m) => ({ ...m, score: impactScoreFromStats(m.shotsFaced, m.saves, m.ga, baseline) }));
  const latest = scored[scored.length - 1];
  const best = scored.reduce((a, m) => (m.score > a.score ? m : a), scored[0]);
  const totalSaves = scored.reduce((a, m) => a + m.saves, 0), totalShots = scored.reduce((a, m) => a + m.shotsFaced, 0);
  const savePctSeason = totalShots ? Math.round((totalSaves / totalShots) * 100) : 0;
  const csRate = scored.filter((m) => m.ga === 0).length / scored.length;
  const aggGP = scored.reduce((a, m) => a + goalsPrevented(m.shotsFaced, m.ga, baseline), 0);
  const strengths = strengthTags(savePctSeason, csRate, aggGP);
  const focusArea = activeKeeper.focusArea || { title: "Getting Started", note: "Log a few matches to unlock a personalized focus area." };
  const nextGoal = activeKeeper.nextGoal || "Play your first tracked match.";
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Keeper Development" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Ring value={latest.score} size={84} stroke={8} label={latest.score} />
          <div>
            <div style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>Your Score</div>
            <div style={{ fontSize: 14, color: C.white, fontWeight: 700, marginTop: 6 }}>Personal Best</div>
            <div style={{ fontFamily: fontCond, fontSize: 30, fontWeight: 800, color: C.white, lineHeight: 1 }}>{best.score}</div>
            <div style={{ fontSize: 11, color: C.grayDark, marginTop: 1 }}>vs {best.opp}</div>
          </div>
        </Card>
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: 1, marginBottom: 10 }}>STRENGTHS</div>
          {strengths.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 15, fontWeight: 600, color: C.white }}>
              <span className="badge-check">✓</span>
              {s}
            </div>
          ))}
        </Card>
        <Card style={{ marginTop: 12, background: "linear-gradient(180deg, #362707, #201703)", border: `1px solid ${C.gold}44` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: 1, marginBottom: 8 }}>FOCUS AREA · SET BY COACH</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, color: C.gold }}>
            <span className="badge-bang">!</span>
            {focusArea.title}
          </div>
          <div style={{ fontSize: 13, color: "#CBB98A", marginTop: 6, marginLeft: 32 }}>{focusArea.note}</div>
        </Card>
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8 }}>NEXT GOAL</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, lineHeight: 1.4 }}>{nextGoal}</div>
        </Card>
        <button onClick={() => go("training")} className="btn3d btn3d-orange" style={{ width: "100%", marginTop: 14, padding: 14, borderRadius: 12, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
          GO TO TRAINING PLAN
        </button>
      </div>
    </div>
  );
};

// ---------- 7. Match Report ----------
const cellBox = (label, value) => (
  <Card style={{ flex: 1, textAlign: "center", padding: "12px 6px" }}>
    <div style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{label}</div>
    <div style={{ fontFamily: fontCond, fontSize: 26, fontWeight: 800, color: C.white, marginTop: 2 }}>{value}</div>
  </Card>
);

const MatchReport = ({ go, baseline, showGMIS, matches, matchId, activeKeeper, onShare }) => {
  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Match Report" left="‹" onLeft={() => go("progress")} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <EmptyState icon="📋" title="No matches yet" sub={`${activeKeeper.name} doesn't have any tracked matches yet.`} cta="Start Live Match" onCta={() => go("tracker")} />
        </div>
      </div>
    );
  }
  const idx = Math.max(0, matches.findIndex((x) => x.n === matchId));
  const m = matches[idx] ?? matches[matches.length - 1];
  const realIdx = matches.findIndex((x) => x.n === m.n);
  const savePct = Math.round((m.saves / m.shotsFaced) * 100);
  const score = impactScoreFromStats(m.shotsFaced, m.saves, m.ga, baseline);
  const win = m.res.startsWith("W"), loss = m.res.startsWith("L");
  const badgeClass = win ? "win-badge" : loss ? "loss-badge" : "draw-badge";
  const gdeVal = gde(m.saves, m.shotsFaced);
  const toeVal = toe(m.goalsScored, m.teamShotsOnGoal);
  const gmisVal = gmis(gdeVal, toeVal);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header
        title="Match Report" left="‹" right="⇪" onLeft={() => go("progress")}
        onRight={() => onShare({ keeperName: activeKeeper.name, m, score, savePct })}
      />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: C.white }}>
            <span>vs {m.opp}</span><span style={{ color: C.gray }}>Match {m.n} of {matches.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.grayDark, marginTop: 2 }}>
            <span>{activeKeeper.team}</span><span>{m.res}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 12 }}>
            <span style={{ fontFamily: fontCond, fontSize: 44, fontWeight: 800, color: C.white }}>{m.goalsScored} – {m.ga}</span>
            <span className={badgeClass}>{win ? "WIN" : loss ? "LOSS" : "DRAW"}</span>
          </div>
        </Card>
        <Card style={{ marginTop: 12, textAlign: "center", padding: "16px" }}>
          <div style={{ fontFamily: fontCond, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.gold }}>GK IMPACT SCORE</div>
          <div style={{ fontFamily: fontCond, fontSize: 52, fontWeight: 800, color: C.green, lineHeight: 1.05, textShadow: `0 0 22px ${C.green}55` }}>{score}</div>
          <div style={{ fontFamily: fontCond, fontSize: 17, fontWeight: 700, color: C.green, letterSpacing: 2 }}>{scoreWord(score)}</div>
        </Card>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {cellBox("Shots Faced", m.shotsFaced)}{cellBox("Saves", m.saves)}{cellBox("Goals Against", m.ga)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {cellBox("Save %", `${savePct}%`)}{cellBox("Clean Sheet", m.ga === 0 ? "Yes" : "No")}{cellBox("Minutes Played", m.minutesPlayed ? `${m.minutesPlayed}'` : "—")}
        </div>
        {showGMIS && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, letterSpacing: 0.5, marginBottom: 10 }}>MATCH CONTEXT</div>
            {gmisVal === null ? (
              <div style={{ fontSize: 13.5, color: C.grayDark, lineHeight: 1.55 }}>
                Attack shot data wasn't tracked for this match, so keeper-vs-attack context isn't available. This shows up for matches logged from the live tracker, which doesn't capture the team's offensive shots yet.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  {cellBox("Keeper Eff. (GDE)", gdeVal.toFixed(2))}
                  {cellBox("Attack Eff. (TOE)", toeVal.toFixed(2))}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
                  <span style={{ fontFamily: fontCond, fontSize: 34, fontWeight: 800, color: gmisVal >= 0 ? C.green : C.red }}>{gmisVal >= 0 ? "+" : "−"}{Math.abs(gmisVal).toFixed(2)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1 }}>GMIS</span>
                </div>
                <div style={{ fontSize: 13.5, color: "#C9C9C9", lineHeight: 1.55, marginTop: 8 }}>{gmisNarrative(gmisVal, m.res)}</div>
              </>
            )}
          </Card>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            disabled={realIdx <= 0}
            onClick={() => go("report", matches[realIdx - 1].n)}
            className="btn3d btn3d-outline"
            style={{ flex: 1, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, opacity: realIdx <= 0 ? 0.4 : 1 }}
          >‹ Previous</button>
          <button
            disabled={realIdx >= matches.length - 1}
            onClick={() => go("report", matches[realIdx + 1].n)}
            className="btn3d btn3d-outline"
            style={{ flex: 1, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, opacity: realIdx >= matches.length - 1 ? 0.4 : 1 }}
          >Next ›</button>
        </div>
      </div>
    </div>
  );
};

// ---------- 8. Season Progress ----------
const Progress = ({ go, baseline, matches, activeKeeper }) => {
  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Season Progress" left="‹" onLeft={() => go("dashboard")} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <EmptyState icon="📈" title="No season data yet" sub={`${activeKeeper.name}'s season trend will build up here as matches are tracked.`} cta="Start Live Match" onCta={() => go("tracker")} />
        </div>
      </div>
    );
  }
  const scored = matches.map((m) => ({ ...m, score: impactScoreFromStats(m.shotsFaced, m.saves, m.ga, baseline) }));
  const seasonAvg = Math.round(scored.reduce((a, m) => a + m.score, 0) / scored.length);
  const last5 = scored.slice(-5);
  const avgLast5 = Math.round(last5.reduce((a, m) => a + m.score, 0) / last5.length);
  const deltaVsSeason = avgLast5 - seasonAvg;
  const deltaText = deltaVsSeason === 0 ? "— even" : `${deltaVsSeason > 0 ? "↗ +" : "↘ −"}${Math.abs(deltaVsSeason)}`;
  const totalSaves = scored.reduce((a, m) => a + m.saves, 0), totalShots = scored.reduce((a, m) => a + m.shotsFaced, 0);
  const avgSavePct = totalShots ? Math.round((totalSaves / totalShots) * 100) : 0;
  const totalCS = scored.filter((m) => m.ga === 0).length;
  const totalGA = scored.reduce((a, m) => a + m.ga, 0);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Season Progress" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card style={{ background: `linear-gradient(180deg, #1c3a12 0%, ${C.greenDark} 100%)`, border: `1.5px solid ${C.green}44`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12.5, color: "#B9D9A0", fontWeight: 600 }}>Season GK Impact Score</div>
            <div style={{ fontFamily: fontCond, fontSize: 48, fontWeight: 800, color: C.green, lineHeight: 1.05, textShadow: `0 0 22px ${C.green}55` }}>{seasonAvg}</div>
            <div style={{ fontFamily: fontCond, fontSize: 16, fontWeight: 700, color: C.white, letterSpacing: 1.5 }}>{scoreWord(seasonAvg)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: fontCond, fontSize: 26, fontWeight: 800, color: C.green }}>{deltaText}</div>
            <div style={{ fontSize: 11.5, color: "#B9D9A0", fontWeight: 600 }}>vs Season Avg<br />(Last {last5.length})</div>
          </div>
        </Card>
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginBottom: 6 }}>GK Impact Score Over Time</div>
          {scored.length >= 2 ? (
            <LineChart data={scored.map((m) => m.score)} />
          ) : (
            <div style={{ fontSize: 13, color: C.grayDark, padding: "20px 0", textAlign: "center" }}>Track one more match to see a trend line.</div>
          )}
        </Card>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {cellBox("Avg. Save %", `${avgSavePct}%`)}{cellBox("Clean Sheets", totalCS)}{cellBox("Goals Against", totalGA)}
        </div>
        <Card style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {scored.slice().reverse().map((m, i) => (
            <button key={m.n} onClick={() => go("report", m.n)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", borderTop: i ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {m.opp}</div>
                <div style={{ fontSize: 11.5, color: C.grayDark }}>Match {m.n} · {m.res}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: fontCond, fontSize: 20, fontWeight: 800, color: m.score >= 70 ? C.green : m.score >= 55 ? C.gold : C.red }}>{m.score}</span>
                <span style={{ color: C.grayDark }}>›</span>
              </div>
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
};

// ---------- 9. Training Recommendations ----------
const Training = ({ go }) => {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Training Recommendations" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card>
          <div style={{ fontSize: 13.5, color: C.gray, fontWeight: 600 }}>Based on your performance</div>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.gold, marginTop: 4 }}>Focus: Low Diving Saves</div>
        </Card>
        {drills.map((d, i) => (
          <Card key={d.title} style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
            <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, background: "none", border: "none", cursor: "pointer" }}>
              <div className="drill-thumb">{d.emoji}</div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{d.title}</div>
                <div style={{ fontSize: 12.5, color: C.grayDark }}>{d.mins} min</div>
              </div>
              <div className="play-chip">▶</div>
            </button>
            {open === i && <div style={{ padding: "0 14px 14px", fontSize: 13.5, lineHeight: 1.5, color: "#C9C9C9" }}>{d.desc}</div>}
          </Card>
        ))}
        <button className="btn3d btn3d-orange" style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 26, fontFamily: fontCond, fontWeight: 700, fontSize: 17, letterSpacing: 1.5 }}>
          VIEW ALL DRILLS
        </button>
      </div>
    </div>
  );
};

// ---------- 10. Interview & Feedback ----------
const Interview = ({ go }) => {
  const [tab, setTab] = useState("Coach");
  const [q, setQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const key = `${tab}-${q}`;
  const next = () => (q < coachQuestions.length - 1 ? setQ(q + 1) : setDone(true));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Interview & Feedback" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div className="tab-track">
          {["Coach", "Parent", "Keeper"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setQ(0); setDone(false); }} className={`tab-pill ${tab === t ? "tab-pill-active" : ""}`}>
              {t}
            </button>
          ))}
        </div>
        {!done ? (
          <Card style={{ marginTop: 14, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{tab} Questions</span>
              <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>{q + 1} / {coachQuestions.length}</span>
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 600, color: C.white, lineHeight: 1.45, margin: "12px 0" }}>{coachQuestions[q]}</div>
            <textarea
              value={answers[key] || ""}
              onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
              placeholder="Type your answer..."
              className="input-well"
              style={{ flex: 1, minHeight: 140, resize: "none", padding: 12, color: C.white, fontSize: 16, fontFamily: font, outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <button onClick={next} className="btn3d btn3d-orange" style={{ flex: 1, padding: 14, borderRadius: 24, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1.5 }}>NEXT</button>
              <button onClick={next} style={{ background: "none", border: "none", color: C.gray, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>SKIP</button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 14 }}>
              {coachQuestions.map((_, i) => (
                <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === q ? C.orange : "#3A3A3A", boxShadow: i === q ? `0 0 8px ${C.orange}88` : "none" }} />
              ))}
            </div>
          </Card>
        ) : (
          <Card style={{ marginTop: 14, textAlign: "center", padding: "34px 20px" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontFamily: fontCond, fontSize: 22, fontWeight: 800, color: C.white, marginTop: 8 }}>FEEDBACK SUBMITTED</div>
            <div style={{ fontSize: 14, color: C.gray, marginTop: 6 }}>Answers are saved to this match and shared with the {tab === "Coach" ? "family" : "coach"}.</div>
            <button onClick={() => { setQ(0); setDone(false); }} className="btn3d btn3d-outline" style={{ marginTop: 18, padding: "12px 26px", borderRadius: 22, color: C.orange, fontWeight: 700, fontSize: 14 }}>Review answers</button>
          </Card>
        )}
      </div>
    </div>
  );
};

// ---------- keeper avatar (photo, falling back to initial letter) ----------
const Avatar = ({ keeper, style }) =>
  keeper.photoUrl ? (
    <img src={keeper.photoUrl} alt={keeper.name} className="keeper-avatar" style={{ objectFit: "cover", ...style }} />
  ) : (
    <span className="keeper-avatar" style={style}>{(keeper.name.trim().charAt(0) || "?").toUpperCase()}</span>
  );

// ---------- keeper switcher sheet ----------
const KeeperSheet = ({ open, onClose, keepers, activeId, onSelect, onAdd }) => (
  <>
    <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
    <div className={`sheet ${open ? "open" : ""}`}>
      <div className="sheet-handle" />
      <div className="sheet-header">
        <span>Switch Keeper</span>
        <button className="sheet-close" onClick={onClose}>✕</button>
      </div>
      {keepers.map((k) => (
        <button key={k.id} className="sheet-row" onClick={() => onSelect(k.id)}>
          <Avatar keeper={k} />
          <span className="sheet-row-text">
            <span className="sheet-row-title">{k.name}</span>
            <span className="sheet-row-desc">{k.team}</span>
          </span>
          {k.id === activeId ? <span style={{ color: C.orange, fontSize: 17, fontWeight: 700 }}>✓</span> : <span className="sheet-row-chev">›</span>}
        </button>
      ))}
      <button className="sheet-row" onClick={onAdd}>
        <span className="keeper-avatar" style={{ background: "transparent", border: `1.5px dashed ${C.orange}88`, color: C.orange, boxShadow: "none" }}>+</span>
        <span className="sheet-row-text"><span className="sheet-row-title" style={{ color: C.orange }}>Add Keeper</span></span>
      </button>
    </div>
  </>
);

// ---------- 11. Settings ----------
const Toggle = ({ on, onChange }) => (
  <button onClick={() => onChange(!on)} className={`switch ${on ? "switch-on" : ""}`}>
    <span className="switch-knob" />
  </button>
);

const TeamRecord = ({ matches }) => {
  const w = matches.filter((m) => m.res?.startsWith("W")).length;
  const l = matches.filter((m) => m.res?.startsWith("L")).length;
  const d = matches.filter((m) => m.res?.startsWith("D")).length;
  const gf = matches.reduce((s, m) => s + (m.goalsScored || 0), 0);
  const ga = matches.reduce((s, m) => s + (m.ga || 0), 0);
  const gd = gf - ga;
  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 10 }}>TEAM RECORD</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: fontCond, fontWeight: 800, fontSize: 26, color: C.white, letterSpacing: 0.5 }}>{w}-{l}-{d}</span>
        <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>
          GF {gf} · GA {ga} · GD {gd >= 0 ? "+" : ""}{gd}
        </span>
      </div>
    </Card>
  );
};

const ScheduleImport = ({ fixtures, onImport, onDelete }) => {
  const [text, setText] = useState("");
  const fileInputRef = useRef(null);

  const importText = () => {
    const items = parseScheduleText(text);
    if (items.length) {
      onImport(items);
      setText("");
    }
  };

  const importFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const items = parseScheduleText(String(reader.result || ""));
      if (items.length) onImport(items);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>SEASON SCHEDULE</div>
      <div style={{ fontSize: 12.5, color: C.grayDark, lineHeight: 1.5, marginBottom: 12 }}>
        Paste rows as "Opponent, Date" (one per line), or upload a .csv/.tsv export from a spreadsheet.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Harbor FC, 2026-08-01\nWestfield Rovers, 2026-08-08"}
        className="input-well"
        style={{ width: "100%", minHeight: 76, padding: "10px 12px", color: C.white, fontSize: 14, fontFamily: font, outline: "none", resize: "vertical", marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={importText} className="btn3d btn3d-orange" style={{ flex: 1, padding: 12, borderRadius: 12, fontFamily: fontCond, fontWeight: 700, fontSize: 14, letterSpacing: 0.5 }}>
          Import Pasted Rows
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="btn3d btn3d-outline" style={{ flex: 1, padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 13 }}>
          Upload CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={importFile} style={{ display: "none" }} />
      </div>

      {fixtures.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {fixtures.map((f) => (
            <div key={f.id} className="settings-row">
              <div>
                <div className="settings-row-label">{f.opponent}</div>
                {f.date && <div className="settings-row-desc">{f.date}</div>}
              </div>
              <button onClick={() => onDelete(f.id)} style={{ background: "none", border: "none", color: C.red, fontSize: 18, fontWeight: 700, cursor: "pointer", padding: 4 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const MatchHistoryRow = ({ match, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(match);

  useEffect(() => { setForm(match); }, [match]);

  if (!editing) {
    return (
      <button className="sheet-row" style={{ padding: "10px 14px", width: "100%" }} onClick={() => setEditing(true)}>
        <span className="sheet-row-text">
          <span className="sheet-row-title">{match.opp}</span>
          <span className="sheet-row-desc">{match.res} · {match.saves} saves / {match.shotsFaced} faced</span>
        </span>
        <span className="sheet-row-chev">✎</span>
      </button>
    );
  }

  const field = (label, key, type = "text") => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
        className="input-well"
        style={{ width: "100%", padding: "8px 10px", color: C.white, fontSize: 14, fontFamily: font, outline: "none" }}
      />
    </div>
  );

  const save = () => {
    const goalsScored = Number(form.goalsScored) || 0;
    const ga = Number(form.ga) || 0;
    const res = `${goalsScored > ga ? "W" : goalsScored < ga ? "L" : "D"} ${goalsScored}-${ga}`;
    onSave(match.id, { ...form, goalsScored, ga, res });
    setEditing(false);
  };

  return (
    <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}` }}>
      {field("Opponent", "opp")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("Saves", "saves", "number")}
        {field("Shots Faced", "shotsFaced", "number")}
        {field("Goals Against", "ga", "number")}
        {field("Goals Scored", "goalsScored", "number")}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={save} className="btn3d btn3d-orange" style={{ flex: 1, padding: 10, borderRadius: 10, fontFamily: fontCond, fontWeight: 700, fontSize: 13 }}>
          Save
        </button>
        <button onClick={() => { onDelete(match.id); setEditing(false); }} className="btn3d btn3d-outline" style={{ flex: 1, padding: 10, borderRadius: 10, color: C.red, fontWeight: 700, fontSize: 13 }}>
          Delete
        </button>
        <button onClick={() => setEditing(false)} className="btn3d btn3d-outline" style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13 }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

const MatchHistory = ({ matches, onSave, onDelete }) => (
  <Card style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, padding: "14px 14px 6px" }}>MATCH HISTORY</div>
    {matches.length === 0 ? (
      <div style={{ padding: "0 14px 14px", fontSize: 13, color: C.grayDark }}>No matches tracked yet.</div>
    ) : (
      [...matches].reverse().map((m) => <MatchHistoryRow key={m.id} match={m} onSave={onSave} onDelete={onDelete} />)
    )}
  </Card>
);

const Settings = ({
  go, keepers, activeKeeper, updateActiveKeeper, selectKeeper, addKeeper, showGMIS, setShowGMIS, notifPrefs, setNotifPrefs,
  matches, onUpdateMatch, onDeleteMatch, fixtures, onImportSchedule, onDeleteFixture, onLogout, onUploadPhoto,
}) => {
  const session = authClient.useSession();
  const accountLabel = session?.data?.user?.email || "Demo Mode — nothing here is saved";
  const photoInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true);
    try {
      await onUploadPhoto(file);
    } catch (err) {
      console.error("Failed to upload photo", err);
    } finally {
      setPhotoUploading(false);
    }
  };
  return (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
    <Header title="Settings" left="‹" onLeft={() => go("dashboard")} />
    <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, padding: "14px 14px 6px" }}>KEEPERS</div>
        {keepers.map((k) => (
          <button key={k.id} className="sheet-row" style={{ padding: "10px 14px" }} onClick={() => selectKeeper(k.id)}>
            <Avatar keeper={k} />
            <span className="sheet-row-text">
              <span className="sheet-row-title">{k.name}</span>
              <span className="sheet-row-desc">{k.team}</span>
            </span>
            {k.id === activeKeeper.id && <span style={{ color: C.orange, fontSize: 17, fontWeight: 700 }}>✓</span>}
          </button>
        ))}
        <div style={{ padding: 14 }}>
          <button onClick={addKeeper} className="btn3d btn3d-outline" style={{ width: "100%", padding: 12, borderRadius: 12, color: C.orange, fontWeight: 700, fontSize: 13 }}>
            + Add Keeper
          </button>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 10 }}>EDIT — {activeKeeper.name}</div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={photoUploading}
            style={{ position: "relative", background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%", opacity: photoUploading ? 0.6 : 1 }}
          >
            <Avatar keeper={activeKeeper} style={{ width: 88, height: 88, fontSize: 32 }} />
            <span style={{ position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: "50%", background: C.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: "2px solid #0f0f0f" }}>
              {photoUploading ? "…" : "📷"}
            </span>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
        </div>
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Keeper Name</div>
        <input
          value={activeKeeper.name}
          onChange={(e) => updateActiveKeeper({ name: e.target.value })}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none", marginBottom: 12 }}
        />
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Team</div>
        <input
          value={activeKeeper.team}
          onChange={(e) => updateActiveKeeper({ team: e.target.value })}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 15, fontFamily: font, outline: "none" }}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>LEVEL OF PLAY</div>
        <div style={{ fontSize: 12.5, color: C.grayDark, lineHeight: 1.5, marginBottom: 12 }}>
          Sets the expected save rate {activeKeeper.name}'s GK Impact Score is measured against.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {Object.entries(LEVELS).map(([key, cfg]) => (
            <button key={key} onClick={() => updateActiveKeeper({ level: key })} className={`level-chip ${activeKeeper.level === key ? "level-chip-active" : ""}`}>
              <div className="level-chip-title">{cfg.short}</div>
              <div className="level-chip-sub">{Math.round(cfg.baseline * 100)}% expected save rate</div>
            </button>
          ))}
        </div>
      </Card>

      <TeamRecord matches={matches} />
      <ScheduleImport fixtures={fixtures} onImport={onImportSchedule} onDelete={onDeleteFixture} />
      <MatchHistory matches={matches} onSave={onUpdateMatch} onDelete={onDeleteMatch} />

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>SCORING & REPORTS</div>
        <div className="settings-row" style={{ borderTop: "none" }}>
          <div>
            <div className="settings-row-label">Show Match Context (GMIS)</div>
            <div className="settings-row-desc">Compares keeper vs. attack efficiency on match reports</div>
          </div>
          <Toggle on={showGMIS} onChange={setShowGMIS} />
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>NOTIFICATIONS</div>
        <div className="settings-row" style={{ borderTop: "none" }}>
          <div>
            <div className="settings-row-label">Match Reminders</div>
            <div className="settings-row-desc">Alerts before scheduled matches</div>
          </div>
          <Toggle on={notifPrefs.matchReminders} onChange={(v) => setNotifPrefs({ ...notifPrefs, matchReminders: v })} />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Weekly Summary</div>
            <div className="settings-row-desc">A recap of training and matches every Sunday</div>
          </div>
          <Toggle on={notifPrefs.weeklySummary} onChange={(v) => setNotifPrefs({ ...notifPrefs, weeklySummary: v })} />
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 10 }}>ACCOUNT</div>
        <div style={{ fontSize: 14, color: "#DADADA", marginBottom: 14 }}>{accountLabel}</div>
        <button onClick={onLogout} className="btn3d btn3d-outline" style={{ width: "100%", padding: 13, borderRadius: 12, color: C.red, fontWeight: 700, fontSize: 14 }}>
          {session?.data?.user ? "Log Out" : "Exit Demo"}
        </button>
      </Card>
    </div>
  </div>
  );
};

/* ============================================================ APP */

const emptyMatch = (opponent = "") => ({
  opponent, ourGoals: 0, goalsAgainst: 0, saves: 0, shotsFaced: 0, clock: "00:00", log: [],
  distributionCompleted: 0, distributionAttempted: 0, claims: 0, punches: 0,
  penaltySaves: 0, bigSaves: 0, errors: 0, notes: "",
});

export default function KeeperStat() {
  const [screen, setScreen] = useState("welcome");
  const [moreOpen, setMoreOpen] = useState(false);
  const [keeperSheetOpen, setKeeperSheetOpen] = useState(false);
  const [matchStatus, setMatchStatus] = useState("idle"); // idle | live | ended
  const [match, setMatch] = useState(() => emptyMatch());
  const [showGMIS, setShowGMIS] = useState(true);
  const [notifPrefs, setNotifPrefs] = useState({ matchReminders: true, weeklySummary: false });
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState(null);

  // Two ways into the app: "demo" runs entirely on local, throwaway sample
  // data (src/demoApi.js); "auth" is a real Neon Auth account whose data
  // lives in Neon (src/api.js). Nothing renders the keeper screens until
  // one of these is chosen — see the mode-gated guards below.
  const [mode, setMode] = useState(null); // null | "demo" | "auth"
  const demoApiRef = useRef(null);
  const dataApi = mode === "demo" ? demoApiRef.current : api;

  // multi-keeper support: each keeper has their own profile + match history,
  // so a parent with more than one kid in goal can switch between them.
  const [keepers, setKeepers] = useState([]);
  const [keepersLoading, setKeepersLoading] = useState(true);
  const [activeKeeperId, setActiveKeeperId] = useState(null);
  const [matchesByKeeper, setMatchesByKeeper] = useState({});
  const [fixturesByKeeper, setFixturesByKeeper] = useState({});
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  // Resume an existing real session on reload, so logging in sticks.
  useEffect(() => {
    let cancelled = false;
    refreshAuthToken().then((token) => {
      if (!cancelled && token) {
        setMode("auth");
        go("dashboard");
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mode) return;
    const currentApi = mode === "demo" ? demoApiRef.current : api;
    let cancelled = false;
    setKeepersLoading(true);
    (async () => {
      try {
        const ks = await currentApi.listKeepers();
        if (cancelled) return;
        setKeepers(ks);
        if (ks.length) {
          const firstId = ks[0].id;
          setActiveKeeperId(firstId);
          const [ms, fx] = await Promise.all([currentApi.listMatches(firstId), currentApi.listFixtures(firstId)]);
          if (cancelled) return;
          setMatchesByKeeper({ [firstId]: ms });
          setFixturesByKeeper({ [firstId]: fx });
        } else {
          setActiveKeeperId(null);
          setMatchesByKeeper({});
          setFixturesByKeeper({});
        }
      } catch (err) {
        console.error("Failed to load keepers", err);
      } finally {
        if (!cancelled) setKeepersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  const enterDemo = () => {
    demoApiRef.current = createDemoApi();
    setMode("demo");
    go("tracker");
  };
  const handleAuthenticated = () => {
    setMode("auth");
    go("dashboard");
  };
  const handleLogout = async () => {
    if (mode === "auth") await authClient.signOut().catch(() => {});
    setCachedAuthToken(null);
    demoApiRef.current = null;
    setMode(null);
    setKeepers([]);
    setActiveKeeperId(null);
    setMatchesByKeeper({});
    setFixturesByKeeper({});
    go("welcome");
  };

  const activeKeeper = keepers.find((k) => k.id === activeKeeperId) || keepers[0];
  const matches = matchesByKeeper[activeKeeperId] || [];
  const fixtures = fixturesByKeeper[activeKeeperId] || [];
  const baseline = activeKeeper ? LEVELS[activeKeeper.level].baseline : null;

  const updateActiveKeeper = (patch) => {
    setKeepers((ks) => ks.map((k) => (k.id === activeKeeperId ? { ...k, ...patch } : k)));
    dataApi.updateKeeper(activeKeeperId, patch).catch((err) => console.error("Failed to save keeper", err));
  };
  const uploadPhoto = async (file) => {
    const photoUrl = await dataApi.uploadKeeperPhoto(activeKeeperId, file);
    updateActiveKeeper({ photoUrl });
  };
  const addKeeper = () => {
    dataApi.createKeeper({ name: "New Keeper", team: "My Team", level: "youth" })
      .then((keeper) => {
        setKeepers((ks) => [...ks, keeper]);
        setMatchesByKeeper((mb) => ({ ...mb, [keeper.id]: [] }));
        setFixturesByKeeper((fb) => ({ ...fb, [keeper.id]: [] }));
        setActiveKeeperId(keeper.id);
        setKeeperSheetOpen(false);
      })
      .catch((err) => console.error("Failed to create keeper", err));
  };
  const selectKeeper = (id) => {
    setActiveKeeperId(id);
    setKeeperSheetOpen(false);
    if (!matchesByKeeper[id]) {
      dataApi.listMatches(id)
        .then((ms) => setMatchesByKeeper((mb) => ({ ...mb, [id]: ms })))
        .catch((err) => console.error("Failed to load matches", err));
    }
    if (!fixturesByKeeper[id]) {
      dataApi.listFixtures(id)
        .then((fx) => setFixturesByKeeper((fb) => ({ ...fb, [id]: fx })))
        .catch((err) => console.error("Failed to load fixtures", err));
    }
  };

  const importFixtures = (items) => {
    dataApi.importFixtures(activeKeeperId, items)
      .then((created) => {
        setFixturesByKeeper((fb) => ({
          ...fb,
          [activeKeeperId]: [...(fb[activeKeeperId] || []), ...created].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
        }));
      })
      .catch((err) => console.error("Failed to import schedule", err));
  };
  const deleteFixture = (fixtureId) => {
    setFixturesByKeeper((fb) => ({ ...fb, [activeKeeperId]: (fb[activeKeeperId] || []).filter((f) => f.id !== fixtureId) }));
    dataApi.deleteFixture(activeKeeperId, fixtureId).catch((err) => console.error("Failed to delete fixture", err));
  };
  const updateMatch = (matchId, patch) => {
    setMatchesByKeeper((mb) => ({
      ...mb,
      [activeKeeperId]: (mb[activeKeeperId] || []).map((m) => (m.id === matchId ? { ...m, ...patch } : m)),
    }));
    dataApi.updateMatch(activeKeeperId, matchId, patch).catch((err) => console.error("Failed to update match", err));
  };
  const deleteMatch = (matchId) => {
    setMatchesByKeeper((mb) => ({ ...mb, [activeKeeperId]: (mb[activeKeeperId] || []).filter((m) => m.id !== matchId) }));
    dataApi.deleteMatch(activeKeeperId, matchId).catch((err) => console.error("Failed to delete match", err));
  };

  // live clock tick — only while a match is actually in progress
  useEffect(() => {
    if (matchStatus !== "live") return;
    const id = setInterval(() => {
      setMatch((m) => {
        const [mm, ss] = m.clock.split(":").map(Number);
        const t = mm * 60 + ss + 1;
        return { ...m, clock: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [matchStatus]);

  const startMatch = (opponent) => {
    setMatch(emptyMatch(opponent));
    setMatchStatus("live");
  };
  const endMatch = () => setMatchStatus("ended");
  const resumeMatch = () => setMatchStatus("live");
  const discardMatch = () => {
    setMatch(emptyMatch());
    setMatchStatus("idle");
  };
  const setMatchNotes = (notes) => setMatch((m) => ({ ...m, notes }));
  const saveMatchToHistory = () => {
    const faced = Math.max(match.shotsFaced, match.saves + match.goalsAgainst);
    const [mm] = match.clock.split(":").map(Number);
    const payload = {
      opp: match.opponent || "Unknown Opponent",
      saves: match.saves,
      shotsFaced: faced,
      ga: match.goalsAgainst,
      res: `${match.ourGoals > match.goalsAgainst ? "W" : match.ourGoals < match.goalsAgainst ? "L" : "D"} ${match.ourGoals}-${match.goalsAgainst}`,
      goalsScored: match.ourGoals,
      teamShotsOnGoal: null, // the live tracker only captures the keeper's own stats today
      minutesPlayed: mm || null,
      distributionCompleted: match.distributionCompleted,
      distributionAttempted: match.distributionAttempted,
      claims: match.claims,
      punches: match.punches,
      penaltySaves: match.penaltySaves,
      bigSaves: match.bigSaves,
      errors: match.errors,
      notes: match.notes || null,
    };
    dataApi.createMatch(activeKeeperId, payload)
      .then((record) => {
        setMatchesByKeeper((mb) => ({ ...mb, [activeKeeperId]: [...(mb[activeKeeperId] || []), record] }));
        setMatch(emptyMatch());
        setMatchStatus("idle");
        go("report", record.n);
      })
      .catch((err) => console.error("Failed to save match", err));
  };

  const dispatch = (a) => {
    setMatch((m) => {
      if (a.type === "save") return { ...m, saves: m.saves + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "save", label: "Save" }] };
      if (a.type === "goal") return { ...m, goalsAgainst: m.goalsAgainst + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "goal", label: "Goal Against" }] };
      if (a.type === "goalFor") return { ...m, ourGoals: m.ourGoals + 1, log: [...m.log, { t: "goalFor", label: "Goal For" }] };
      if (a.type === "shot") return { ...m, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "shot", label: "Shot on Target Faced" }] };
      if (a.type === "distributionComplete") return { ...m, distributionCompleted: m.distributionCompleted + 1, distributionAttempted: m.distributionAttempted + 1, log: [...m.log, { t: "distributionComplete", label: "Distribution Completed" }] };
      if (a.type === "distributionMiss") return { ...m, distributionAttempted: m.distributionAttempted + 1, log: [...m.log, { t: "distributionMiss", label: "Distribution Missed" }] };
      if (a.type === "claim") return { ...m, claims: m.claims + 1, log: [...m.log, { t: "claim", label: "Claim" }] };
      if (a.type === "punch") return { ...m, punches: m.punches + 1, log: [...m.log, { t: "punch", label: "Punch" }] };
      if (a.type === "penaltySave") return { ...m, penaltySaves: m.penaltySaves + 1, saves: m.saves + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "penaltySave", label: "Penalty Save" }] };
      if (a.type === "bigSave") return { ...m, bigSaves: m.bigSaves + 1, saves: m.saves + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "bigSave", label: "Big Save" }] };
      if (a.type === "toggleError") {
        if (!m.log.length) return m;
        const lastIdx = m.log.length - 1;
        const last = m.log[lastIdx];
        if (last.t !== "goal") return m;
        const flagged = !last.isError;
        const log = [...m.log];
        log[lastIdx] = { ...last, isError: flagged, label: flagged ? "Goal Against (Error)" : "Goal Against" };
        return { ...m, errors: m.errors + (flagged ? 1 : -1), log };
      }
      if (a.type === "undo" && m.log.length) {
        const last = m.log[m.log.length - 1];
        const log = m.log.slice(0, -1);
        if (last.t === "save") return { ...m, saves: m.saves - 1, shotsFaced: m.shotsFaced - 1, log };
        if (last.t === "goal") return { ...m, goalsAgainst: m.goalsAgainst - 1, shotsFaced: m.shotsFaced - 1, errors: last.isError ? m.errors - 1 : m.errors, log };
        if (last.t === "goalFor") return { ...m, ourGoals: m.ourGoals - 1, log };
        if (last.t === "distributionComplete") return { ...m, distributionCompleted: m.distributionCompleted - 1, distributionAttempted: m.distributionAttempted - 1, log };
        if (last.t === "distributionMiss") return { ...m, distributionAttempted: m.distributionAttempted - 1, log };
        if (last.t === "claim") return { ...m, claims: m.claims - 1, log };
        if (last.t === "punch") return { ...m, punches: m.punches - 1, log };
        if (last.t === "penaltySave") return { ...m, penaltySaves: m.penaltySaves - 1, saves: m.saves - 1, shotsFaced: m.shotsFaced - 1, log };
        if (last.t === "bigSave") return { ...m, bigSaves: m.bigSaves - 1, saves: m.saves - 1, shotsFaced: m.shotsFaced - 1, log };
        return { ...m, shotsFaced: m.shotsFaced - 1, log };
      }
      return m;
    });
  };

  const openShare = (data) => { setShareData(data); setShareOpen(true); };

  if (mode && keepersLoading) {
    return (
      <div className="app-shell" style={{ background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.gray, fontFamily: font }}>
        Loading…
      </div>
    );
  }

  if (mode && !activeKeeper) {
    return (
      <div className="app-shell" style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: C.white, fontFamily: font, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>No keeper profiles yet</div>
        <button
          onClick={addKeeper}
          style={{ padding: "12px 24px", borderRadius: 22, fontFamily: fontCond, fontWeight: 700, fontSize: 15, color: "#fff", background: C.orange, border: "none", cursor: "pointer" }}
        >
          Create Keeper Profile
        </button>
      </div>
    );
  }

  const go = (s, matchId) => {
    setScreen(s);
    setMoreOpen(false);
    if (s === "report") setSelectedMatchId(matchId || (matches.length ? matches[matches.length - 1].n : null));
  };

  const handleNav = (key) => {
    if (key === "more") { setMoreOpen(true); return; }
    go(key);
  };

  const screens = {
    welcome: <Welcome onDemo={enterDemo} onLogin={() => go("login")} />,
    login: <Login onAuthenticated={handleAuthenticated} onBack={() => go("welcome")} />,
    tracker: (
      <Tracker
        match={match} dispatch={dispatch} go={go}
        activeKeeper={activeKeeper} onOpenKeeperSwitch={() => setKeeperSheetOpen(true)}
        matchStatus={matchStatus} baseline={baseline}
        onStartMatch={startMatch} onEndMatch={endMatch} onResumeMatch={resumeMatch}
        onSaveMatch={saveMatchToHistory} onDiscardMatch={discardMatch}
        onNotesChange={setMatchNotes}
        fixtures={fixtures}
      />
    ),
    stats: <MatchStats match={match} go={go} baseline={baseline} />,
    dashboard: <Dashboard go={go} baseline={baseline} matches={matches} activeKeeper={activeKeeper} onOpenKeeperSwitch={() => setKeeperSheetOpen(true)} />,
    parent: <ParentView go={go} baseline={baseline} matches={matches} activeKeeper={activeKeeper} />,
    development: <Development go={go} baseline={baseline} matches={matches} activeKeeper={activeKeeper} />,
    report: <MatchReport go={go} baseline={baseline} showGMIS={showGMIS} matches={matches} matchId={selectedMatchId} activeKeeper={activeKeeper} onShare={openShare} />,
    progress: <Progress go={go} baseline={baseline} matches={matches} activeKeeper={activeKeeper} />,
    training: <Training go={go} />,
    interview: <Interview go={go} />,
    settings: (
      <Settings
        go={go}
        keepers={keepers}
        activeKeeper={activeKeeper}
        updateActiveKeeper={updateActiveKeeper}
        selectKeeper={selectKeeper}
        addKeeper={addKeeper}
        showGMIS={showGMIS} setShowGMIS={setShowGMIS}
        notifPrefs={notifPrefs} setNotifPrefs={setNotifPrefs}
        matches={matches}
        onUpdateMatch={updateMatch}
        onDeleteMatch={deleteMatch}
        fixtures={fixtures}
        onImportSchedule={importFixtures}
        onDeleteFixture={deleteFixture}
        onLogout={handleLogout}
        onUploadPhoto={uploadPhoto}
      />
    ),
  };

  return (
    <div className="app-shell" style={{ background: "#000", display: "flex", justifyContent: "center", fontFamily: font, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        textarea::placeholder { color: #5a5a5a; }
        ::-webkit-scrollbar { display: none; }
        button:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 2px; }

        /* ---- raised panel (card) ---- */
        .panel {
          background: linear-gradient(180deg, #181818 0%, #0f0f0f 100%);
          border: 1px solid ${C.border};
          border-top-color: #333;
          border-radius: 16px;
          box-shadow: 0 10px 22px rgba(0,0,0,.45), 0 2px 5px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);
        }

        /* ---- 3D bevel buttons ---- */
        .btn3d {
          cursor: pointer;
          border: none;
          transition: transform .08s ease, box-shadow .08s ease;
        }
        .btn3d:active { transform: translateY(3px); }
        .btn3d-orange {
          color: #fff;
          background: linear-gradient(180deg, #FF8A3D 0%, #FF5C00 55%, #E85300 100%);
          box-shadow: 0 5px 0 #A83E00, 0 10px 20px rgba(255,92,0,.35), inset 0 1px 0 rgba(255,255,255,.35);
        }
        .btn3d-orange:active { box-shadow: 0 1px 0 #A83E00, 0 4px 10px rgba(255,92,0,.3), inset 0 1px 0 rgba(255,255,255,.2); }
        .btn3d-outline {
          color: #fff;
          background: linear-gradient(180deg, #202020 0%, #131313 100%);
          border: 1.5px solid #3a3a3a;
          box-shadow: 0 4px 0 #050505, 0 8px 16px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .btn3d-outline:active { box-shadow: 0 1px 0 #050505, 0 3px 8px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04); }

        /* ---- tracker action tiles (dark panels + colored accents) ---- */
        .tile-btn {
          width: 100%; height: 100%; min-height: 92px; border-radius: 18px; color: #fff;
          background: linear-gradient(180deg, #1b1b1b 0%, #0f0f0f 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; position: relative; overflow: hidden; touch-action: manipulation;
          transition: transform .08s ease;
        }
        .tile-btn:active:not(:disabled) { transform: translateY(4px); }
        .tile-btn:disabled { cursor: default; }
        .tile-icon {
          width: 46px; height: 46px; border-radius: 50%; font-size: 22px;
          display: flex; align-items: center; justify-content: center;
        }
        .tile-accent {
          width: 40px; height: 3px; border-radius: 2px; flex-shrink: 0;
        }

        /* ---- recessed ring housing ---- */
        .ring-well {
          position: relative; border-radius: 50%;
          background: radial-gradient(circle at 50% 40%, #171717, #060606 75%);
          box-shadow: inset 0 6px 14px rgba(0,0,0,.6), inset 0 -3px 6px rgba(255,255,255,.03), 0 4px 10px rgba(0,0,0,.4);
        }

        /* ---- recessed progress groove ---- */
        .groove-track {
          flex: 1; height: 9px; border-radius: 5px; overflow: hidden;
          background: #161616; box-shadow: inset 0 2px 5px rgba(0,0,0,.7), inset 0 -1px 0 rgba(255,255,255,.04);
        }

        /* ---- misc raised chips ---- */
        .icon-chip {
          width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px;
          background: linear-gradient(180deg, #232323, #141414); box-shadow: 0 2px 0 #050505, inset 0 1px 0 rgba(255,255,255,.08);
        }
        .dropdown-pill {
          background: linear-gradient(180deg, #1e1e1e, #131313); border: 1px solid ${C.border}; border-radius: 12px;
          padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;
          font-size: 14px; font-weight: 600; color: #fff;
          box-shadow: 0 4px 0 #050505, 0 6px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .badge-check {
          width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;
          background: linear-gradient(180deg, #43a047, ${C.greenMid}); box-shadow: 0 2px 0 #0d3a10, inset 0 1px 0 rgba(255,255,255,.3);
        }
        .badge-bang {
          width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #000;
          background: linear-gradient(180deg, #ffc14d, ${C.gold}); box-shadow: 0 2px 0 #a86e00, inset 0 1px 0 rgba(255,255,255,.4);
        }
        .win-badge {
          background: linear-gradient(180deg, #43a047, ${C.greenMid}); color: #fff; font-family: ${fontCond}; font-weight: 700; font-size: 15px;
          padding: 4px 14px; border-radius: 7px; letter-spacing: 1px; box-shadow: 0 3px 0 #0d3a10, inset 0 1px 0 rgba(255,255,255,.3);
        }
        .loss-badge {
          background: linear-gradient(180deg, #e57373, ${C.red}); color: #fff; font-family: ${fontCond}; font-weight: 700; font-size: 15px;
          padding: 4px 14px; border-radius: 7px; letter-spacing: 1px; box-shadow: 0 3px 0 #6e1212, inset 0 1px 0 rgba(255,255,255,.3);
        }
        .draw-badge {
          background: linear-gradient(180deg, #ffc14d, ${C.gold}); color: #1a1200; font-family: ${fontCond}; font-weight: 700; font-size: 15px;
          padding: 4px 14px; border-radius: 7px; letter-spacing: 1px; box-shadow: 0 3px 0 #a86e00, inset 0 1px 0 rgba(255,255,255,.35);
        }
        .drill-thumb {
          width: 62px; height: 46px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;
          background: linear-gradient(140deg, #274a17, #0d1a08); box-shadow: 0 3px 0 #050805, inset 0 1px 0 rgba(255,255,255,.08);
        }
        .play-chip {
          width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px;
          background: linear-gradient(180deg, #2e2e2e, #181818); box-shadow: 0 2px 0 #050505, inset 0 1px 0 rgba(255,255,255,.1);
        }
        .input-well {
          background: #0a0a0a; border: 1px solid ${C.border}; border-radius: 10px;
          box-shadow: inset 0 3px 8px rgba(0,0,0,.7);
        }

        /* ---- tab track (interview) ---- */
        .tab-track {
          display: flex; background: linear-gradient(180deg, #0b0b0b, #141414); border: 1px solid ${C.border};
          border-radius: 24px; padding: 4px; box-shadow: inset 0 3px 8px rgba(0,0,0,.7);
        }
        .tab-pill {
          flex: 1; padding: 9px 0; border-radius: 20px; border: none; cursor: pointer; font-weight: 700; font-size: 14px;
          color: ${C.gray}; background: transparent; transition: all .15s ease;
        }
        .tab-pill-active {
          color: #fff; background: linear-gradient(180deg, #FF8A3D, #E85300);
          box-shadow: 0 3px 0 #A83E00, 0 6px 14px rgba(255,92,0,.35), inset 0 1px 0 rgba(255,255,255,.3);
        }

        /* ---- settings: toggle switch ---- */
        .switch {
          width: 48px; height: 28px; border-radius: 16px; border: none; cursor: pointer; padding: 3px; flex-shrink: 0;
          background: linear-gradient(180deg, #0a0a0a, #171717);
          box-shadow: inset 0 2px 6px rgba(0,0,0,.7);
          transition: background .2s ease;
        }
        .switch-knob {
          display: block; width: 22px; height: 22px; border-radius: 50%;
          background: linear-gradient(180deg, #3e3e3e, #1c1c1c);
          box-shadow: 0 2px 4px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.15);
          transition: transform .2s ease;
        }
        .switch-on { background: linear-gradient(180deg, #FF8A3D, #E85300); box-shadow: inset 0 2px 5px rgba(120,40,0,.4); }
        .switch-on .switch-knob { transform: translateX(20px); background: linear-gradient(180deg, #fff, #f0f0f0); }

        /* ---- settings: level of play chips ---- */
        .level-chip {
          padding: 14px 12px; border-radius: 14px; cursor: pointer; text-align: left;
          border: 1.5px solid #2a2a2a; background: linear-gradient(180deg, #171717, #0f0f0f);
          box-shadow: 0 3px 0 #050505, inset 0 1px 0 rgba(255,255,255,.05);
          transition: all .15s ease;
        }
        .level-chip-active {
          border-color: ${C.orange};
          background: linear-gradient(180deg, rgba(255,92,0,.2), rgba(255,92,0,.05));
          box-shadow: 0 3px 0 #A83E00, inset 0 1px 0 rgba(255,255,255,.08);
        }
        .level-chip-title { font-size: 14px; font-weight: 700; color: #fff; }
        .level-chip-sub { font-size: 11px; color: #8a8a8a; margin-top: 3px; }

        /* ---- settings: rows ---- */
        .settings-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 12px 2px; border-top: 1px solid #202020;
        }
        .settings-row-label { font-size: 15px; font-weight: 600; color: #fff; }
        .settings-row-desc { font-size: 12px; color: #8a8a8a; margin-top: 2px; }

        /* ---- bottom nav ---- */
        .navbar {
          display: flex; gap: 4px; padding: 10px 8px calc(16px + env(safe-area-inset-bottom)); flex-shrink: 0;
          background: linear-gradient(180deg, #131313, #0a0a0a); border-top: 1px solid ${C.border};
          box-shadow: 0 -6px 16px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .navbtn {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          background: none; border: none; color: ${C.grayDark}; padding: 6px 2px; border-radius: 12px; cursor: pointer;
          transition: all .15s ease;
        }
        .navbtn-icon { font-size: 18px; }
        .navbtn-label { font-size: 10.5px; font-weight: 700; }
        .navbtn-active {
          color: ${C.orange};
          background: linear-gradient(180deg, rgba(255,92,0,.2), rgba(255,92,0,.05));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 2px 8px rgba(255,92,0,.18);
        }

        /* ---- more sheet ---- */
        .sheet-backdrop {
          position: absolute; inset: 0; background: rgba(0,0,0,0); pointer-events: none;
          transition: background .25s ease; z-index: 20;
        }
        .sheet-backdrop.open { background: rgba(0,0,0,.6); pointer-events: auto; }
        .sheet {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 21;
          background: linear-gradient(180deg, #171717, #0c0c0c);
          border: 1px solid #2a2a2a; border-bottom: none;
          border-radius: 22px 22px 0 0;
          box-shadow: 0 -12px 34px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06);
          transform: translateY(105%);
          transition: transform .32s cubic-bezier(.32,.72,0,1);
          padding: 10px 14px calc(22px + env(safe-area-inset-bottom)); max-height: 74%; overflow-y: auto;
        }
        .sheet.open { transform: translateY(0); }
        .sheet-handle { width: 40px; height: 4px; border-radius: 2px; background: #3a3a3a; margin: 4px auto 14px; }
        .sheet-header {
          display: flex; justify-content: space-between; align-items: center; padding: 0 4px 12px;
          font-family: ${fontCond}; font-weight: 700; font-size: 19px; color: #fff;
        }
        .sheet-close {
          background: linear-gradient(180deg, #232323, #141414); border: 1px solid #333; color: #ccc;
          width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
          box-shadow: 0 3px 0 #050505, inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sheet-row {
          width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 6px;
          background: none; border: none; border-top: 1px solid #202020; cursor: pointer; text-align: left;
        }
        .sheet-row:first-of-type { border-top: none; }
        .sheet-row-icon {
          width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 19px; flex-shrink: 0;
          background: linear-gradient(180deg, #262626, #141414); box-shadow: 0 3px 0 #050505, inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sheet-row-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .sheet-row-title { font-size: 15px; font-weight: 700; color: #fff; }
        .sheet-row-desc { font-size: 12px; color: #8a8a8a; }
        .sheet-row-chev { color: #555; font-size: 18px; }
        .keeper-avatar {
          width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800; color: #fff; flex-shrink: 0;
          background: linear-gradient(180deg, #2a2a2a, #141414);
          box-shadow: 0 3px 0 #050505, inset 0 1px 0 rgba(255,255,255,.08);
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: 430, height: "100%", background: C.bg, color: C.white, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {screens[screen]}
        </div>
        {screen !== "welcome" && screen !== "login" && <NavBar active={activeTabFor(screen)} onNav={handleNav} />}
        {screen !== "welcome" && screen !== "login" && <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNav={go} />}
        {screen !== "welcome" && screen !== "login" && (
          <KeeperSheet
            open={keeperSheetOpen}
            onClose={() => setKeeperSheetOpen(false)}
            keepers={keepers}
            activeId={activeKeeperId}
            onSelect={selectKeeper}
            onAdd={addKeeper}
          />
        )}
        {screen !== "welcome" && screen !== "login" && <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />}
      </div>
    </div>
  );
}
