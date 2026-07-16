// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { isRecordingSupported, pickMimeType, extensionForMimeType, drawWatermark } from "./videoRecorder.js";

describe("isRecordingSupported", () => {
  const original = {
    mediaDevices: navigator.mediaDevices,
    MediaRecorder: window.MediaRecorder,
    captureStream: window.HTMLCanvasElement.prototype.captureStream,
  };

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: original.mediaDevices, configurable: true });
    window.MediaRecorder = original.MediaRecorder;
    window.HTMLCanvasElement.prototype.captureStream = original.captureStream;
  });

  it("returns false when getUserMedia is unavailable", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    window.MediaRecorder = function () {};
    window.HTMLCanvasElement.prototype.captureStream = function () {};
    expect(isRecordingSupported()).toBe(false);
  });

  it("returns false when MediaRecorder is unavailable", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => {} }, configurable: true });
    window.MediaRecorder = undefined;
    window.HTMLCanvasElement.prototype.captureStream = function () {};
    expect(isRecordingSupported()).toBe(false);
  });

  it("returns false when canvas.captureStream is unavailable (can't watermark the recording)", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => {} }, configurable: true });
    window.MediaRecorder = function () {};
    delete window.HTMLCanvasElement.prototype.captureStream;
    expect(isRecordingSupported()).toBe(false);
  });

  it("returns true when all three are present", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => {} }, configurable: true });
    window.MediaRecorder = function () {};
    window.HTMLCanvasElement.prototype.captureStream = function () {};
    expect(isRecordingSupported()).toBe(true);
  });
});

describe("pickMimeType", () => {
  const originalRecorder = window.MediaRecorder;
  afterEach(() => {
    window.MediaRecorder = originalRecorder;
  });

  it("picks the first supported candidate in preference order", () => {
    window.MediaRecorder = { isTypeSupported: (t) => t === "video/webm" };
    expect(pickMimeType()).toBe("video/webm");
  });

  it("prefers vp9 over vp8 and plain webm when all are supported", () => {
    window.MediaRecorder = { isTypeSupported: () => true };
    expect(pickMimeType()).toBe("video/webm;codecs=vp9,opus");
  });

  it("returns an empty string when nothing is supported", () => {
    window.MediaRecorder = { isTypeSupported: () => false };
    expect(pickMimeType()).toBe("");
  });
});

describe("extensionForMimeType", () => {
  it("maps mp4 mime types to the mp4 extension", () => {
    expect(extensionForMimeType("video/mp4")).toBe("mp4");
  });

  it("defaults everything else to webm", () => {
    expect(extensionForMimeType("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForMimeType(undefined)).toBe("webm");
  });
});

describe("drawWatermark", () => {
  function mockCtx() {
    const calls = [];
    return {
      calls,
      save: () => calls.push(["save"]),
      restore: () => calls.push(["restore"]),
      strokeText: (text, x, y) => calls.push(["strokeText", text, x, y]),
      fillText: (text, x, y) => calls.push(["fillText", text, x, y]),
      set font(v) { calls.push(["font", v]); },
      set textAlign(v) { calls.push(["textAlign", v]); },
      set textBaseline(v) { calls.push(["textBaseline", v]); },
      set lineJoin(v) { calls.push(["lineJoin", v]); },
      set lineWidth(v) { calls.push(["lineWidth", v]); },
      set strokeStyle(v) { calls.push(["strokeStyle", v]); },
      set fillStyle(v) { calls.push(["fillStyle", v]); },
    };
  }

  it("draws the KeeperStat text anchored to the bottom-right corner", () => {
    const ctx = mockCtx();
    drawWatermark(ctx, 1280, 720);
    const strokeCall = ctx.calls.find((c) => c[0] === "strokeText");
    const fillCall = ctx.calls.find((c) => c[0] === "fillText");
    expect(strokeCall[1]).toBe("KeeperStat");
    expect(fillCall[1]).toBe("KeeperStat");
    // right-aligned, bottom-anchored text: x/y should sit near (not past) the frame's edges
    expect(strokeCall[2]).toBeLessThan(1280);
    expect(strokeCall[3]).toBeLessThan(720);
    expect(strokeCall[2]).toBeGreaterThan(1280 * 0.7);
    expect(strokeCall[3]).toBeGreaterThan(720 * 0.7);
  });

  it("scales the font size with the frame width", () => {
    const smallCtx = mockCtx();
    drawWatermark(smallCtx, 640, 360);
    const bigCtx = mockCtx();
    drawWatermark(bigCtx, 1920, 1080);
    const smallFont = smallCtx.calls.find((c) => c[0] === "font")[1];
    const bigFont = bigCtx.calls.find((c) => c[0] === "font")[1];
    const sizeOf = (f) => parseInt(f.match(/(\d+)px/)[1], 10);
    expect(sizeOf(bigFont)).toBeGreaterThan(sizeOf(smallFont));
  });

  it("saves and restores context state so the watermark doesn't leak style onto later frames", () => {
    const ctx = mockCtx();
    drawWatermark(ctx, 1280, 720);
    expect(ctx.calls[0]).toEqual(["save"]);
    expect(ctx.calls[ctx.calls.length - 1]).toEqual(["restore"]);
  });

  it("also draws the keeper's name just above the KeeperStat wordmark when given", () => {
    const ctx = mockCtx();
    drawWatermark(ctx, 1280, 720, "Jordan Casey");
    const strokeTexts = ctx.calls.filter((c) => c[0] === "strokeText").map((c) => c[1]);
    expect(strokeTexts).toEqual(["KeeperStat", "Jordan Casey"]);
    const [, brandY] = ctx.calls.find((c) => c[0] === "strokeText" && c[1] === "KeeperStat").slice(2);
    const [, nameY] = ctx.calls.find((c) => c[0] === "strokeText" && c[1] === "Jordan Casey").slice(2);
    expect(nameY).toBeLessThan(brandY); // drawn above (smaller y) the brand wordmark
  });

  it("omits the keeper name line entirely when no name is given", () => {
    const ctx = mockCtx();
    drawWatermark(ctx, 1280, 720);
    const strokeTexts = ctx.calls.filter((c) => c[0] === "strokeText").map((c) => c[1]);
    expect(strokeTexts).toEqual(["KeeperStat"]);
  });
});
