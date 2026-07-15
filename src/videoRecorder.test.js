// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { isRecordingSupported, pickMimeType, extensionForMimeType } from "./videoRecorder.js";

describe("isRecordingSupported", () => {
  const original = { mediaDevices: navigator.mediaDevices, MediaRecorder: window.MediaRecorder };

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: original.mediaDevices, configurable: true });
    window.MediaRecorder = original.MediaRecorder;
  });

  it("returns false when getUserMedia is unavailable", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    window.MediaRecorder = function () {};
    expect(isRecordingSupported()).toBe(false);
  });

  it("returns false when MediaRecorder is unavailable", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => {} }, configurable: true });
    window.MediaRecorder = undefined;
    expect(isRecordingSupported()).toBe(false);
  });

  it("returns true when both are present", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => {} }, configurable: true });
    window.MediaRecorder = function () {};
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
