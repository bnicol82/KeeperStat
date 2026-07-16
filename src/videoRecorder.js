// In-browser match-film recording via getUserMedia + MediaRecorder. This
// module only produces a Blob — it has no opinion on storage, so callers
// (App.jsx) decide whether to upload it, discard it, or preview it locally.

export function isRecordingSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder === "function" &&
    typeof window.HTMLCanvasElement?.prototype.captureStream === "function"
  );
}

// Exported separately so its browser-support logic is testable without a
// real MediaRecorder instance.
export function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

export function extensionForMimeType(mimeType) {
  return mimeType?.startsWith("video/mp4") ? "mp4" : "webm";
}

function drawOutlinedText(ctx, text, x, y, fontSize, fillStyle) {
  ctx.font = `700 ${fontSize}px 'Barlow Condensed', Arial, sans-serif`;
  ctx.lineWidth = Math.max(2, fontSize * 0.14);
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, x, y);
}

// Draws a small "KeeperStat" wordmark (plus the keeper's name just above
// it, if given) in the bottom-right corner of a video frame already painted
// onto the canvas. Font size scales with the frame so it reads consistently
// whether the source is a phone's portrait or landscape camera resolution.
export function drawWatermark(ctx, width, height, keeperName) {
  const fontSize = Math.max(14, Math.round(width * 0.026));
  const padding = Math.round(fontSize * 0.7);
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";

  const brandY = height - padding;
  drawOutlinedText(ctx, "KeeperStat", width - padding, brandY, fontSize, "rgba(255,255,255,.92)");

  if (keeperName) {
    const nameFontSize = Math.max(11, Math.round(fontSize * 0.72));
    const nameY = brandY - fontSize * 1.15;
    drawOutlinedText(ctx, keeperName, width - padding, nameY, nameFontSize, "rgba(255,255,255,.85)");
  }
  ctx.restore();
}

// Records the rear camera (field-side view of the match) with audio, with a
// "KeeperStat" watermark burned into the bottom-right corner of the saved
// file. Recording directly from the camera MediaStream can't add an overlay,
// so instead a hidden <video> (fed by the camera stream) is continuously
// drawn onto a same-size <canvas> each tick, the watermark is painted on top
// of that frame, and MediaRecorder captures the canvas's own stream — with
// the original microphone track added back in, since canvas.captureStream()
// is video-only. The raw camera stream is still returned separately for the
// live on-screen preview, which doesn't need (or want the cost of) the
// watermark to look correct while filming.
//
// The draw loop uses setInterval rather than requestAnimationFrame:
// browsers fully suspend rAF callbacks while the tab/app is backgrounded,
// which would freeze the recording; setInterval is only throttled (not
// stopped), matching how the old direct-camera-stream recording behaved.
export class MatchRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this._sourceVideo = null;
    this._canvas = null;
    this._drawTimer = null;
    // Optional hook invoked as (ctx, width, height, sourceVideoEl) after the
    // camera frame + watermark are drawn each tick, before the canvas's
    // stream is captured — lets a caller (the player/ball tracking overlay)
    // composite extra drawing onto the exact same frame that gets both
    // displayed and recorded, without this module knowing anything about
    // tracking itself.
    this.onFrame = null;
  }

  // The live compositing canvas, once recording has started — the same
  // frame source used for color-sampling jersey colors during tracking
  // calibration, so classification stays aligned with what's on screen.
  getCanvas() {
    return this._canvas;
  }

  async start(keeperName) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: true,
    });

    const sourceVideo = document.createElement("video");
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = this.stream;
    await sourceVideo.play();
    this._sourceVideo = sourceVideo;

    const { width, height } = this.stream.getVideoTracks()[0]?.getSettings?.() || {};
    const canvas = document.createElement("canvas");
    canvas.width = width || sourceVideo.videoWidth || 1280;
    canvas.height = height || sourceVideo.videoHeight || 720;
    this._canvas = canvas;
    const ctx = canvas.getContext("2d");

    this._drawTimer = setInterval(() => {
      ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
      drawWatermark(ctx, canvas.width, canvas.height, keeperName);
      this.onFrame?.(ctx, canvas.width, canvas.height, sourceVideo);
    }, 1000 / 30);

    const canvasStream = canvas.captureStream(30);
    const recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...this.stream.getAudioTracks()]);

    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    return this.stream;
  }

  // Resolves with the recorded Blob, or null if nothing was captured.
  stop() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        this._cleanup();
        resolve(null);
        return;
      }
      const mimeType = this.recorder.mimeType || "video/webm";
      this.recorder.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: mimeType }) : null;
        this.chunks = [];
        this._cleanup();
        resolve(blob && blob.size > 0 ? blob : null);
      };
      this.recorder.stop();
    });
  }

  // Stops the camera without producing a usable blob (match discarded).
  discard() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        // already stopped/stopping — nothing to clean up
      }
    }
    this._cleanup();
    this.chunks = [];
  }

  _cleanup() {
    clearInterval(this._drawTimer);
    this._drawTimer = null;
    this._sourceVideo?.pause();
    this._sourceVideo = null;
    this._canvas = null;
    this.onFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
