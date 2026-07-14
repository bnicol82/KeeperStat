import { useState, useEffect, useRef } from "react";
import { api, setUnauthorizedHandler } from "./api.js";
import { authClient, getAuthToken, setCachedAuthToken } from "./authClient.js";
import { createDemoApi } from "./demoApi.js";
import { parseScheduleText } from "./scheduleImport.js";
import { LEVELS, goalsPrevented, impactScoreFromStats, gde, toe, gmis } from "../shared/scoring.js";
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

// Each drill is tagged with the season stat it's meant to improve, so
// Training Recommendations can rank/focus on whichever category the
// keeper's own numbers say needs the most work, instead of a fixed order.
const drills = [
  { title: "Low Dive Reaction Drill", mins: 8, emoji: "🧤", category: "shotStopping", focusLabel: "Low Diving Saves", desc: "Rapid-fire low balls to alternate sides. Focus on collapse technique and quick recovery to set position." },
  { title: "Reaction Ball Saves", mins: 8, emoji: "🎾", category: "shotStopping", focusLabel: "Shot Stopping", desc: "Irregular-bounce reaction ball dropped from close range. Sharpens first-movement speed on shots you don't see cleanly." },
  { title: "Close Range Saves", mins: 10, emoji: "⚡", category: "composure", focusLabel: "Composure Under Pressure", desc: "Reaction saves from 6–8 yards. Trains hand speed and blocking shape under pressure." },
  { title: "1v1 Composure Reps", mins: 10, emoji: "🧠", category: "composure", focusLabel: "Composure Under Pressure", desc: "Breakaway reps against an advancing attacker. Builds patience and shot-blocking decisions instead of early commitment." },
  { title: "Angle & Positioning", mins: 12, emoji: "📐", category: "positioning", focusLabel: "Angle & Positioning", desc: "Cone-guided arc work. Learn to narrow shooting angles as the ball travels across the box." },
  { title: "Back-Post Cover Runs", mins: 10, emoji: "🏃", category: "positioning", focusLabel: "Angle & Positioning", desc: "Recovery runs to cover the far post on switched play. Trains reading the game to prevent easy tap-ins." },
  { title: "Distribution Under Pressure", mins: 10, emoji: "🎯", category: "distribution", focusLabel: "Distribution Accuracy", desc: "Throw and pass to moving targets with a defender closing down. Builds the next goal: 80% distribution accuracy." },
  { title: "Long Ball Accuracy", mins: 10, emoji: "🥾", category: "distribution", focusLabel: "Distribution Accuracy", desc: "Goal kicks and punts to a target zone. Builds range and consistency on longer distribution." },
];

// Weighs season-wide numbers against a reasonable target for each category
// and returns whichever one is furthest behind — that becomes the focus area.
const trainingFocusCategory = (matches) => {
  if (!matches.length) return null;
  const totalShots = matches.reduce((a, m) => a + m.shotsFaced, 0);
  const totalSaves = matches.reduce((a, m) => a + m.saves, 0);
  const savePct = totalShots ? (totalSaves / totalShots) * 100 : 0;
  const csRate = matches.filter((m) => m.ga === 0).length / matches.length;
  const errorsPerMatch = matches.reduce((a, m) => a + m.errors, 0) / matches.length;
  const totalDistAtt = matches.reduce((a, m) => a + m.distributionAttempted, 0);
  const totalDistComp = matches.reduce((a, m) => a + m.distributionCompleted, 0);
  const distPct = totalDistAtt ? (totalDistComp / totalDistAtt) * 100 : 0;

  const gaps = {
    shotStopping: Math.max(0, (68 - savePct) / 68),
    composure: Math.min(1, errorsPerMatch / 2),
    positioning: Math.max(0, (0.25 - csRate) / 0.25),
    distribution: Math.max(0, (75 - distPct) / 75),
  };
  return Object.entries(gaps).sort((a, b) => b[1] - a[1])[0][0];
};

const INTERVIEW_QUESTIONS = {
  Coach: [
    "What statistics influence your coaching decisions the most?",
    "How do you decide when a keeper is ready to move up a level?",
    "What does a keeper's body language tell you during a match?",
    "What's the one habit you wish every young keeper built early?",
  ],
  Parent: [
    "What did you notice about their effort or attitude today, regardless of the score?",
    "Was there a moment today you think they'll want to talk about on the ride home?",
    "How do they usually react to a tough goal against — what helps them reset?",
    "What's one thing you want to make sure they hear from you after this match?",
  ],
  Keeper: [
    "What's one save or moment from this match you're proud of?",
    "Was there a goal or chance you'd like to have back? What would you do differently?",
    "How did you feel with your teammates in front of you today — loud, quiet, in sync?",
    "What's one thing you want to work on before the next match?",
  ],
};

const MORE_ITEMS = [
  { key: "report", label: "Match Report", icon: "📋", desc: "Full breakdown of your last match" },
  { key: "training", label: "Training Plan", icon: "🏋️", desc: "Drills picked for your focus area" },
  { key: "development", label: "Keeper Development", icon: "🚀", desc: "Strengths, focus areas & next goal" },
  { key: "parent", label: "Parent View", icon: "⭐", desc: "A simple performance summary" },
  { key: "interview", label: "Interview & Feedback", icon: "🎙️", desc: "Reflection questions after matches" },
  { key: "rankings", label: "Team Rankings", icon: "🏆", desc: "Your profile on the rankings site" },
  { key: "keeperRankings", label: "KeeperStat Rankings", icon: "🥇", desc: "See how public profiles rank" },
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
  if (["report", "training", "development", "parent", "interview", "rankings", "keeperRankings", "settings"].includes(screen)) return "more";
  if (screen === "dashboard") return "dashboard";
  return screen; // tracker, stats, progress
};

// ---------- tiny UI atoms ----------
// The Header's left/right slots are always one of this small, fixed set of
// icon glyphs, so a lookup here covers every screen without threading a
// label prop through ~20 call sites.
const HEADER_ICON_LABELS = { "‹": "Back", "☰": "Switch keeper", "⚙": "Settings", "⇪": "Share" };

const Header = ({ title, left, right, onLeft, onRight }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px", flexShrink: 0 }}>
    <button onClick={onLeft} aria-label={HEADER_ICON_LABELS[left] || title} style={{ background: "none", border: "none", color: C.white, fontSize: 22, width: 36, textAlign: "left", cursor: "pointer", padding: 0 }}>
      {left}
    </button>
    <div style={{ fontFamily: fontCond, fontWeight: 600, fontSize: 20, letterSpacing: 0.3, color: C.white }}>{title}</div>
    {onRight ? (
      <button onClick={onRight} aria-label={HEADER_ICON_LABELS[right] || title} style={{ background: "none", border: "none", width: 36, textAlign: "right", color: C.white, fontSize: 18, cursor: "pointer", padding: 0 }}>{right || ""}</button>
    ) : (
      <div style={{ width: 36, textAlign: "right", color: C.white, fontSize: 18 }} aria-hidden="true">{right || ""}</div>
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
        <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
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

// ---------- share sheet (match report → text summary, copy / native share / shareable image) ----------
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

// ---- shareable PNG stat-card generation (Canvas 2D, no image libraries) ----
const SHARE_IMG_W = 1080;
const SHARE_IMG_H = 1080;

// Manual rounded-rect path — ctx.roundRect isn't universal on older iOS Safari.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Shrinks font size until `text` fits maxWidth (floors at minSize). Sets ctx.font
// as a side effect so the caller can draw immediately after calling this.
function fitTextSize(ctx, text, family, weight, maxWidth, maxSize, minSize) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px '${family}'`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

// Manual letter-spacing (canvas letterSpacing support is inconsistent on iOS
// Safari) — draws `text` centered at (cx, y) using the currently-set ctx.font.
function drawSpacedText(ctx, text, cx, y, spacing) {
  const chars = text.split("");
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

function slugify(str) {
  const s = str.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "match";
}

// Best-effort webfont readiness — the app's fonts load via a @import inside a
// <style> tag, so a canvas drawn too early could fall back to a default sans.
// Never throws and never blocks indefinitely if the Font Loading API is
// unsupported or a font fails to load.
async function ensureShareFontsReady() {
  try {
    if (!document.fonts) return;
    await Promise.all([
      document.fonts.load("800 100px 'Barlow Condensed'"),
      document.fonts.load("700 100px 'Barlow Condensed'"),
      document.fonts.load("600 40px 'Barlow'"),
    ]);
    if (document.fonts.ready) await document.fonts.ready;
  } catch {
    /* fall back to default sans-serif silently */
  }
}

// Fallback (and failure-recovery) path for browsers/desktops without
// navigator.share file support — triggers a normal browser download.
function triggerImageDownload(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Draws a shareable PNG "stat card" mirroring this sheet's preview Card, since
// once the image leaves the app (Messages, Instagram) there's no surrounding
// screen context — resolves to a PNG Blob (or null if canvas encoding fails).
async function buildShareImage({ keeperName, m, score, savePct }) {
  await ensureShareFontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_IMG_W;
  canvas.height = SHARE_IMG_H;
  const ctx = canvas.getContext("2d");
  const cx = SHARE_IMG_W / 2;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SHARE_IMG_W, SHARE_IMG_H);

  const M = 56, cardX = M, cardY = M, cardW = SHARE_IMG_W - 2 * M, cardH = SHARE_IMG_H - 2 * M, R = 40;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, R);
  const cardGrad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  cardGrad.addColorStop(0, "#181818");
  cardGrad.addColorStop(1, "#0f0f0f");
  ctx.fillStyle = cardGrad;
  ctx.fill();
  ctx.restore(); // reset shadow before further draws
  roundRectPath(ctx, cardX, cardY, cardW, cardH, R);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = "800 56px 'Barlow Condensed'";
  ctx.fillStyle = C.orange;
  ctx.fillText("🧤 KEEPERSTAT", cx, cardY + 100);

  ctx.font = "700 24px 'Barlow Condensed'";
  ctx.fillStyle = C.gray;
  drawSpacedText(ctx, "MATCH REPORT", cx, cardY + 150, 4);

  const vsText = `${keeperName} vs ${m.opp}`;
  const vsSize = fitTextSize(ctx, vsText, "Barlow", 600, cardW - 160, 38, 22);
  ctx.font = `600 ${vsSize}px 'Barlow'`;
  ctx.fillStyle = C.gray;
  ctx.fillText(vsText, cx, cardY + 240);

  const resultText = `${m.goalsScored}–${m.ga}`;
  ctx.font = "800 44px 'Barlow Condensed'";
  const pillTextWidth = ctx.measureText(resultText).width;
  const pillW = pillTextWidth + 90, pillH = 70;
  const pillX = cx - pillW / 2, pillY = cardY + 270;
  const isWin = m.res.startsWith("W"), isLoss = m.res.startsWith("L");
  const pillGrad = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
  if (isWin) { pillGrad.addColorStop(0, "#43a047"); pillGrad.addColorStop(1, C.greenMid); }
  else if (isLoss) { pillGrad.addColorStop(0, "#e57373"); pillGrad.addColorStop(1, C.red); }
  else { pillGrad.addColorStop(0, "#ffc14d"); pillGrad.addColorStop(1, C.gold); }
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.fillStyle = isWin || isLoss ? "#ffffff" : "#1a1200";
  ctx.fillText(resultText, cx, pillY + pillH / 2 + 15);

  ctx.font = "700 28px 'Barlow Condensed'";
  ctx.fillStyle = C.gold;
  drawSpacedText(ctx, "GK IMPACT SCORE", cx, cardY + 430, 3);

  ctx.font = "800 220px 'Barlow Condensed'";
  ctx.fillStyle = C.green;
  ctx.shadowColor = `${C.green}55`;
  ctx.shadowBlur = 30;
  ctx.fillText(String(score), cx, cardY + 660);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  ctx.font = "700 48px 'Barlow Condensed'";
  ctx.fillStyle = C.green;
  drawSpacedText(ctx, scoreWord(score), cx, cardY + 720, 3);

  const statsText = `${m.saves} saves · ${savePct}% save rate${m.ga === 0 ? " · Clean sheet" : ""}`;
  const statsSize = fitTextSize(ctx, statsText, "Barlow", 600, cardW - 160, 34, 20);
  ctx.font = `600 ${statsSize}px 'Barlow'`;
  ctx.fillStyle = C.gray;
  ctx.fillText(statsText, cx, cardY + 800);

  ctx.font = "500 22px 'Barlow'";
  ctx.fillStyle = C.grayDark;
  ctx.fillText("Track every save. — KeeperStat", cx, cardY + cardH - 40);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

const ShareSheet = ({ open, onClose, data }) => {
  const [copied, setCopied] = useState(false);
  const [imgState, setImgState] = useState("idle"); // idle | loading | ready | error
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareFileRef = useRef(null);
  const canNativeShareText = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Pre-generates the image the moment the sheet opens (rather than inside the
  // click handler) so the Share Image button's own click has no await before
  // navigator.share — iOS Safari silently rejects file shares that aren't
  // triggered close enough to the user gesture.
  useEffect(() => {
    let cancelled = false;
    if (!open || !data) {
      setImgState("idle");
      shareFileRef.current = null;
      return;
    }
    setImgState("loading");
    (async () => {
      try {
        const blob = await buildShareImage(data);
        if (cancelled) return;
        if (!blob) {
          setImgState("error");
          return;
        }
        const file = new File([blob], `keeperstat-vs-${slugify(data.m.opp)}.png`, { type: "image/png" });
        shareFileRef.current = file;
        setCanShareFiles(!!(navigator.canShare && navigator.canShare({ files: [file] })));
        setImgState("ready");
      } catch {
        if (!cancelled) setImgState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [open, data]);

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
  const handleShareImage = async () => {
    const file = shareFileRef.current;
    if (!file || sharing || imgState !== "ready") return;
    setSharing(true);
    try {
      if (canShareFiles) {
        await navigator.share({ files: [file], title: "KeeperStat Match Report", text: buildShareText(data) });
      } else {
        triggerImageDownload(file);
      }
    } catch (err) {
      if (err?.name !== "AbortError") triggerImageDownload(file);
    } finally {
      setSharing(false);
    }
  };

  const imageButtonLabel =
    imgState === "loading" ? "Preparing Image…" :
    imgState === "error" ? "Image Unavailable" :
    canShareFiles ? "Share Image" : "Download Image";

  return (
    <>
      <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sheet ${open ? "open" : ""}`}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span>Share Match Report</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
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
            <button
              onClick={handleShareImage}
              disabled={imgState !== "ready" || sharing}
              className="btn3d btn3d-orange"
              style={{ width: "100%", padding: 14, borderRadius: 14, fontFamily: fontCond, fontWeight: 700, fontSize: 15, letterSpacing: 1, opacity: imgState === "ready" ? 1 : 0.55 }}
            >
              {imageButtonLabel}
            </button>
            <button onClick={handleCopy} className="btn3d btn3d-outline" style={{ width: "100%", padding: 13, borderRadius: 12, marginTop: 10, fontWeight: 700, fontSize: 14 }}>
              {copied ? "Copied ✓" : "Copy Summary"}
            </button>
            {canNativeShareText && !canShareFiles && imgState !== "loading" && (
              <button onClick={handleNativeShare} className="btn3d btn3d-outline" style={{ width: "100%", padding: 13, borderRadius: 12, marginTop: 10, fontWeight: 700, fontSize: 14 }}>
                Share Text Only…
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
// LEVELS, goalsPrevented, impactScoreFromStats, gde, toe, and gmis now live
// in shared/scoring.js so the backend rankings endpoint computes the exact
// same score as the frontend, and so they're covered by shared/scoring.test.js.

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

// ---------- error toast (surfaces failed saves/loads that used to be silent) ----------
const ErrorToast = ({ message, onDismiss }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        position: "absolute", left: 12, right: 12, top: "calc(12px + env(safe-area-inset-top))", zIndex: 60,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 12px 14px", borderRadius: 14,
        background: "linear-gradient(180deg, #3a1414, #240d0d)", border: `1px solid ${C.red}66`,
        boxShadow: "0 10px 24px rgba(0,0,0,.5)",
      }}
    >
      <span style={{ fontSize: 17, flexShrink: 0 }}>⚠️</span>
      <span style={{ flex: 1, fontSize: 13.5, color: "#F4D9D9", lineHeight: 1.4 }}>{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#F4D9D9", fontSize: 15, cursor: "pointer", padding: 4, flexShrink: 0 }}>✕</button>
    </div>
  );
};

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
  const [mode, setMode] = useState("signin"); // signin | signup | verify | forgot | reset
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Better Auth surfaces an unverified-email sign-in attempt as an error
  // (code or message mentioning "verification") rather than a distinct
  // response shape, so this is the only reliable way to detect it and
  // route the user into the OTP verification screen instead of just
  // showing them a raw error string.
  const isUnverifiedError = (err) => /verif/i.test(err?.code || "") || /verif/i.test(err?.message || "");

  const startVerification = async (targetEmail) => {
    setEmail(targetEmail);
    setMode("verify");
    setError("");
    setInfo("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: targetEmail, type: "email-verification" });
      if (result?.error) setError(result.error.message || "Couldn't send a verification code. Try resending.");
      else setInfo(`Code sent to ${targetEmail}.`);
    } catch (err) {
      setError(err.message || "Couldn't send a verification code. Try resending.");
    }
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password });
      if (result?.error) {
        if (isUnverifiedError(result.error)) {
          await startVerification(email);
          return;
        }
        setError(result.error.message || "Something went wrong. Please try again.");
        return;
      }
      if (mode === "signup" && result?.data?.user?.emailVerified === false) {
        await startVerification(email);
        return;
      }
      // The session token is right here in the response body — no need to
      // ask Neon Auth for it again via a cookie-dependent call.
      const token = result?.data?.token ?? result?.data?.session?.token ?? null;
      setCachedAuthToken(token);
      onAuthenticated();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp });
      if (result?.error) {
        setError(result.error.message || "That code didn't work. Please try again.");
        return;
      }
      const token = result?.data?.token ?? result?.data?.session?.token ?? null;
      if (token) {
        setCachedAuthToken(token);
        onAuthenticated();
      } else {
        setInfo("Email verified — log in to continue.");
        setMode("signin");
        setOtp("");
      }
    } catch (err) {
      setError(err.message || "That code didn't work. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.forgetPassword.emailOtp({ email });
      if (result?.error) {
        setError(result.error.message || "Couldn't send a reset code. Please try again.");
        return;
      }
      setInfo(`Reset code sent to ${email}.`);
      setMode("reset");
    } catch (err) {
      setError(err.message || "Couldn't send a reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.emailOtp.resetPassword({ email, otp, password: newPassword });
      if (result?.error) {
        setError(result.error.message || "That code didn't work. Please try again.");
        return;
      }
      setInfo("Password reset. Log in with your new password.");
      setMode("signin");
      setPassword("");
      setOtp("");
      setNewPassword("");
    } catch (err) {
      setError(err.message || "That code didn't work. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const titles = { signin: "Log In", signup: "Create Account", verify: "Verify Your Email", forgot: "Reset Password", reset: "Reset Password" };
  const canSubmit = email.trim() && password.length >= 8 && !loading;
  const canSubmitVerify = otp.trim().length > 0 && !loading;
  const canSubmitForgot = email.trim() && !loading;
  const canSubmitReset = otp.trim().length > 0 && newPassword.length >= 8 && !loading;

  const field = (label, value, onChange, opts = {}) => (
    <>
      <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>{label}</div>
      <input
        type={opts.type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts.placeholder}
        className="input-well"
        style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: opts.last ? 0 : 12 }}
        onKeyDown={opts.onEnter ? (e) => { if (e.key === "Enter") opts.onEnter(); } : undefined}
      />
    </>
  );

  const backToSignin = () => { setMode("signin"); setError(""); setInfo(""); };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: C.bg }}>
      <Header title={titles[mode]} left="‹" onLeft={mode === "signin" || mode === "signup" ? onBack : backToSignin} />
      <div style={{ padding: "0 16px 16px", flex: 1, overflowY: "auto" }}>
        {(mode === "signin" || mode === "signup") && (
          <>
            <Card>
              {mode === "signup" && field("Name", name, setName, { placeholder: "Your name" })}
              {field("Email", email, setEmail, { type: "email", placeholder: "you@example.com" })}
              {field("Password", password, setPassword, { type: "password", placeholder: mode === "signup" ? "At least 8 characters" : "Password", last: true, onEnter: () => canSubmit && submit() })}
            </Card>
            {mode === "signin" && (
              <button
                onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}
                style={{ background: "none", border: "none", color: C.gray, fontSize: 12.5, fontWeight: 600, marginTop: 10, cursor: "pointer", padding: 0 }}
              >
                Forgot password?
              </button>
            )}
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
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
              style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}
            >
              {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
            </button>
          </>
        )}

        {mode === "verify" && (
          <>
            <Card>
              <div style={{ fontSize: 13.5, color: "#DADADA", lineHeight: 1.5, marginBottom: 12 }}>
                We sent a verification code to <strong style={{ color: C.white }}>{email}</strong>. Enter it below to confirm your email.
              </div>
              {field("Verification Code", otp, setOtp, { placeholder: "6-digit code", last: true, onEnter: () => canSubmitVerify && submitVerify() })}
            </Card>
            {info && <div style={{ color: C.green, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{info}</div>}
            {error && <div style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{error}</div>}
            <button
              onClick={submitVerify}
              disabled={!canSubmitVerify}
              className="btn3d btn3d-orange"
              style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: canSubmitVerify ? 1 : 0.5 }}
            >
              {loading ? "…" : "VERIFY EMAIL"}
            </button>
            <button
              onClick={() => startVerification(email)}
              disabled={loading}
              style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}
            >
              Resend code
            </button>
          </>
        )}

        {mode === "forgot" && (
          <>
            <Card>
              <div style={{ fontSize: 13.5, color: "#DADADA", lineHeight: 1.5, marginBottom: 12 }}>
                Enter your account email and we'll send you a code to reset your password.
              </div>
              {field("Email", email, setEmail, { type: "email", placeholder: "you@example.com", last: true, onEnter: () => canSubmitForgot && submitForgot() })}
            </Card>
            {error && <div style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{error}</div>}
            <button
              onClick={submitForgot}
              disabled={!canSubmitForgot}
              className="btn3d btn3d-orange"
              style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: canSubmitForgot ? 1 : 0.5 }}
            >
              {loading ? "…" : "SEND RESET CODE"}
            </button>
          </>
        )}

        {mode === "reset" && (
          <>
            <Card>
              <div style={{ fontSize: 13.5, color: "#DADADA", lineHeight: 1.5, marginBottom: 12 }}>
                Enter the code sent to <strong style={{ color: C.white }}>{email}</strong> and choose a new password.
              </div>
              {field("Reset Code", otp, setOtp, { placeholder: "6-digit code" })}
              {field("New Password", newPassword, setNewPassword, { type: "password", placeholder: "At least 8 characters", last: true, onEnter: () => canSubmitReset && submitReset() })}
            </Card>
            {info && <div style={{ color: C.green, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{info}</div>}
            {error && <div style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>{error}</div>}
            <button
              onClick={submitReset}
              disabled={!canSubmitReset}
              className="btn3d btn3d-orange"
              style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: canSubmitReset ? 1 : 0.5 }}
            >
              {loading ? "…" : "RESET PASSWORD"}
            </button>
            <button
              onClick={submitForgot}
              disabled={loading}
              style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}
            >
              Resend code
            </button>
          </>
        )}
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

const Tracker = ({ match, dispatch, go, activeKeeper, onOpenKeeperSwitch, matchStatus, onStartMatch, onEndMatch, onResumeMatch, onSaveMatch, savingMatch, onDiscardMatch, onNotesChange, baseline, fixtures }) => {
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
              maxLength={200}
              className="input-well"
              style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: nextFixture ? 6 : 12 }}
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
          {match.teamShotsOnGoal > 0 && (
            <div style={{ fontSize: 12.5, color: C.orange, fontWeight: 600, textAlign: "center", marginTop: 6 }}>
              🎯 {match.teamShotsOnGoal} Team Shot{match.teamShotsOnGoal > 1 ? "s" : ""} on Goal
            </div>
          )}
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8 }}>POST-MATCH NOTES</div>
            <textarea
              value={match.notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Sweeper actions, 1v1 duels, anything else worth remembering about this match…"
              maxLength={5000}
              className="input-well"
              style={{ width: "100%", minHeight: 70, padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", resize: "vertical" }}
            />
          </Card>
          <button
            onClick={onSaveMatch}
            disabled={savingMatch}
            className="btn3d btn3d-orange"
            style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: savingMatch ? 0.6 : 1 }}
          >
            {savingMatch ? "SAVING…" : "SAVE TO SEASON"}
          </button>
          <button onClick={onDiscardMatch} disabled={savingMatch} className="btn3d btn3d-outline" style={{ width: "100%", marginTop: 10, padding: 13, borderRadius: 12, color: C.red, fontWeight: 700, fontSize: 14, opacity: savingMatch ? 0.6 : 1 }}>
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
          <SmallActionButton icon="🎯" label="Team Shot on Goal" count={match.teamShotsOnGoal} color={C.orange} onClick={() => dispatch({ type: "teamShotOnGoal" })} />
        </div>

        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8 }}>MATCH NOTES</div>
          <textarea
            value={match.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Sweeper actions, 1v1 duels, anything else worth remembering about this match…"
            maxLength={5000}
            className="input-well"
            style={{ width: "100%", minHeight: 60, padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", resize: "vertical" }}
          />
        </Card>

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

  const distCompL = last5.reduce((a, m) => a + m.distributionCompleted, 0), distAttL = last5.reduce((a, m) => a + m.distributionAttempted, 0);
  const distCompP = prev5.reduce((a, m) => a + m.distributionCompleted, 0), distAttP = prev5.reduce((a, m) => a + m.distributionAttempted, 0);
  const distPctL = distAttL ? Math.round((distCompL / distAttL) * 100) : 0;
  const distPctP = distAttP ? Math.round((distCompP / distAttP) * 100) : 0;
  const errorsL = last5.reduce((a, m) => a + m.errors, 0), errorsP = prev5.reduce((a, m) => a + m.errors, 0);
  const handlingL = last5.reduce((a, m) => a + m.claims + m.punches, 0), handlingP = prev5.reduce((a, m) => a + m.claims + m.punches, 0);
  const clutchL = last5.reduce((a, m) => a + m.bigSaves + m.penaltySaves, 0), clutchP = prev5.reduce((a, m) => a + m.bigSaves + m.penaltySaves, 0);

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
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {cell("Distribution %", `${distPctL}%`, hasPrev ? trendDelta(distPctL, distPctP, "%") : { text: "—", color: C.grayDark })}
          {cell("Errors", errorsL, hasPrev ? trendDelta(errorsL, errorsP, "", false) : { text: "—", color: C.grayDark })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {cell("Claims + Punches", handlingL, hasPrev ? trendDelta(handlingL, handlingP, "", true, true) : { text: "—", color: C.grayDark })}
          {cell("Big + Penalty Saves", clutchL, hasPrev ? trendDelta(clutchL, clutchP, "", true, true) : { text: "—", color: C.grayDark })}
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
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: 1, marginBottom: 8 }}>FOCUS AREA</div>
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
  const savePct = m.shotsFaced ? Math.round((m.saves / m.shotsFaced) * 100) : 0;
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
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, letterSpacing: 0.5, marginBottom: 10 }}>GOALKEEPER ACTIONS</div>
          <div style={{ display: "flex", gap: 8 }}>
            {cellBox("Distribution", `${m.distributionCompleted}/${m.distributionAttempted}`)}{cellBox("Claims", m.claims)}{cellBox("Punches", m.punches)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {cellBox("Penalty Saves", m.penaltySaves)}{cellBox("Big Saves", m.bigSaves)}{cellBox("Errors", m.errors)}
          </div>
        </Card>
        {m.notes && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8 }}>MATCH NOTES</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: "#DADADA", whiteSpace: "pre-wrap" }}>{m.notes}</div>
          </Card>
        )}
        {showGMIS && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, letterSpacing: 0.5, marginBottom: 10 }}>MATCH CONTEXT</div>
            {gmisVal === null ? (
              <div style={{ fontSize: 13.5, color: C.grayDark, lineHeight: 1.55 }}>
                {gdeVal === null
                  ? `${activeKeeper.name} didn't face any shots this match, so there's no defensive efficiency to compare against the attack.`
                  : "Team shot data wasn't tracked for this match, so keeper-vs-attack context isn't available. Log Team Shots on Goal from the live tracker to unlock this next time."}
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
  const totalDistComp = scored.reduce((a, m) => a + m.distributionCompleted, 0);
  const totalDistAtt = scored.reduce((a, m) => a + m.distributionAttempted, 0);
  const distPct = totalDistAtt ? Math.round((totalDistComp / totalDistAtt) * 100) : 0;
  const totalClaims = scored.reduce((a, m) => a + m.claims, 0);
  const totalPunches = scored.reduce((a, m) => a + m.punches, 0);
  const totalPenaltySaves = scored.reduce((a, m) => a + m.penaltySaves, 0);
  const totalBigSaves = scored.reduce((a, m) => a + m.bigSaves, 0);
  const totalErrors = scored.reduce((a, m) => a + m.errors, 0);
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
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginBottom: 10 }}>Season Goalkeeper Actions</div>
          <div style={{ display: "flex", gap: 8 }}>
            {cellBox("Distribution", `${distPct}%`)}{cellBox("Claims", totalClaims)}{cellBox("Punches", totalPunches)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {cellBox("Penalty Saves", totalPenaltySaves)}{cellBox("Big Saves", totalBigSaves)}{cellBox("Errors", totalErrors)}
          </div>
        </Card>
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
const Training = ({ go, matches }) => {
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const focusCategory = trainingFocusCategory(matches);
  const ranked = focusCategory
    ? [...drills].sort((a, b) => (a.category === focusCategory) === (b.category === focusCategory) ? 0 : a.category === focusCategory ? -1 : 1)
    : drills;
  const visible = showAll ? ranked : ranked.slice(0, 3);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Training Recommendations" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card>
          <div style={{ fontSize: 13.5, color: C.gray, fontWeight: 600 }}>{focusCategory ? "Based on your performance" : "Get started"}</div>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.gold, marginTop: 4 }}>
            {focusCategory ? `Focus: ${ranked[0].focusLabel}` : "Track a match to unlock a personalized focus area"}
          </div>
        </Card>
        {visible.map((d) => (
          <Card key={d.title} style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
            <button onClick={() => setOpen(open === d.title ? null : d.title)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, background: "none", border: "none", cursor: "pointer" }}>
              <div className="drill-thumb">{d.emoji}</div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{d.title}</div>
                <div style={{ fontSize: 12.5, color: C.grayDark }}>{d.mins} min</div>
              </div>
              <div className="play-chip">▶</div>
            </button>
            {open === d.title && <div style={{ padding: "0 14px 14px", fontSize: 13.5, lineHeight: 1.5, color: "#C9C9C9" }}>{d.desc}</div>}
          </Card>
        ))}
        {!showAll && (
          <button onClick={() => setShowAll(true)} className="btn3d btn3d-orange" style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 26, fontFamily: fontCond, fontWeight: 700, fontSize: 17, letterSpacing: 1.5 }}>
            VIEW ALL DRILLS
          </button>
        )}
      </div>
    </div>
  );
};

// ---------- 10. Interview & Feedback ----------
const Interview = ({ go, answers, onSaveAnswer, activeKeeper }) => {
  const [tab, setTab] = useState("Coach");
  const [q, setQ] = useState(0);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);
  const key = `${tab}-${q}`;
  const questions = INTERVIEW_QUESTIONS[tab];

  // The persisted value is the source of truth; `draft` just tracks in-progress
  // edits to the current question so typing doesn't fire a save on every keystroke.
  useEffect(() => { setDraft(answers[key] || ""); }, [key, answers[key]]);

  const commit = () => {
    if (draft !== (answers[key] || "")) onSaveAnswer(tab, q, draft);
  };
  const next = () => {
    commit();
    if (q < questions.length - 1) setQ(q + 1); else setDone(true);
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Interview & Feedback" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div className="tab-track">
          {["Coach", "Parent", "Keeper"].map((t) => (
            <button key={t} onClick={() => { commit(); setTab(t); setQ(0); setDone(false); }} className={`tab-pill ${tab === t ? "tab-pill-active" : ""}`}>
              {t}
            </button>
          ))}
        </div>
        {!done ? (
          <Card style={{ marginTop: 14, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{tab} Questions</span>
              <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>{q + 1} / {questions.length}</span>
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 600, color: C.white, lineHeight: 1.45, margin: "12px 0" }}>{questions[q]}</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              placeholder="Type your answer..."
              maxLength={5000}
              className="input-well"
              style={{ flex: 1, minHeight: 140, resize: "none", padding: 12, color: C.white, fontSize: 16, fontFamily: font, outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <button onClick={next} className="btn3d btn3d-orange" style={{ flex: 1, padding: 14, borderRadius: 24, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1.5 }}>NEXT</button>
              <button onClick={next} style={{ background: "none", border: "none", color: C.gray, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>SKIP</button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 14 }}>
              {questions.map((_, i) => (
                <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === q ? C.orange : "#3A3A3A", boxShadow: i === q ? `0 0 8px ${C.orange}88` : "none" }} />
              ))}
            </div>
          </Card>
        ) : (
          <Card style={{ marginTop: 14, textAlign: "center", padding: "34px 20px" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontFamily: fontCond, fontSize: 22, fontWeight: 800, color: C.white, marginTop: 8 }}>FEEDBACK SUBMITTED</div>
            <div style={{ fontSize: 14, color: C.gray, marginTop: 6 }}>Saved to {activeKeeper.name}'s profile — revisit and update these anytime.</div>
            <button onClick={() => { setQ(0); setDone(false); }} className="btn3d btn3d-outline" style={{ marginTop: 18, padding: "12px 26px", borderRadius: 22, color: C.orange, fontWeight: 700, fontSize: 14 }}>Review answers</button>
          </Card>
        )}
      </div>
    </div>
  );
};

// ---------- 11. Team Rankings (external site link) ----------
const Rankings = ({ go, activeKeeper }) => {
  const url = activeKeeper.rankingsUrl;
  const openRankings = () => window.open(url, "_blank", "noopener,noreferrer");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Team Rankings" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        {!url ? (
          <EmptyState
            icon="🏆"
            title="No rankings link set yet"
            sub={`Paste ${activeKeeper.name}'s profile link from usasportstatistics.net (or a similar site) in Settings to see it here.`}
            cta="Go to Settings"
            onCta={() => go("settings")}
          />
        ) : (
          <>
            <Card style={{ textAlign: "center", padding: "28px 20px" }}>
              <div style={{ fontSize: 40 }}>🏆</div>
              <div style={{ fontFamily: fontCond, fontSize: 19, fontWeight: 800, color: C.white, marginTop: 10 }}>{activeKeeper.name}'s Rankings Profile</div>
              <div style={{ fontSize: 12.5, color: C.grayDark, marginTop: 6, wordBreak: "break-all" }}>{url}</div>
            </Card>
            <button onClick={openRankings} className="btn3d btn3d-orange" style={{ width: "100%", marginTop: 16, padding: 15, borderRadius: 16, fontFamily: fontCond, fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
              OPEN RANKINGS PROFILE ↗
            </button>
            <button
              onClick={() => go("settings")}
              style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 600, marginTop: 14, cursor: "pointer" }}
            >
              Change link
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------- 12. KeeperStat Rankings (in-app public leaderboard) ----------
const RankingRow = ({ rank, entry, isYou }) => (
  <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", marginBottom: 8, border: isYou ? `1.5px solid ${C.orange}88` : undefined }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div style={{ width: 28, textAlign: "center", fontFamily: fontCond, fontSize: 17, fontWeight: 800, color: rank <= 3 ? C.gold : C.grayDark, flexShrink: 0 }}>
        {rank}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.displayName}{isYou && <span style={{ color: C.orange }}> · You</span>}
        </div>
        <div style={{ fontSize: 11.5, color: C.grayDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.team} · {LEVELS[entry.level]?.short || entry.level}
        </div>
      </div>
    </div>
    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
      <div style={{ fontFamily: fontCond, fontSize: 22, fontWeight: 800, color: entry.avgScore >= 70 ? C.green : entry.avgScore >= 55 ? C.gold : C.red }}>{entry.avgScore}</div>
      <div style={{ fontSize: 10.5, color: C.grayDark }}>{entry.matchesPlayed} matches</div>
    </div>
  </Card>
);

const KeeperStatRankings = ({ go, mode, rankings, rankingsLoading, activeKeeper }) => {
  if (mode === "demo") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="KeeperStat Rankings" left="‹" onLeft={() => go("dashboard")} />
        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <EmptyState
            icon="🥇"
            title="Sign in to see rankings"
            sub="KeeperStat Rankings compares public keeper profiles across every signed-in account. Log in or create an account to view it."
            cta="Log In"
            onCta={() => go("login")}
          />
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="KeeperStat Rankings" left="‹" onLeft={() => go("dashboard")} />
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: C.grayDark, lineHeight: 1.5 }}>
            Ranked by season avg. GK Impact Score, minimum 3 tracked matches. Make your own profile public from Settings to join the board.
          </div>
        </Card>
        {rankingsLoading ? (
          <div style={{ textAlign: "center", color: C.gray, padding: "30px 0" }}>Loading…</div>
        ) : rankings.length === 0 ? (
          <EmptyState icon="🥇" title="No public rankings yet" sub="Once keepers make their profile public in Settings and log at least 3 matches, they'll show up here." />
        ) : (
          rankings.map((entry, i) => (
            <RankingRow key={entry.id} rank={i + 1} entry={entry} isYou={entry.id === activeKeeper?.id} />
          ))
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
        <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
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
        style={{ width: "100%", minHeight: 76, padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", resize: "vertical", marginBottom: 10 }}
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
              <button onClick={() => onDelete(f.id)} aria-label={`Delete ${f.opponent}`} style={{ background: "none", border: "none", color: C.red, fontSize: 18, fontWeight: 700, cursor: "pointer", padding: 4 }}>
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
        {...(type === "number" ? { min: 0, max: 500 } : { maxLength: 200 })}
        style={{ width: "100%", padding: "8px 10px", color: C.white, fontSize: 16, fontFamily: font, outline: "none" }}
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
      <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: 1, margin: "10px 0 8px" }}>ADDITIONAL STATS</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("Distribution Completed", "distributionCompleted", "number")}
        {field("Distribution Attempted", "distributionAttempted", "number")}
        {field("Claims", "claims", "number")}
        {field("Punches", "punches", "number")}
        {field("Penalty Saves", "penaltySaves", "number")}
        {field("Big Saves", "bigSaves", "number")}
        {field("Errors", "errors", "number")}
      </div>
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Notes</div>
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Sweeper actions, 1v1 duels, anything else worth remembering about this match…"
          maxLength={5000}
          className="input-well"
          style={{ width: "100%", minHeight: 70, padding: "8px 10px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", resize: "vertical" }}
        />
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
  go, keepers, activeKeeper, updateActiveKeeper, selectKeeper, addKeeper, onDeleteKeeper, showGMIS, setShowGMIS, notifPrefs, setNotifPrefs,
  matches, onUpdateMatch, onDeleteMatch, fixtures, onImportSchedule, onDeleteFixture, onLogout, onUploadPhoto, onError,
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
      onError("Couldn't upload that photo. Please try again.");
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
          <div key={k.id} className="sheet-row" style={{ padding: "10px 14px" }}>
            <button onClick={() => selectKeeper(k.id)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
              <Avatar keeper={k} />
              <span className="sheet-row-text">
                <span className="sheet-row-title">{k.name}</span>
                <span className="sheet-row-desc">{k.team}</span>
              </span>
              {k.id === activeKeeper.id && <span style={{ color: C.orange, fontSize: 17, fontWeight: 700 }}>✓</span>}
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${k.name}? This permanently removes their matches and schedule. This can't be undone.`)) onDeleteKeeper(k.id);
              }}
              aria-label={`Delete ${k.name}`}
              style={{ background: "none", border: "none", color: C.red, fontSize: 17, cursor: "pointer", padding: "4px 2px 4px 8px", flexShrink: 0 }}
            >
              🗑
            </button>
          </div>
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
            aria-label="Upload photo"
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
          maxLength={200}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: 12 }}
        />
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Team</div>
        <input
          value={activeKeeper.team}
          onChange={(e) => updateActiveKeeper({ team: e.target.value })}
          maxLength={200}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: 12 }}
        />
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Soccer Rankings Profile</div>
        <input
          value={activeKeeper.rankingsUrl || ""}
          onChange={(e) => updateActiveKeeper({ rankingsUrl: e.target.value })}
          placeholder="https://usasportstatistics.net/..."
          maxLength={2000}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: 6 }}
        />
        <div style={{ fontSize: 12, color: C.grayDark, lineHeight: 1.4 }}>
          Paste your profile link from usasportstatistics.net (or a similar site). It'll show up under Team Rankings.
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>DEVELOPMENT</div>
        <div style={{ fontSize: 12.5, color: C.grayDark, lineHeight: 1.5, marginBottom: 12 }}>
          Shown on the Keeper Development screen. Set this yourself, together with a coach, or leave it blank.
        </div>
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Focus Area Title</div>
        <input
          value={activeKeeper.focusArea?.title || ""}
          onChange={(e) => {
            const title = e.target.value;
            // The backend requires a title whenever focusArea is non-null, so
            // clearing the title entirely clears the whole focus area instead
            // of sending an invalid half-empty object.
            updateActiveKeeper({ focusArea: title.trim() ? { title, note: activeKeeper.focusArea?.note || "" } : null });
          }}
          placeholder="e.g. Low Diving Saves"
          maxLength={200}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: 12 }}
        />
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Focus Area Note</div>
        <input
          value={activeKeeper.focusArea?.note || ""}
          onChange={(e) => updateActiveKeeper({ focusArea: { title: activeKeeper.focusArea.title, note: e.target.value } })}
          disabled={!activeKeeper.focusArea?.title}
          placeholder={activeKeeper.focusArea?.title ? "e.g. Work on technique and explosiveness" : "Add a title first"}
          maxLength={1000}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none", marginBottom: 12, opacity: activeKeeper.focusArea?.title ? 1 : 0.5 }}
        />
        <div style={{ fontSize: 11, color: C.grayDark, marginBottom: 4 }}>Next Goal</div>
        <input
          value={activeKeeper.nextGoal || ""}
          onChange={(e) => updateActiveKeeper({ nextGoal: e.target.value })}
          placeholder="e.g. Increase distribution accuracy above 80%"
          maxLength={500}
          className="input-well"
          style={{ width: "100%", padding: "10px 12px", color: C.white, fontSize: 16, fontFamily: font, outline: "none" }}
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
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 4 }}>PRIVACY</div>
        <div className="settings-row" style={{ borderTop: "none" }}>
          <div>
            <div className="settings-row-label">Show on KeeperStat Rankings</div>
            <div className="settings-row-desc">Public profiles appear on the in-app leaderboard as first name + last initial and team (no photo). Off by default.</div>
          </div>
          <Toggle on={!!activeKeeper.isPublic} onChange={(v) => updateActiveKeeper({ isPublic: v })} />
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
  penaltySaves: 0, bigSaves: 0, errors: 0, notes: "", teamShotsOnGoal: 0,
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
  const [errorMessage, setErrorMessage] = useState(null);
  const [savingMatch, setSavingMatch] = useState(false);
  const savingMatchRef = useRef(false);

  // Surfaces a failed save/load that would otherwise only hit the console —
  // auto-dismisses so a stale error doesn't linger once the user's moved on.
  const showError = (message) => setErrorMessage(message);
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(t);
  }, [errorMessage]);

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
  const [interviewByKeeper, setInterviewByKeeper] = useState({});
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Resume an existing real session on reload, so logging in sticks. This is
  // a plain localStorage read — no network round trip, so nothing here can
  // be silently dropped by iOS Safari's cross-site cookie blocking. If the
  // cached token has actually expired, the first API call below 401s and
  // setUnauthorizedHandler (registered further down) drops us back to
  // Welcome instead of getting stuck.
  useEffect(() => {
    if (getAuthToken()) {
      setMode("auth");
      go("dashboard");
    }
  }, []);

  // No dependency array: re-registers every render so the closure always
  // sees the current `mode`, rather than whatever it was at mount.
  useEffect(() => {
    setUnauthorizedHandler(() => handleLogout());
  });

  // Belt-and-suspenders for the iOS on-screen keyboard: index.html already
  // shrinks .app-shell to the real visible viewport so the bottom nav ends
  // up above the keyboard rather than under it, but that resize can lag
  // slightly behind the keyboard's own animation, during which the browser's
  // default "scroll focused field into view" can run against the pre-resize
  // layout and leave the field positioned behind the nav bar. Explicitly
  // re-scrolling the focused field into view shortly after focus (once the
  // keyboard/viewport has had time to settle) corrects that.
  useEffect(() => {
    const handleFocusIn = (e) => {
      const el = e.target;
      if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
      setTimeout(() => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
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
          const [ms, fx, iv] = await Promise.all([currentApi.listMatches(firstId), currentApi.listFixtures(firstId), currentApi.listInterviewResponses(firstId)]);
          if (cancelled) return;
          setMatchesByKeeper({ [firstId]: ms });
          setFixturesByKeeper({ [firstId]: fx });
          setInterviewByKeeper({ [firstId]: iv });
        } else {
          setActiveKeeperId(null);
          setMatchesByKeeper({});
          setFixturesByKeeper({});
          setInterviewByKeeper({});
        }
      } catch (err) {
        console.error("Failed to load keepers", err);
        showError("Couldn't load your keeper profiles. Check your connection and try again.");
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
    setInterviewByKeeper({});
    go("welcome");
  };

  const activeKeeper = keepers.find((k) => k.id === activeKeeperId) || keepers[0];
  const matches = matchesByKeeper[activeKeeperId] || [];
  const fixtures = fixturesByKeeper[activeKeeperId] || [];
  const interviewResponses = interviewByKeeper[activeKeeperId] || [];
  const interviewAnswers = Object.fromEntries(interviewResponses.map((r) => [`${r.tab}-${r.questionIndex}`, r.answer]));
  const baseline = activeKeeper ? LEVELS[activeKeeper.level].baseline : null;

  const updateActiveKeeper = (patch) => {
    setKeepers((ks) => ks.map((k) => (k.id === activeKeeperId ? { ...k, ...patch } : k)));
    dataApi.updateKeeper(activeKeeperId, patch).catch((err) => {
      console.error("Failed to save keeper", err);
      showError("Couldn't save that change. Check your connection and try again.");
    });
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
        setInterviewByKeeper((ib) => ({ ...ib, [keeper.id]: [] }));
        setActiveKeeperId(keeper.id);
        setKeeperSheetOpen(false);
      })
      .catch((err) => {
        console.error("Failed to create keeper", err);
        showError("Couldn't create the new keeper profile. Please try again.");
      });
  };
  const selectKeeper = (id) => {
    setActiveKeeperId(id);
    setKeeperSheetOpen(false);
    if (!matchesByKeeper[id]) {
      dataApi.listMatches(id)
        .then((ms) => setMatchesByKeeper((mb) => ({ ...mb, [id]: ms })))
        .catch((err) => {
          console.error("Failed to load matches", err);
          showError("Couldn't load matches for this keeper.");
        });
    }
    if (!fixturesByKeeper[id]) {
      dataApi.listFixtures(id)
        .then((fx) => setFixturesByKeeper((fb) => ({ ...fb, [id]: fx })))
        .catch((err) => {
          console.error("Failed to load fixtures", err);
          showError("Couldn't load the schedule for this keeper.");
        });
    }
    if (!interviewByKeeper[id]) {
      dataApi.listInterviewResponses(id)
        .then((iv) => setInterviewByKeeper((ib) => ({ ...ib, [id]: iv })))
        .catch((err) => {
          console.error("Failed to load interview responses", err);
          showError("Couldn't load interview answers for this keeper.");
        });
    }
  };
  const deleteKeeper = (id) => {
    dataApi.deleteKeeper(id)
      .then(() => {
        setKeepers((ks) => {
          const next = ks.filter((k) => k.id !== id);
          if (activeKeeperId === id) setActiveKeeperId(next[0]?.id ?? null);
          return next;
        });
        setMatchesByKeeper((mb) => { const next = { ...mb }; delete next[id]; return next; });
        setFixturesByKeeper((fb) => { const next = { ...fb }; delete next[id]; return next; });
        setInterviewByKeeper((ib) => { const next = { ...ib }; delete next[id]; return next; });
      })
      .catch((err) => {
        console.error("Failed to delete keeper", err);
        showError("Couldn't delete that keeper profile. Please try again.");
      });
  };
  const saveInterviewAnswer = (tab, questionIndex, answer) => {
    const keeperId = activeKeeperId;
    setInterviewByKeeper((ib) => {
      const existing = (ib[keeperId] || []).filter((r) => !(r.tab === tab && r.questionIndex === questionIndex));
      return { ...ib, [keeperId]: [...existing, { tab, questionIndex, answer }] };
    });
    dataApi.saveInterviewResponse(keeperId, { tab, questionIndex, answer }).catch((err) => {
      console.error("Failed to save interview answer", err);
      showError("Couldn't save your answer. Please try again.");
    });
  };

  const importFixtures = (items) => {
    dataApi.importFixtures(activeKeeperId, items)
      .then((created) => {
        setFixturesByKeeper((fb) => ({
          ...fb,
          [activeKeeperId]: [...(fb[activeKeeperId] || []), ...created].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
        }));
      })
      .catch((err) => {
        console.error("Failed to import schedule", err);
        showError("Couldn't import the schedule. Please try again.");
      });
  };
  const deleteFixture = (fixtureId) => {
    setFixturesByKeeper((fb) => ({ ...fb, [activeKeeperId]: (fb[activeKeeperId] || []).filter((f) => f.id !== fixtureId) }));
    dataApi.deleteFixture(activeKeeperId, fixtureId).catch((err) => {
      console.error("Failed to delete fixture", err);
      showError("Couldn't delete that match from the schedule.");
    });
  };
  const updateMatch = (matchId, patch) => {
    setMatchesByKeeper((mb) => ({
      ...mb,
      [activeKeeperId]: (mb[activeKeeperId] || []).map((m) => (m.id === matchId ? { ...m, ...patch } : m)),
    }));
    dataApi.updateMatch(activeKeeperId, matchId, patch).catch((err) => {
      console.error("Failed to update match", err);
      showError("Couldn't save your changes to that match.");
    });
  };
  const deleteMatch = (matchId) => {
    setMatchesByKeeper((mb) => ({ ...mb, [activeKeeperId]: (mb[activeKeeperId] || []).filter((m) => m.id !== matchId) }));
    dataApi.deleteMatch(activeKeeperId, matchId).catch((err) => {
      console.error("Failed to delete match", err);
      showError("Couldn't delete that match.");
    });
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
    // A ref (not the savingMatch state) guards re-entry: two rapid clicks are
    // dispatched synchronously in the same tick, before React re-renders with
    // the button disabled, so a state check here would still read stale
    // "false" for both and let a double-tap create a duplicate match.
    if (savingMatchRef.current) return;
    savingMatchRef.current = true;
    setSavingMatch(true);
    const faced = Math.max(match.shotsFaced, match.saves + match.goalsAgainst);
    const [mm] = match.clock.split(":").map(Number);
    const payload = {
      opp: match.opponent || "Unknown Opponent",
      saves: match.saves,
      shotsFaced: faced,
      ga: match.goalsAgainst,
      res: `${match.ourGoals > match.goalsAgainst ? "W" : match.ourGoals < match.goalsAgainst ? "L" : "D"} ${match.ourGoals}-${match.goalsAgainst}`,
      goalsScored: match.ourGoals,
      teamShotsOnGoal: match.teamShotsOnGoal,
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
        savingMatchRef.current = false;
        setSavingMatch(false);
        go("report", record.n);
      })
      .catch((err) => {
        console.error("Failed to save match", err);
        showError("Couldn't save this match. Please try again.");
        savingMatchRef.current = false;
        setSavingMatch(false);
      });
  };

  const dispatch = (a) => {
    setMatch((m) => {
      if (a.type === "save") return { ...m, saves: m.saves + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "save", label: "Save" }] };
      if (a.type === "goal") return { ...m, goalsAgainst: m.goalsAgainst + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "goal", label: "Goal Against" }] };
      if (a.type === "goalFor") return { ...m, ourGoals: m.ourGoals + 1, teamShotsOnGoal: m.teamShotsOnGoal + 1, log: [...m.log, { t: "goalFor", label: "Goal For" }] };
      if (a.type === "teamShotOnGoal") return { ...m, teamShotsOnGoal: m.teamShotsOnGoal + 1, log: [...m.log, { t: "teamShotOnGoal", label: "Team Shot on Goal" }] };
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
        if (last.t === "goalFor") return { ...m, ourGoals: m.ourGoals - 1, teamShotsOnGoal: m.teamShotsOnGoal - 1, log };
        if (last.t === "teamShotOnGoal") return { ...m, teamShotsOnGoal: m.teamShotsOnGoal - 1, log };
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

  const loadRankings = () => {
    setRankingsLoading(true);
    api.listRankings()
      .then(setRankings)
      .catch((err) => {
        console.error("Failed to load rankings", err);
        showError("Couldn't load the rankings leaderboard.");
        setRankings([]);
      })
      .finally(() => setRankingsLoading(false));
  };

  const go = (s, matchId) => {
    setScreen(s);
    setMoreOpen(false);
    if (s === "report") setSelectedMatchId(matchId || (matches.length ? matches[matches.length - 1].n : null));
    if (s === "keeperRankings" && mode === "auth") loadRankings();
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
        onSaveMatch={saveMatchToHistory} savingMatch={savingMatch} onDiscardMatch={discardMatch}
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
    training: <Training go={go} matches={matches} />,
    interview: <Interview go={go} answers={interviewAnswers} onSaveAnswer={saveInterviewAnswer} activeKeeper={activeKeeper} />,
    rankings: <Rankings go={go} activeKeeper={activeKeeper} />,
    keeperRankings: <KeeperStatRankings go={go} mode={mode} rankings={rankings} rankingsLoading={rankingsLoading} activeKeeper={activeKeeper} />,
    settings: (
      <Settings
        go={go}
        keepers={keepers}
        activeKeeper={activeKeeper}
        updateActiveKeeper={updateActiveKeeper}
        selectKeeper={selectKeeper}
        addKeeper={addKeeper}
        onDeleteKeeper={deleteKeeper}
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
        onError={showError}
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
          /* iOS Safari auto-zooms the page on focus for any input/textarea
             with a computed font-size under 16px — keep this at or above
             16px (inline fontSize on each input does too) so focusing a
             field never triggers that zoom. */
          font-size: 16px;
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
          /* translateY(105%) is relative to the sheet's OWN height, which only
             reliably clears the screen if the positioned ancestor is exactly
             viewport-tall. When it's shorter (e.g. a stale --app-height before
             a resize settles), a short sheet's "closed" position can still
             land inside the visible viewport. visibility/pointer-events give
             a transform-independent guarantee that a closed sheet is neither
             seen nor clickable regardless of container sizing — the delay on
             visibility (only applied while closed) lets the slide-out
             animation finish before it disappears. */
          visibility: hidden;
          pointer-events: none;
          transition: transform .32s cubic-bezier(.32,.72,0,1), visibility 0s linear .32s;
          padding: 10px 14px calc(22px + env(safe-area-inset-bottom)); max-height: 74%; overflow-y: auto;
        }
        .sheet.open {
          transform: translateY(0);
          visibility: visible;
          pointer-events: auto;
          transition: transform .32s cubic-bezier(.32,.72,0,1), visibility 0s linear 0s;
        }
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
        <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      </div>
    </div>
  );
}
