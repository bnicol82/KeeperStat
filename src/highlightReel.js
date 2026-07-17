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

// Extracts the [start, end] range of one audio channel as raw sample
// frames, clamped to the channel's bounds. Exported for tests.
export function sliceSegmentFrames(channelData, sampleRate, start, end) {
  const from = Math.min(channelData.length, Math.max(0, Math.floor(start * sampleRate)));
  const to = Math.min(channelData.length, Math.max(from, Math.floor(end * sampleRate)));
  return channelData.slice(from, to);
}

// Decoding a clip means holding its entire uncompressed PCM in memory at
// once (decodeAudioData has no range API) — fine for the minutes-long
// clips Record Film produces, but a full-half recording would decode to
// gigabytes and kill the tab. Clips past this size keep their video in the
// reel with silent audio instead.
const MAX_AUDIO_DECODE_BYTES = 200 * 1024 * 1024;

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

// Bounds every browser-event wait in this module. iOS Safari in particular
// has promises that silently never settle outside a user gesture
// (AudioContext.resume is the worst offender) — an unbounded await there
// froze reel-building at 0% forever on iPhones. `fallback` distinguishes
// waits that can safely proceed on timeout from ones that must fail.
function withTimeout(promise, ms, { fallback, error } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (error) reject(new Error(error));
      else resolve(fallback);
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// MUST be called synchronously inside a user tap/click handler (no awaits
// before it). iOS gates two things on direct user gestures, and both cost
// the reel its sound when missed: an AudioContext only starts when
// created/resumed during a gesture (otherwise resume() pends forever), and
// unmuted programmatic play() is only allowed on elements that were
// play()ed at least once during a gesture. This primes both — the audio
// context and one pre-activated element per clip — inside the tap, so the
// async reel build afterward can capture real audio. Ownership passes to
// buildReel/concatVideos via the `primed` option, which cleans it all up.
export function primeReelPlayback(blobs) {
  let audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
  } catch {
    audioCtx = null;
  }
  const clips = blobs.map((blob) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    // The activation "unlock": play() invoked within the gesture flags the
    // element as user-activated even though it's immediately paused.
    const p = video.play();
    p?.catch(() => {});
    video.pause();
    return { video, url };
  });
  return { audioCtx, clips };
}

// Chrome's MediaRecorder writes webm with no duration header, so a video
// element reports duration: Infinity until it's been force-seeked past the
// end once — the standard workaround for in-browser recordings.
async function loadClipVideo(blob, primedClip) {
  let video, url;
  if (primedClip) {
    ({ video, url } = primedClip);
  } else {
    url = URL.createObjectURL(blob);
    video = document.createElement("video");
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
  }
  // A primed element may have finished loading metadata before this runs —
  // check readyState instead of racing the event.
  if (video.readyState < 1) {
    await withTimeout(
      new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error("Couldn't load a recorded clip"));
      }),
      10000,
      { error: "Loading a recorded clip timed out" }
    );
  }
  if (!Number.isFinite(video.duration)) {
    await withTimeout(
      new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = 1e10;
      }),
      5000,
      { fallback: undefined }
    );
    video.currentTime = 0;
  }
  return { video, url };
}

function seekTo(video, t) {
  // Best-effort: a missed seeked event just means the segment starts from
  // wherever the element landed, rather than hanging the whole build.
  return withTimeout(
    new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = t;
    }),
    5000,
    { fallback: undefined }
  );
}

// iOS autoplay policy rejects play() on unmuted videos that were never
// play()ed during a user gesture — primeReelPlayback exists precisely so
// this first attempt succeeds. Muting and retrying is a last resort that
// saves the reel's video but loses that segment's sound (muting an element
// also silences its MediaElementSource capture in real browsers, despite
// what the spec implies), so it's a degradation path, not a plan.
async function playWithFallback(video) {
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
}

// Replays the given windows from each clip into a single recorded Blob.
// `windowsByClip` is keyed by index into `clipBlobs` (missing/extra keys
// are skipped). Resolves null when there's nothing to stitch. The source
// clips already carry the KeeperStat + keeper-name watermark burned in by
// MatchRecorder, so no re-watermarking happens here.
export async function buildReel(clipBlobs, windowsByClip, { onProgress, primed } = {}) {
  const plan = [];
  const loaded = [];
  let audioCtx = null;
  try {
    for (const key of Object.keys(windowsByClip).map(Number).sort((a, b) => a - b)) {
      if (!clipBlobs[key] || !windowsByClip[key]?.length) continue;
      const clip = await loadClipVideo(clipBlobs[key], primed?.clips?.[key]);
      loaded.push(clip);
      for (const [start, end] of windowsByClip[key]) {
        const clampedEnd = Math.min(end, clip.video.duration);
        if (clampedEnd - start > 0.25) plan.push({ ...clip, blob: clipBlobs[key], start, end: clampedEnd });
      }
    }
    if (!plan.length) return null;
    const totalSeconds = plan.reduce((a, s) => a + (s.end - s.start), 0);

    // The clip videos exist only to supply FRAMES — always muted. Their
    // audio comes from decoded buffers below, never from element playback:
    // MediaElementAudioSourceNode is broken on iOS for blob-backed video
    // (it feeds silence into the graph while the element blares through
    // the speaker), which produced every audio bug this feature has had.
    // Muted playback is also allowed everywhere without a gesture.
    for (const clip of loaded) clip.video.muted = true;

    const canvas = document.createElement("canvas");
    canvas.width = plan[0].video.videoWidth || 1280;
    canvas.height = plan[0].video.videoHeight || 720;
    const ctx = canvas.getContext("2d");

    // Audio can't ride along on canvas.captureStream() (video-only), so
    // each highlight window's sound is cut from the clip's decoded audio
    // track and scheduled into the graph as an AudioBufferSourceNode in
    // sync with the muted video. The gesture-primed context (created
    // inside the user's tap — see primeReelPlayback) is what allows a
    // running context on iOS at all. If the context can't start or a clip
    // can't decode, the reel still builds — just silent (or silent for
    // that clip).
    let audioDest = null;
    try {
      audioCtx = primed?.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      // NEVER await resume() unbounded: outside a user gesture iOS Safari
      // leaves it pending forever (it doesn't reject), which used to hang
      // the whole build at 0%. Give it a moment, then check state.
      await withTimeout(audioCtx.resume(), 800, { fallback: undefined });
      if (audioCtx.state !== "running") throw new Error(`AudioContext stuck in state '${audioCtx.state}'`);
      audioDest = audioCtx.createMediaStreamDestination();
    } catch (err) {
      console.error("Reel audio unavailable, building silent reel", err);
      audioDest = null;
    }

    if (audioDest) {
      // One decode per distinct clip blob; the full decoded PCM is released
      // as soon as its windows are sliced out, so peak memory is one clip.
      const segmentsByBlob = new Map();
      for (const segment of plan) {
        if (!segmentsByBlob.has(segment.blob)) segmentsByBlob.set(segment.blob, []);
        segmentsByBlob.get(segment.blob).push(segment);
      }
      for (const [blob, segments] of segmentsByBlob) {
        if (blob.size > MAX_AUDIO_DECODE_BYTES) {
          console.error("Clip too large to decode audio in memory — its reel segments will be silent");
          continue;
        }
        try {
          const encoded = await blob.arrayBuffer();
          const decoded = await withTimeout(audioCtx.decodeAudioData(encoded), 60000, { error: "Decoding clip audio timed out" });
          for (const segment of segments) {
            const channels = [];
            for (let c = 0; c < decoded.numberOfChannels; c++) {
              channels.push(sliceSegmentFrames(decoded.getChannelData(c), decoded.sampleRate, segment.start, segment.end));
            }
            if (!channels[0]?.length) continue;
            const buf = audioCtx.createBuffer(channels.length, channels[0].length, decoded.sampleRate);
            channels.forEach((data, c) => buf.copyToChannel(data, c));
            segment.audioBuffer = buf;
          }
        } catch (err) {
          console.error("Couldn't decode a clip's audio — its reel segments will be silent", err);
        }
      }
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
    // The recorder runs CONTINUOUSLY from the first segment to the last —
    // never pause()/resume(). Cycling a paused recorder per segment
    // produced glitchy, crackling audio on Safari (whose MediaRecorder is
    // notoriously unreliable across pause/resume, and sometimes delivers
    // zero output entirely when paused immediately after starting). The
    // trade-off is that seek gaps between segments are recorded as a brief
    // frozen frame with silent audio — clean and stable on every browser,
    // versus corrupted audio on iOS.
    recorder.start(1000);

    let doneSeconds = 0;
    for (const segment of plan) {
      const { video, start, end } = segment;
      await seekTo(video, start);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // The segment's decoded audio starts alongside the (muted) video.
      // Both run in real time from the same instant over a ~10s window, so
      // drift stays imperceptible.
      let bufSrc = null;
      if (segment.audioBuffer && audioDest) {
        bufSrc = audioCtx.createBufferSource();
        bufSrc.buffer = segment.audioBuffer;
        bufSrc.connect(audioDest);
      }
      await playWithFallback(video);
      bufSrc?.start();
      await new Promise((resolve) => {
        // Watchdog: if playback stops advancing (tab throttled, decoder
        // stall), end the segment rather than spinning at one progress
        // value forever — a shorter reel beats a build that never finishes.
        let lastTime = -1;
        let lastAdvanceAt = Date.now();
        const timer = setInterval(() => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          onProgress?.(Math.min(1, (doneSeconds + Math.max(0, video.currentTime - start)) / totalSeconds));
          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            lastAdvanceAt = Date.now();
          }
          if (video.currentTime >= end || video.ended || Date.now() - lastAdvanceAt > 8000) {
            clearInterval(timer);
            resolve();
          }
        }, 1000 / 30);
      });
      video.pause();
      try {
        bufSrc?.stop();
      } catch {
        // already ended naturally — buffer length matches the window
      }
      doneSeconds += end - start;
      onProgress?.(Math.min(1, doneSeconds / totalSeconds));
    }

    const finalMime = recorder.mimeType || "video/webm";
    const blob = await withTimeout(
      new Promise((resolve) => {
        recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: finalMime }) : null);
        recorder.stop();
      }),
      10000,
      // onstop never firing is a real Safari failure mode — salvage
      // whatever chunks were delivered rather than hanging.
      { fallback: null }
    ).then((b) => b ?? (chunks.length ? new Blob(chunks, { type: finalMime }) : null));
    // Segments were planned and played but the recorder delivered nothing —
    // that's a device/browser recording failure, not "nothing to stitch".
    // Throwing (instead of returning null) lets the caller show its error
    // toast; returning null here once made the progress bar reach 100% and
    // then silently vanish with no reel and no explanation.
    if (!blob || blob.size === 0) throw new Error("The recorder produced no output on this device");
    return blob;
  } finally {
    // Owns cleanup of everything, primed or self-created, on every exit
    // path (success, empty plan, or throw): close the audio context and
    // release each clip element — including primed elements whose clip
    // index never made it into the plan.
    audioCtx?.close().catch(() => {});
    const toRelease = [...loaded];
    for (const primedClip of primed?.clips || []) {
      if (primedClip && !loaded.some((c) => c.video === primedClip.video)) toRelease.push(primedClip);
    }
    for (const clip of toRelease) {
      clip.video.pause();
      clip.video.src = "";
      URL.revokeObjectURL(clip.url);
    }
    if (primed?.audioCtx && primed.audioCtx !== audioCtx) primed.audioCtx.close().catch(() => {});
  }
}

// Plays a list of already-finished videos back-to-back into one Blob —
// used to stitch per-match highlight reels into a season reel. Each input
// is "windowed" across its whole duration (Infinity is clamped per clip
// inside buildReel).
export function concatVideos(blobs, { onProgress, primed } = {}) {
  const windowsByClip = {};
  blobs.forEach((_, i) => {
    windowsByClip[i] = [[0, Infinity]];
  });
  return buildReel(blobs, windowsByClip, { onProgress, primed });
}
