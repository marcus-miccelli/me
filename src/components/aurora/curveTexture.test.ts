import { describe, it, expect } from "vitest";
import { buildBeamCurve } from "./curve";
import { packCurve } from "./curveTexture";

describe("packCurve", () => {
  it("returns 4 floats per sample", () => {
    const c = buildBeamCurve({
      skim: 0.06,
      wrapAngleRad: (130 * Math.PI) / 180,
      tightness: 1,
      flareDepth: 3.0,
      samples: 128,
    });
    const packed = packCurve(c);
    expect(packed.length).toBe(128 * 4);
    expect(packed).toBeInstanceOf(Float32Array);
  });
});
