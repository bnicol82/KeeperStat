// Builds highlight reels from footage recorded in-app. Highlight detection
// needs no video analysis: the user's own stat taps during recording mark
// the exact moments (each log entry is stamped with which clip was
// recording and the offset into it — see App.jsx's dispatch). Only the
// standout keeper events make the reel: Big Saves and Penalty Saves.
//
// Stitching happens entirely on-device by replaying each highlight window
// from the recorded clip blobs through a hidden <video> → canvas →
// canvas.captureStream() → MediaRecorder — the same pipeline
// videoRecorder.js already uses for watermark compositing. That keeps the
// feature dependency-free (no ffmpeg.wasm: a ~30MB download whose
// single-threaded wasm encode is roughly realtime on phones anyway, i.e.
// no faster than replaying). The cost is that assembly runs at playback
// speed — a 90-second reel takes ~90 seconds — so callers run it in the
// background with a progress indicator.

import { pickMimeType } from "./videoRecorder.js";

export const HIGHLIGHT_EVENT_TYPES = ["bigSave", "penaltySave"];

// Turns a match's event log into per-clip time windows worth keeping:
// [start, end] seconds around each highlight event, overlapping windows
// merged, starts clamped to 0. Entries without clip/at stamps (logged
// while not recording — there's no footage of them) are skipped.
// Returns { [clipIndex]: [[start, end], ...] }.
export function extractHighlightWindows(log, { before = 7, after = 3 } = {}) {
  const byClip = {};
  for (const entry of log || []) {
    if (!HIGHLIGHT_EVENT_TYPES.includes(entry.t)) continue;
    if (typeof entry.clip !== "number" || typeof entry.at !== "number") continue;
    (byClip[entry.clip] ||= []).push([Math.max(0, entry.at - before), entry.at + after]);
  }
  for (const clip of Object.keys(byClip)) {
    const sorted = byClip[clip].sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const w of sorted) {
      const last = merged[merged.length - 1];
      if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
      else merged.push([...w]);
    }
    byClip[clip] = merged;
  }
  return byClip;
}

// Chrome's MediaRecorder writes webm with no duration header, so a video
// element reports duration: Infinity until it's been force-seeked past the
// end once — the standard workaround for in-browser recordings.
async function loadClipVideo(blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Couldn't load a recorded clip"));
  });
  if (!Number.isFinite(video.duration)) {
    await new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = 1e10;
    });
    video.currentTime = 0;
  }
  return { video, url };
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    video.onseeked = resolve;
    video.currentTime = t;
  });
}

// Replays the given windows from each clip into a single recorded Blob.
// `windowsByClip` is keyed by index into `clipBlobs` (missing/extra keys
// are skipped). Resolves null when there's nothing to stitch. The source
// clips already carry the KeeperStat + keeper-name watermark burned in by
// MatchRecorder, so no re-watermarking happens here.
export async function buildReel(clipBlobs, windowsByClip, { onProgress } = {}) {
  const plan = [];
  const loaded = [];
  try {
    for (const key of Object.keys(windowsByClip).map(Number).sort((a, b) => a - b)) {
      if (!clipBlobs[key] || !windowsByClip[key]?.length) continue;
      const clip = await loadClipVideo(clipBlobs[key]);
      loaded.push(clip);
      for (const [start, end] of windowsByClip[key]) {
        const clampedEnd = Math.min(end, clip.video.duration);
        if (clampedEnd - start > 0.25) plan.push({ ...clip, start, end: clampedEnd });
      }
    }
    if (!plan.length) return null;
    const totalSeconds = plan.reduce((a, s) => a + (s.end - s.start), 0);

    const canvas = document.createElement("canvas");
    canvas.width = plan[0].video.videoWidth || 1280;
    canvas.height = plan[0].video.videoHeight || 720;
    const ctx = canvas.getContext("2d");

    // Audio can't ride along on canvas.captureStream() (video-only), so
    // each clip's sound is routed through an AudioContext into a stream
    // destination and merged in. If the context can't start (autoplay
    // policy edge cases), the reel still builds — just silent.
    let audioCtx = null;
    let audioDest = null;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume();
      audioDest = audioCtx.createMediaStreamDestination();
      for (const clip of loaded) audioCtx.createMediaElementSource(clip.video).connect(audioDest);
    } catch (err) {
      console.error("Reel audio unavailable, building silent reel", err);
      audioCtx = null;
      audioDest = null;
    }

    const canvasStream = canvas.captureStream(30);
    const recordStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(audioDest ? audioDest.stream.getAudioTracks() : []),
    ]);
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(1000);
    recorder.pause(); // only capture while a segment is actually playing

    let doneSeconds = 0;
    for (const segment of plan) {
      const { video, start, end } = segment;
      await seekTo(video, start);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      recorder.resume();
      await video.play();
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          onProgress?.(Math.min(1, (doneSeconds + Math.max(0, video.currentTime - start)) / totalSeconds));
          if (video.currentTime >= end || video.ended) {
            clearInterval(timer);
            resolve();
          }
        }, 1000 / 30);
      });
      video.pause();
      recorder.pause();
      doneSeconds += end - start;
      onProgress?.(Math.min(1, doneSeconds / totalSeconds));
    }

    const blob = await new Promise((resolve) => {
      const finalMime = recorder.mimeType || "video/webm";
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: finalMime }) : null);
      recorder.stop();
    });
    audioCtx?.close().catch(() => {});
    return blob && blob.size > 0 ? blob : null;
  } finally {
    for (const clip of loaded) {
      clip.video.pause();
      clip.video.src = "";
      URL.revokeObjectURL(clip.url);
    }
  }
}

// Plays a list of already-finished videos back-to-back into one Blob —
// used to stitch per-match highlight reels into a season reel. Each input
// is "windowed" across its whole duration (Infinity is clamped per clip
// inside buildReel).
export function concatVideos(blobs, { onProgress } = {}) {
  const windowsByClip = {};
  blobs.forEach((_, i) => {
    windowsByClip[i] = [[0, Infinity]];
  });
  return buildReel(blobs, windowsByClip, { onProgress });
}
