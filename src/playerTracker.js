// Live player/ball tracking for the Record Film overlay. Detection uses
// TensorFlow.js's pretrained COCO-SSD model (free, runs entirely on-device,
// no API keys or server costs) to find "person" and "sports ball" boxes in
// each video frame — it has no idea which person is the keeper or which
// team is which, so that distinction is made here from jersey color, using
// a short one-time calibration (the user taps the keeper/a teammate/an
// opponent once) rather than guessing, since a wrong-looking auto-classified
// color would be worse than asking for one tap each.
//
// TensorFlow + the COCO-SSD weights are only pulled in when recording
// actually starts (see loadDetector's dynamic import), so the ~keeper stat
// tracking dependency doesn't add to the bundle every other screen loads.

export const ROLE_COLORS = {
  keeper: "#F5A623", // gold — matches the app's existing gold accent
  team: "#1565D8", // blue — matches the app's existing blue accent
  opponent: "#D32F2F", // red — matches the app's existing red accent
  unknown: "#9E9E9E", // gray — detected person, not yet classified
  ball: "#FFFFFF",
};

export function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// refs: { keeper: [r,g,b]|null, team: [r,g,b]|null, opponent: [r,g,b]|null }.
// Any ref left null (not calibrated) is simply never matched. A detected
// jersey color that isn't close to any calibrated reference comes back
// "unknown" rather than being forced into the nearest bucket — a person in
// an unrelated color (referee, substitute) shouldn't get mislabeled as a
// team just because it's the "least far" option.
export function classifyPerson(color, refs, threshold = 90) {
  if (!color) return "unknown";
  let best = "unknown";
  let bestDist = threshold;
  for (const role of ["keeper", "team", "opponent"]) {
    const ref = refs[role];
    if (!ref) continue;
    const d = colorDistance(color, ref);
    if (d < bestDist) {
      bestDist = d;
      best = role;
    }
  }
  return best;
}

// Averages pixel color within a rectangular region of a 2D context, or null
// if the region can't be read (out of bounds, tainted canvas, etc).
function averageColorInRegion(ctx, x, y, width, height) {
  let data;
  try {
    ({ data } = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))));
  } catch {
    return null;
  }
  if (!data || !data.length) return null;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (!count) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

// Averages pixel color within the upper-third of a bounding box (roughly
// the torso/jersey, avoiding the head and legs) so jersey color dominates
// the sample over skin tone, hair, shorts, or the pitch behind the player.
export function sampleTorsoColor(ctx, box) {
  const [x, y, width, height] = box;
  return averageColorInRegion(ctx, x + width * 0.25, y + height * 0.2, width * 0.5, height * 0.25);
}

// Averages a small square region centered on a single point — used when the
// user taps a specific player during tracking calibration, rather than
// sampling relative to a detected bounding box.
export function sampleColorAtPoint(ctx, x, y, radius = 16) {
  return averageColorInRegion(ctx, x - radius, y - radius, radius * 2, radius * 2);
}

// bbox format throughout this module matches coco-ssd's own: [x, y, width, height].
export function boxesNear(a, b, marginPx = 24) {
  const aX2 = a[0] + a[2], aY2 = a[1] + a[3];
  const bX2 = b[0] + b[2], bY2 = b[1] + b[3];
  return !(
    a[0] - marginPx > bX2 ||
    b[0] - marginPx > aX2 ||
    a[1] - marginPx > bY2 ||
    b[1] - marginPx > aY2
  );
}

// Draws a colored bounding box + role label — used for both the live
// on-screen preview and (since it draws on the same canvas MatchRecorder
// composites for the watermark) the saved recording itself.
export function drawDetections(ctx, detections) {
  ctx.save();
  for (const d of detections) {
    const [x, y, width, height] = d.bbox;
    const color = ROLE_COLORS[d.role] || ROLE_COLORS.unknown;
    ctx.lineWidth = d.isBall ? 3 : 2.5;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, width, height);
    if (d.label) {
      const fontSize = Math.max(11, Math.round(height * 0.09));
      ctx.font = `700 ${fontSize}px 'Barlow Condensed', Arial, sans-serif`;
      const textY = y > fontSize + 4 ? y - 4 : y + height + fontSize;
      ctx.fillStyle = color;
      ctx.fillText(d.label, x, textY);
    }
  }
  ctx.restore();
}

// Maps a tap's on-screen coordinates (e.g. a React pointer event's
// clientX/clientY) to the corresponding pixel in the detection/recording
// canvas's own coordinate space. The two differ whenever the displayed
// <video> element's CSS box aspect ratio doesn't match the camera's native
// resolution — object-fit:cover then crops one axis to fill the box, so a
// naive percentage-based mapping would sample the wrong point.
export function mapTapToCanvasPoint(tapX, tapY, displayRect, canvasWidth, canvasHeight) {
  const { left, top, width: displayW, height: displayH } = displayRect;
  const videoAspect = canvasWidth / canvasHeight;
  const displayAspect = displayW / displayH;
  let visibleW, visibleH, offsetX, offsetY;
  if (displayAspect > videoAspect) {
    // Display box is relatively wider than the source — cover crops top/bottom.
    visibleW = canvasWidth;
    visibleH = canvasWidth / displayAspect;
    offsetX = 0;
    offsetY = (canvasHeight - visibleH) / 2;
  } else {
    // Display box is relatively taller/narrower — cover crops left/right.
    visibleH = canvasHeight;
    visibleW = canvasHeight * displayAspect;
    offsetY = 0;
    offsetX = (canvasWidth - visibleW) / 2;
  }
  const relX = (tapX - left) / displayW;
  const relY = (tapY - top) / displayH;
  return [offsetX + relX * visibleW, offsetY + relY * visibleH];
}

const LABELS = { keeper: "KEEPER", team: "TEAM", opponent: "OPP", unknown: "" };

// Runs one detection pass over `source` (a HTMLVideoElement or canvas) and
// returns role-classified people plus any ball, ready for drawDetections.
// `sampleCtx` must be a 2D context already showing the same frame as
// `source` (MatchRecorder already draws the source video onto its
// compositing canvas every tick, so that canvas doubles as the color-sample
// surface — no extra draw call needed).
export async function detectAndClassify(model, source, sampleCtx, refs) {
  const predictions = await model.detect(source);
  const detections = [];
  for (const p of predictions) {
    if (p.class === "sports ball") {
      detections.push({ role: "ball", bbox: p.bbox, label: "", isBall: true });
    } else if (p.class === "person") {
      const color = sampleCtx ? sampleTorsoColor(sampleCtx, p.bbox) : null;
      const role = classifyPerson(color, refs);
      detections.push({ role, bbox: p.bbox, label: LABELS[role], isBall: false });
    }
  }
  return detections;
}

let cachedModelPromise = null;

// Loads TensorFlow.js + the COCO-SSD model on first call and reuses the
// same instance afterward. Dynamic import keeps this (and its ~a few MB of
// model weights, fetched from the CDN it ships with) out of the main app
// bundle entirely until a match is actually being filmed.
export function loadDetector() {
  if (!cachedModelPromise) {
    cachedModelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return cachedModelPromise;
}
