import { describe, it, expect, vi } from "vitest";
import { colorDistance, classifyPerson, sampleTorsoColor, sampleColorAtPoint, boxesNear, drawDetections, detectAndClassify, mapTapToCanvasPoint, ROLE_COLORS } from "./playerTracker.js";

describe("colorDistance", () => {
  it("is zero for identical colors", () => {
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it("computes Euclidean distance in RGB space", () => {
    expect(colorDistance([0, 0, 0], [3, 4, 0])).toBe(5); // 3-4-5 triangle
  });
});

describe("classifyPerson", () => {
  const refs = { keeper: [245, 166, 35], team: [21, 101, 216], opponent: [211, 47, 47] };

  it("matches the nearest calibrated role within threshold", () => {
    expect(classifyPerson([240, 160, 30], refs)).toBe("keeper");
    expect(classifyPerson([25, 105, 210], refs)).toBe("team");
    expect(classifyPerson([200, 50, 50], refs)).toBe("opponent");
  });

  it("returns unknown for a color far from every calibrated reference", () => {
    expect(classifyPerson([0, 255, 0], refs)).toBe("unknown"); // bright green, far from all three
  });

  it("returns unknown when color sampling failed (null)", () => {
    expect(classifyPerson(null, refs)).toBe("unknown");
  });

  it("only matches roles that were actually calibrated", () => {
    const partialRefs = { keeper: [245, 166, 35], team: null, opponent: null };
    // A color close to blue but nothing calibrated for team/opponent must fall back to unknown,
    // not be forced onto the one role that does exist if it isn't actually close to it.
    expect(classifyPerson([21, 101, 216], partialRefs)).toBe("unknown");
  });
});

describe("sampleTorsoColor", () => {
  function mockCtxWithColor(r, g, b) {
    return {
      getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
        return { data };
      },
    };
  }

  it("averages pixel color within the torso region of the box", () => {
    const ctx = mockCtxWithColor(100, 150, 200);
    expect(sampleTorsoColor(ctx, [10, 10, 40, 80])).toEqual([100, 150, 200]);
  });

  it("returns null when getImageData throws (e.g. out of bounds)", () => {
    const ctx = { getImageData: () => { throw new Error("bounds"); } };
    expect(sampleTorsoColor(ctx, [0, 0, 10, 10])).toBeNull();
  });
});

describe("sampleColorAtPoint", () => {
  it("averages a small square region centered on the tapped point", () => {
    let capturedArgs;
    const ctx = {
      getImageData: (x, y, w, h) => {
        capturedArgs = [x, y, w, h];
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) { data[i] = 50; data[i + 1] = 60; data[i + 2] = 70; data[i + 3] = 255; }
        return { data };
      },
    };
    const color = sampleColorAtPoint(ctx, 100, 100, 16);
    expect(color).toEqual([50, 60, 70]);
    expect(capturedArgs).toEqual([84, 84, 32, 32]); // centered: (100-16, 100-16, 32, 32)
  });

  it("returns null when the sample region can't be read", () => {
    const ctx = { getImageData: () => { throw new Error("bounds"); } };
    expect(sampleColorAtPoint(ctx, 10, 10)).toBeNull();
  });
});

describe("boxesNear", () => {
  it("detects overlapping boxes as near", () => {
    expect(boxesNear([0, 0, 50, 50], [25, 25, 50, 50])).toBe(true);
  });

  it("detects boxes within the margin as near even without overlap", () => {
    expect(boxesNear([0, 0, 50, 50], [60, 0, 50, 50], 24)).toBe(true); // 10px gap, margin 24
  });

  it("detects boxes far apart as not near", () => {
    expect(boxesNear([0, 0, 50, 50], [500, 500, 50, 50])).toBe(false);
  });
});

describe("drawDetections", () => {
  function mockCtx() {
    const calls = [];
    return {
      calls,
      save: () => calls.push(["save"]),
      restore: () => calls.push(["restore"]),
      strokeRect: (x, y, w, h) => calls.push(["strokeRect", x, y, w, h]),
      fillText: (text, x, y) => calls.push(["fillText", text, x, y]),
      set lineWidth(v) { calls.push(["lineWidth", v]); },
      set strokeStyle(v) { calls.push(["strokeStyle", v]); },
      set font(v) { calls.push(["font", v]); },
      set fillStyle(v) { calls.push(["fillStyle", v]); },
    };
  }

  it("draws a stroked box using the role's color for each detection", () => {
    const ctx = mockCtx();
    drawDetections(ctx, [
      { role: "keeper", bbox: [10, 20, 30, 40], label: "KEEPER", isBall: false },
      { role: "ball", bbox: [50, 60, 10, 10], label: "", isBall: true },
    ]);
    const strokeColors = ctx.calls.filter((c) => c[0] === "strokeStyle").map((c) => c[1]);
    expect(strokeColors).toEqual([ROLE_COLORS.keeper, ROLE_COLORS.ball]);
    expect(ctx.calls.some((c) => c[0] === "strokeRect" && c[1] === 10 && c[2] === 20)).toBe(true);
  });

  it("skips drawing a label for detections with an empty label", () => {
    const ctx = mockCtx();
    drawDetections(ctx, [{ role: "ball", bbox: [0, 0, 10, 10], label: "", isBall: true }]);
    expect(ctx.calls.some((c) => c[0] === "fillText")).toBe(false);
  });

  it("saves and restores context state around the batch", () => {
    const ctx = mockCtx();
    drawDetections(ctx, []);
    expect(ctx.calls[0]).toEqual(["save"]);
    expect(ctx.calls[ctx.calls.length - 1]).toEqual(["restore"]);
  });
});

describe("mapTapToCanvasPoint", () => {
  it("maps a tap 1:1 when the display and canvas aspect ratios match exactly", () => {
    const rect = { left: 0, top: 0, width: 400, height: 300 };
    // canvas is also 4:3 — no cropping either axis
    const [x, y] = mapTapToCanvasPoint(200, 150, rect, 800, 600);
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(300);
  });

  it("accounts for left/top cropping when the display is wider than the canvas (top/bottom cover-crop)", () => {
    // display is 16:9 (very wide), canvas/source is 4:3 (taller) — cover crops top/bottom
    const rect = { left: 0, top: 0, width: 1600, height: 900 };
    const canvasWidth = 800, canvasHeight = 600;
    // Tapping dead center of the display should land dead center of the canvas
    const [x, y] = mapTapToCanvasPoint(800, 450, rect, canvasWidth, canvasHeight);
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(300);
  });

  it("accounts for the display element's own offset on the page", () => {
    const rect = { left: 50, top: 20, width: 400, height: 300 };
    const [x, y] = mapTapToCanvasPoint(50, 20, rect, 800, 600); // tap at the box's top-left corner
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

describe("detectAndClassify", () => {
  function mockSampleCtx(colorByBoxIndex) {
    let call = 0;
    return {
      getImageData: () => {
        const [r, g, b] = colorByBoxIndex[call++] || [128, 128, 128];
        const data = new Uint8ClampedArray(4);
        data[0] = r; data[1] = g; data[2] = b; data[3] = 255;
        return { data };
      },
    };
  }

  it("classifies each detected person and passes balls through untouched", async () => {
    const model = {
      detect: vi.fn(async () => [
        { class: "person", bbox: [0, 0, 20, 40], score: 0.9 },
        { class: "sports ball", bbox: [100, 100, 8, 8], score: 0.8 },
        { class: "person", bbox: [50, 0, 20, 40], score: 0.85 },
        { class: "dog", bbox: [200, 200, 20, 20], score: 0.7 }, // irrelevant class, must be dropped
      ]),
    };
    const refs = { keeper: [245, 166, 35], team: null, opponent: null };
    const sampleCtx = mockSampleCtx([[245, 166, 35], [0, 200, 0]]);

    const result = await detectAndClassify(model, {}, sampleCtx, refs);

    expect(result).toHaveLength(3); // dog dropped
    expect(result.find((d) => d.isBall).bbox).toEqual([100, 100, 8, 8]);
    expect(result.filter((d) => !d.isBall).map((d) => d.role)).toEqual(["keeper", "unknown"]);
  });

  it("classifies everyone as unknown when no sample context is available", async () => {
    const model = { detect: vi.fn(async () => [{ class: "person", bbox: [0, 0, 20, 40], score: 0.9 }]) };
    const result = await detectAndClassify(model, {}, null, { keeper: [245, 166, 35], team: null, opponent: null });
    expect(result[0].role).toBe("unknown");
  });
});
