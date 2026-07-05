export type Vec2 = [number, number];

export function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function flareHump(x: number): number {
  const s = Math.sin(Math.PI * x);
  return s * s;
}

// Transition curvature over normalised arclength sN in [0,1]:
// ramps 0 -> kappaRim (smootherstep) minus a flare hump that dips it negative.
export function transitionKappa(sN: number, kappaRim: number, cFlare: number): number {
  return kappaRim * smootherstep(sN) - cFlare * flareHump(sN);
}

// RK4 integrate a planar curve of prescribed curvature kappaOf(s).
// State: (x, y, theta). x' = cos theta, y' = sin theta, theta' = kappa(s).
// Positions start at (0,0); caller translates to the true start point.
export function integrateHeading(
  kappaOf: (s: number) => number,
  s0: number,
  s1: number,
  theta0: number,
  steps: number,
): { theta: number; points: { s: number; x: number; y: number; theta: number }[] } {
  const h = (s1 - s0) / steps;
  let x = 0,
    y = 0,
    th = theta0;
  const points: { s: number; x: number; y: number; theta: number }[] = [
    { s: s0, x, y, theta: th },
  ];
  for (let i = 0; i < steps; i++) {
    const s = s0 + i * h;
    const k1x = Math.cos(th),
      k1y = Math.sin(th),
      k1t = kappaOf(s);
    const th2 = th + (k1t * h) / 2;
    const k2x = Math.cos(th2),
      k2y = Math.sin(th2),
      k2t = kappaOf(s + h / 2);
    const th3 = th + (k2t * h) / 2;
    const k3x = Math.cos(th3),
      k3y = Math.sin(th3),
      k3t = kappaOf(s + h / 2);
    const th4 = th + k3t * h;
    const k4x = Math.cos(th4),
      k4y = Math.sin(th4),
      k4t = kappaOf(s + h);

    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    th += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    points.push({ s: s + h, x, y, theta: th });
  }
  return { theta: th, points };
}

export interface BeamCurveParams {
  skim: number;
  wrapAngleRad: number;
  tightness: number;
  /** Flare coefficient (c_flare): fork tightness / outward reach. ~3 ≈ current fork. */
  flareDepth: number;
  samples: number;
}

export interface BeamCurve {
  /** N * (x, y, theta, kappa) in the canonical (R,T) frame, uniform in arclength. */
  samples: Float32Array;
  /** Approach-end radius (transition start on +R axis) — solved output. */
  a: number;
  /** Total curved arclength (transition + wrap). */
  curveLength: number;
  /** Transition arclength L_t — solved output. */
  transitionLength: number;
}

const THETA0 = Math.PI; // transition starts heading -R (toward the origin)

interface RawPoint {
  s: number;
  x: number;
  y: number;
  theta: number;
  kappa: number;
}

function buildTransition(p: BeamCurveParams, a: number, Lt: number): RawPoint[] {
  const kappaRim = 1 / (1 + p.skim);
  const steps = Math.max(32, Math.round(Lt * 600));
  const kap = (s: number) => transitionKappa(s / Lt, kappaRim, p.flareDepth);
  const tr = integrateHeading(kap, 0, Lt, THETA0, steps);
  return tr.points.map((q) => ({
    s: q.s,
    x: a + q.x,
    y: q.y,
    theta: q.theta,
    kappa: kap(q.s),
  }));
}

function transitionResidual(p: BeamCurveParams, a: number, Lt: number) {
  const pts = buildTransition(p, a, Lt);
  const e = pts[pts.length - 1];
  const r = Math.max(Math.hypot(e.x, e.y), 1e-6); // guard against r->0 (NaN tang)
  const tang = (Math.cos(e.theta) * e.x + Math.sin(e.theta) * e.y) / r;
  return { radiusErr: r - (1 + p.skim), tangErr: tang };
}

// Build the curved region (transition + wrap) as an arclength-uniform curve.
// Solves (a, L_t) so the transition lands on the rim standoff tangentially,
// with flareDepth (= c_flare) fixed as the art knob; then integrates the wrap.
export function buildBeamCurve(p: BeamCurveParams): BeamCurve {
  const aFloor = 1 + p.skim + 0.05; // must stay outside the rim standoff
  // seed the same way we clamp, so an ill-posed prop can never start invalid
  let a = Math.max(aFloor, 1.7);
  let Lt = 1.1;
  for (let it = 0; it < 80; it++) {
    const b = transitionResidual(p, a, Lt);
    const f = b.radiusErr;
    const g = b.tangErr;
    if (Math.hypot(f, g) < 1e-7) break;
    const d = 1e-5;
    const fa = transitionResidual(p, a + d, Lt);
    const fl = transitionResidual(p, a, Lt + d);
    const J00 = (fa.radiusErr - f) / d;
    const J01 = (fl.radiusErr - f) / d;
    const J10 = (fa.tangErr - g) / d;
    const J11 = (fl.tangErr - g) / d;
    const det = J00 * J11 - J01 * J10;
    if (Math.abs(det) < 1e-12) break;
    const nextA = a - (J11 * f - J01 * g) / det;
    const nextLt = Lt - (-J10 * f + J00 * g) / det;
    // a NaN cascade (e.g. an extreme flareDepth curling to the origin) must not
    // silently poison the baked texture — bail to the last good iterate instead.
    if (!Number.isFinite(nextA) || !Number.isFinite(nextLt)) break;
    a = Math.max(aFloor, Math.min(nextA, 6));
    Lt = Math.max(0.4, Math.min(nextLt, 6));
  }

  const pts: RawPoint[] = buildTransition(p, a, Lt);
  const trEnd = pts[pts.length - 1];

  // Wrap: kappa = 1/rr, rr = 1 + skim*decay(phi), phi = heading swept since
  // wrap start. RK2 (midpoint) until phi >= wrapAngle.
  const wrapStart = trEnd.theta;
  let x = trEnd.x;
  let y = trEnd.y;
  let th = trEnd.theta;
  let s = trEnd.s;
  const dS = 1 / 800;
  const kappaWrap = (phi: number) => {
    const decay = Math.exp(-p.tightness * phi * smootherstep(phi / 0.5));
    return 1 / (1 + p.skim * decay);
  };
  let guard = 0;
  while (th - wrapStart < p.wrapAngleRad && guard < 400000) {
    guard++;
    const k1 = kappaWrap(th - wrapStart);
    const thMid = th + (k1 * dS) / 2;
    const k2 = kappaWrap(thMid - wrapStart);
    x += Math.cos(thMid) * dS;
    y += Math.sin(thMid) * dS;
    th += k2 * dS;
    s += dS;
    pts.push({ s, x, y, theta: th, kappa: kappaWrap(th - wrapStart) });
  }

  const curveLength = pts[pts.length - 1].s;

  // Resample uniformly in arclength into N (x, y, theta, kappa) samples.
  const N = p.samples;
  const samples = new Float32Array(N * 4);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / (N - 1)) * curveLength;
    while (j < pts.length - 2 && pts[j + 1].s < target) j++;
    const p0 = pts[j];
    const p1 = pts[Math.min(j + 1, pts.length - 1)];
    const span = p1.s - p0.s || 1;
    const f = Math.min(1, Math.max(0, (target - p0.s) / span));
    samples[i * 4 + 0] = p0.x + (p1.x - p0.x) * f;
    samples[i * 4 + 1] = p0.y + (p1.y - p0.y) * f;
    samples[i * 4 + 2] = p0.theta + (p1.theta - p0.theta) * f;
    samples[i * 4 + 3] = p0.kappa + (p1.kappa - p0.kappa) * f;
  }

  return { samples, a, curveLength, transitionLength: Lt };
}
