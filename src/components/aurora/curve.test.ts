import { describe, it, expect } from "vitest";
import {
  smootherstep,
  flareHump,
  transitionKappa,
  integrateHeading,
} from "./curve";

describe("smootherstep", () => {
  it("hits endpoints and midpoint", () => {
    expect(smootherstep(0)).toBeCloseTo(0);
    expect(smootherstep(1)).toBeCloseTo(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5);
  });
});

describe("flareHump", () => {
  it("is zero at both ends, positive in middle", () => {
    expect(flareHump(0)).toBeCloseTo(0);
    expect(flareHump(1)).toBeCloseTo(0);
    expect(flareHump(0.5)).toBeGreaterThan(0.9);
  });
});

describe("transitionKappa", () => {
  const kRim = 1 / 1.06;
  it("starts at 0 and ends at kappaRim", () => {
    expect(transitionKappa(0, kRim, 2)).toBeCloseTo(0);
    expect(transitionKappa(1, kRim, 2)).toBeCloseTo(kRim);
  });
  it("dips negative (flare) for positive cFlare", () => {
    let min = Infinity;
    for (let i = 0; i <= 20; i++) min = Math.min(min, transitionKappa(i / 20, kRim, 2));
    expect(min).toBeLessThan(0);
  });
});

describe("integrateHeading", () => {
  it("a constant-curvature arc is a circle: turning by pi over length pi*R", () => {
    const R = 2;
    const { theta, points } = integrateHeading(() => 1 / R, 0, Math.PI * R, 0, 400);
    expect(theta).toBeCloseTo(Math.PI, 2); // heading turned by pi
    const end = points[points.length - 1];
    // start heading +x from (0,0), curving left: end near (0, 2R)
    expect(end.x).toBeCloseTo(0, 1);
    expect(end.y).toBeCloseTo(2 * R, 1);
  });
});

import { buildBeamCurve } from "./curve";

const PARAMS = {
  skim: 0.06,
  wrapAngleRad: (130 * Math.PI) / 180,
  tightness: 1.0,
  flareDepth: 3.0,
  samples: 128,
};

describe("buildBeamCurve", () => {
  it("solves so the transition lands on the rim tangentially", () => {
    const c = buildBeamCurve(PARAMS);
    const n = PARAMS.samples;
    const idx = Math.round((c.transitionLength / c.curveLength) * (n - 1));
    const x = c.samples[idx * 4 + 0];
    const y = c.samples[idx * 4 + 1];
    const th = c.samples[idx * 4 + 2];
    const r = Math.hypot(x, y);
    expect(r).toBeCloseTo(1 + PARAMS.skim, 1);
    const dot = (Math.cos(th) * x + Math.sin(th) * y) / r; // tangent . radial
    expect(Math.abs(dot)).toBeLessThan(0.05);
  });

  it("has a continuous baked curvature (no discontinuity jump)", () => {
    const c = buildBeamCurve(PARAMS);
    const n = PARAMS.samples;
    let maxJump = 0;
    for (let i = 1; i < n; i++) {
      maxJump = Math.max(
        maxJump,
        Math.abs(c.samples[i * 4 + 3] - c.samples[(i - 1) * 4 + 3]),
      );
    }
    // smooth steep flare lobe gives ~0.27; a real seam discontinuity would be >2.
    expect(maxJump).toBeLessThan(0.4);
  });

  it("kappa starts ~0 (matches straight approach) and the flare lobe goes negative", () => {
    const c = buildBeamCurve(PARAMS);
    expect(Math.abs(c.samples[3])).toBeLessThan(0.05);
    const n = PARAMS.samples;
    let minK = Infinity;
    for (let i = 0; i < n; i++) minK = Math.min(minK, c.samples[i * 4 + 3]);
    expect(minK).toBeLessThan(-1.5); // strong outward flare (the S)
  });

  it("wrap curvature settles near 1 and approach-end radius is outside the rim", () => {
    const c = buildBeamCurve(PARAMS);
    const last = c.samples.length / 4 - 1;
    expect(c.samples[last * 4 + 3]).toBeGreaterThan(0.9);
    expect(c.samples[last * 4 + 3]).toBeLessThan(1.2);
    expect(c.a).toBeGreaterThan(1 + PARAMS.skim);
  });
});
