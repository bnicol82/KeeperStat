// In-browser match-film recording via getUserMedia + MediaRecorder. This
// module only produces a Blob — it has no opinion on storage, so callers
// (App.jsx) decide whether to upload it, discard it, or preview it locally.

export function isRecordingSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder === "function"
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

// Records the rear camera (field-side view of the match) with audio. Chunks
// are gathered every second rather than buffered as one long recording, so a
// tab crash or accidental close during a long match loses at most a second
// of footage instead of everything captured so far.
export class MatchRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: true,
    });
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
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
        resolve(null);
        return;
      }
      const mimeType = this.recorder.mimeType || "video/webm";
      this.recorder.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: mimeType }) : null;
        this.chunks = [];
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
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
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.chunks = [];
  }
}
