import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildBeamCurve } from "./aurora/curve";
import { makeCurveTexture } from "./aurora/curveTexture";
import { sampleAudio } from "../audio/audioBus";
import { lerp } from "three/src/math/MathUtils.js";

/**
 * AuroraBeam
 * ----------
 * A Soft Aurora (React Bits) ribbon, bent into a beam that is fired at the
 * Orb from the edge of the screen and forks around it.
 *
 * Coordinate frame: this component is meant to be mounted as a CHILD of the
 * orb mesh (unit sphere, radius 1). It therefore inherits the orb's
 * rotation.z and its pulsing scale automatically — the beam anchors stay
 * glued to the orb-local points (-1, 0, 0) and (1, 0, 0) forever.
 *
 * Path model (orb-local space). Each beam is built from TWO ribbon strips
 * sharing the same approach:
 *   1. Approach: a straight run along ±x from beyond the screen edge to the
 *      sphere, with a gentle animated aurora wave. Only its length varies with
 *      the orb's pulse; it is the sole per-frame part of the path.
 *   2. Curved region (fork + wrap): a single C2 curve baked on the CPU from a
 *      continuous curvature profile (see aurora/curve.ts) and sampled from a
 *      texture in the vertex shader. A reverse-curve transition flares each
 *      strip out, through an inflection, and tangentially onto the rim — one up,
 *      one down — with continuous curvature, so the fork has no critical points.
 *      The wrap then hugs the silhouette, its standoff decaying so the light
 *      TIGHTENS as it bends; z-bow (wrapDepth) and shimmer are added analytically
 *      on top of the baked curve.
 */

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uSide;        // -1 = beam from the left, +1 = beam from the right
uniform float uBranch;      // +1 = arcs over the top, -1 = arcs under the bottom
uniform float uApproachLen; // straight run length (orb-local units), set per-frame from the viewport
uniform float uWrapAngle;   // how far each fork wraps around the rim (radians)
uniform sampler2D uCurveTex;      // baked curved centre-line: (x,y,theta,kappa)/texel
uniform float uCurveSamples;      // texel count N
uniform float uCurveLength;       // total curved arclength (transition + wrap)
uniform float uTransitionLen;     // transition arclength L_t
uniform float uApproachEndRadius; // radius where the straight approach ends
uniform float uWrapDepth;   // how far the arc bows behind the orb in z
uniform float uWidth;       // ribbon half-width (fraction of radius)
uniform float uWidthDecay;  // width shrink per radian of wrap
uniform float uWaveAmp;     // aurora waviness of the beam path
uniform float uWaveFreq;
uniform float uPhase;       // decorrelates beams / branches

varying float vAlong;  // 0..1 along the whole strip
varying float vDist;   // arclength in orb-local units (stable band coordinates)
varying float vAcross; // 0..1 across the ribbon width
varying float vWrap;   // 0..1 progress through the wrap segment
varying float vFork;   // 0 while the two strips overlap, 1 once forked
varying vec3 vLocal;   // orb-local position, for analytic occlusion

const float PI = 3.141592653589793;

/*
 * The centre-line is one arclength curve D in two pieces:
 *   1. Straight approach: radial run from off-screen down to radius
 *      uApproachEndRadius (only this length varies with the orb pulse).
 *   2. Curved region (transition + wrap): a single C2 curve baked on the CPU
 *      from a continuous curvature profile and sampled from uCurveTex as
 *      (x, y, theta, kappa) in the canonical (R,T) frame. The reverse-curve
 *      transition (flare out, through an inflection, into the rim) replaces the
 *      old circular fillet; curvature is continuous end-to-end, so the fork has
 *      no critical points. z-bow and shimmer stay analytic on top.
 */

// Manual linear fetch from the 1xN curve texture (NearestFilter -> lerp by hand).
vec4 sampleCurve(float arc) {
  float uu = clamp(arc / max(uCurveLength, 1e-4), 0.0, 1.0);
  float fx = uu * (uCurveSamples - 1.0);
  float i0 = floor(fx);
  float fr = fx - i0;
  float t0 = (i0 + 0.5) / uCurveSamples;
  float t1 = (i0 + 1.5) / uCurveSamples;
  vec4 c0 = texture2D(uCurveTex, vec2(t0, 0.5));
  vec4 c1 = texture2D(uCurveTex, vec2(min(t1, 1.0), 0.5));
  return mix(c0, c1, fr);
}

// shim scales the animated aurora perturbations (approach sway + wrap shimmer);
// pass 0.0 to read the smooth underlying geometry. Out: arclength dist, wrap
// progress, fork progress, curvature kappa, and the screen-plane width dir.
vec3 pathPoint(float u, float shim, out float dist, out float wrap,
               out float fork, out float kappa, out vec2 sideDir) {
  float anchor = uSide < 0.0 ? PI : 0.0;
  float dir = uSide * uBranch;
  vec2 R = vec2(cos(anchor), sin(anchor));
  vec2 T = dir * vec2(-sin(anchor), cos(anchor));

  float total = uApproachLen + uCurveLength;
  float D = u * total;
  dist = D;

  if (D < uApproachLen) {
    // straight approach along +R, from off-screen down to uApproachEndRadius
    float x = uApproachEndRadius + (uApproachLen - D);
    wrap = 0.0;
    fork = 0.0;
    kappa = 0.0;
    // width dir must match the curve's at the seam: the curve starts at heading
    // PI (sideDir = -sin(PI)R + cos(PI)T = -T); mismatching it flips the ribbon
    // 180 deg and bowties the fork.
    sideDir = -T;
    vec3 p = vec3(x * R, 0.0);
    float sN = D / max(uApproachLen, 1e-4);
    float win = smoothstep(0.0, 0.25, sN) * (1.0 - smoothstep(0.55, 0.9, sN));
    p.y += (sin(x * uWaveFreq + uTime * uSpeed * 0.6 + uPhase) * uWaveAmp +
            sin(x * uWaveFreq * 2.6 - uTime * uSpeed * 0.35 + uPhase * 1.7) *
              uWaveAmp * 0.4) * win * shim;
    return p;
  }

  // curved region: sample the baked (cx, cy, theta, kappa)
  float arc = D - uApproachLen;
  vec4 c = sampleCurve(arc);
  float th = c.z;
  kappa = c.w;

  wrap = clamp((arc - uTransitionLen) /
               max(uCurveLength - uTransitionLen, 1e-4), 0.0, 1.0);
  fork = smoothstep(0.0, uTransitionLen, arc);

  vec3 p = vec3(c.x * R + c.y * T, 0.0);

  // analytic z-bow from wrap progress
  float phi = wrap * uWrapAngle;
  float bow = sin(min(phi, PI));
  p.z = -uWrapDepth * bow * bow;

  // heading -> orb-local width dir (tangent rotated +90 in the R,T plane)
  sideDir = -sin(th) * R + cos(th) * T;

  // residual aurora shimmer, damped as the wrap tightens (radial)
  float shimmer = sin(arc * uWaveFreq * 2.0 + uTime * uSpeed * 0.6 + uPhase) *
                  uWaveAmp * 0.5 * exp(-1.2 * phi);
  p.xy += normalize(p.xy) * shimmer * shim;

  return p;
}

void main() {
  // The path is a straight off-screen approach followed by the fillet + wrap
  // that curves, twists and bows in z around the orb. Only the curved tail
  // needs dense sampling, but its share of the arclength swings wildly as the
  // orb pulses -- the approach clamps to almost nothing when the orb is large,
  // and dominates when it is small. A uniform plane (or any fixed warp) will
  // therefore facet the bend at one pulse extreme or the other. Instead, split
  // the columns by arclength: a small fixed fraction covers the whole straight
  // approach, and the rest are spread UNIFORMLY over the fillet + wrap, so the
  // bend stays densely and evenly tessellated at every scale. Every shading
  // term is a function of the resulting path fraction (and arclength vDist),
  // so the look is unchanged -- the mesh is only re-sampled where it matters.
  float totalLen = uApproachLen + uCurveLength;
  float approachFrac = uApproachLen / max(totalLen, 1e-4);

  const float APPROACH_COLS = 0.22; // column share spent on the straight run
  float uLin = clamp(position.x + 0.5, 0.0, 1.0);
  float u = uLin < APPROACH_COLS
    ? (uLin / APPROACH_COLS) * approachFrac
    : approachFrac +
      ((uLin - APPROACH_COLS) / (1.0 - APPROACH_COLS)) * (1.0 - approachFrac);
  float v = position.y; // -1..1 across the strip

  // one sample of the C2 centre-line: position (with shimmer), plus the exact
  // baked curvature and width direction (no finite differences needed)
  float d0; float w0; float f0; float k0; vec2 sideDir;
  vec3 p = pathPoint(u, 1.0, d0, w0, f0, k0, sideDir);

  float widthProfile = mix(0.7, 1.0, smoothstep(0.0, 0.3, u));
  widthProfile *= exp(-uWidthDecay * w0 * uWrapAngle);
  // Taper the width to zero over the last of the wrap so the strip ends in a
  // point rather than a flat terminal edge behind the orb.
  widthProfile *= 1.0 - smoothstep(0.82, 1.0, u);
  float desiredHW = uWidth * widthProfile;

  // Offset-curve safety: a flat ribbon of half-width d on a centre-line of
  // curvature k folds (inner edge reverses) once d*k >= 1. Smoothly cap the
  // half-width to ~SAFETY/k from the exact baked curvature, so the ribbon keeps
  // full width on straight/gentle runs and pinches through the tight flare.
  const float SAFETY = 0.75;
  float kappa = abs(k0);
  float xk = desiredHW * kappa / SAFETY;
  float cappedHW = desiredHW / sqrt(1.0 + xk * xk);

  vec3 pos = p + vec3(sideDir, 0.0) * v * cappedHW;

  vAlong = u;
  vDist = d0;
  vAcross = v * 0.5 + 0.5;
  vWrap = w0;
  vFork = f0;
  vLocal = pos;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform float uBandHeight;
uniform float uBandSpread;
uniform float uOctaveDecay;
uniform float uLayerOffset;
uniform float uColorSpeed;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;
uniform float uWrapGlow;
uniform float uSoftness;
uniform float uPhase;

varying float vAlong;
varying float vDist;
varying float vAcross;
varying float vWrap;
varying float vFork;
varying vec3 vLocal;

#define TAU 6.28318

vec3 gradientHash(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 234.6)),
    dot(p, vec3(269.5, 183.3, 198.3)),
    dot(p, vec3(169.5, 283.3, 156.9))
  );
  vec3 h = fract(sin(p) * 43758.5453123);
  float phi = acos(2.0 * h.x - 1.0);
  float theta = TAU * h.y;
  return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));
}

float quinticSmooth(float t) {
  float t2 = t * t;
  float t3 = t * t2;
  return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;
}

vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

float perlin3D(float amplitude, float frequency, float px, float py, float pz) {
  float x = px * frequency;
  float y = py * frequency;

  float fx = floor(x); float fy = floor(y); float fz = floor(pz);
  float cx = ceil(x);  float cy = ceil(y);  float cz = ceil(pz);

  vec3 g000 = gradientHash(vec3(fx, fy, fz));
  vec3 g100 = gradientHash(vec3(cx, fy, fz));
  vec3 g010 = gradientHash(vec3(fx, cy, fz));
  vec3 g110 = gradientHash(vec3(cx, cy, fz));
  vec3 g001 = gradientHash(vec3(fx, fy, cz));
  vec3 g101 = gradientHash(vec3(cx, fy, cz));
  vec3 g011 = gradientHash(vec3(fx, cy, cz));
  vec3 g111 = gradientHash(vec3(cx, cy, cz));

  float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));
  float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));
  float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));
  float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));
  float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));
  float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));
  float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));
  float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));

  float sx = quinticSmooth(x - fx);
  float sy = quinticSmooth(y - fy);
  float sz = quinticSmooth(pz - fz);

  float lx00 = mix(d000, d100, sx);
  float lx10 = mix(d010, d110, sx);
  float lx01 = mix(d001, d101, sx);
  float lx11 = mix(d011, d111, sx);

  float ly0 = mix(lx00, lx10, sy);
  float ly1 = mix(lx01, lx11, sy);

  return amplitude * mix(ly0, ly1, sz);
}

// Soft Aurora glow, remapped onto the ribbon: arclength along the beam
// plays the role of screen-x, ribbon width plays the role of screen-y.
float auroraGlow(float t, vec2 shift) {
  vec2 uv = vec2(vDist * 0.13, vAcross);
  uv += shift;

  float noiseVal = 0.0;
  float freq = uNoiseFreq;
  float amp = uNoiseAmp;
  vec2 samplePos = uv * uScale;

  // Procedural antialiasing. perlin3D samples at spatial frequency freq in
  // samplePos space; one screen pixel spans fwidth(samplePos) of that space,
  // so an octave's on-screen wavelength is ~1/(freq * px). Once that drops
  // below a couple of pixels the octave can no longer be resolved and instead
  // crawls/sparkles as the beam and the noise animate. Fading each octave out
  // as it goes sub-pixel removes that shimmer while leaving the resolvable,
  // large-scale aurora structure fully intact -- this is the flicker that mesh
  // tessellation could never touch, because it lives in the noise, not the
  // geometry.
  float px = max(max(fwidth(samplePos.x), fwidth(samplePos.y)), 1e-5);

  for (float i = 0.0; i < 3.0; i += 1.0) {
    float aa = smoothstep(0.7, 0.3, freq * px);
    noiseVal += perlin3D(amp * aa, freq, samplePos.x, samplePos.y, t);
    amp *= uOctaveDecay;
    freq *= 2.0;
  }

  // uSoftness relaxes the across-gradient so the glow feathers out over the
  // full ribbon width instead of pinching into a hard line
  float yBand = (vAcross * 10.0 - uBandHeight * 10.0) / max(uSoftness, 0.25);
  return 0.3 * max(exp(uBandSpread * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);
}

void main() {
  float t = uSpeed * 0.4 * uTime + uPhase;

  vec2 shift = vec2(0.0);
  if (uEnableMouse) {
    shift = (uMouse - 0.5) * uMouseInfluence;
  }

  float cx = vDist * 0.12;

  vec3 col = vec3(0.0);
  col += 0.99 * auroraGlow(t, shift) *
    cosineGradient(cx + uTime * uSpeed * 0.2 * uColorSpeed,
      vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.20, 0.20)) * uColor1;
  col += 0.99 * auroraGlow(t + uLayerOffset, shift) *
    cosineGradient(cx + uTime * uSpeed * 0.1 * uColorSpeed,
      vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.5, 0.20, 0.25)) * uColor2;

  // top and bottom strips overlap along the shared approach, so each runs at
  // reduced intensity there; once forked they carry full intensity, and the
  // ring brightens slightly as it tightens around the orb
  col *= uBrightness * mix(0.55, 1.0, vFork) * mix(1.0, uWrapGlow, vWrap);

  // soft tone rolloff: additive strips would otherwise hard-clip into
  // saturated white slabs where they stack; this keeps the glow feathered
  col = 1.0 - exp(-col);

  // feathered ribbon edges + head/tail fades
  float across =
    smoothstep(0.0, 0.28, vAcross) * (1.0 - smoothstep(0.72, 1.0, vAcross));
  float head = smoothstep(0.0, 0.03, vAlong);
  float tail = 1.0 - smoothstep(0.7, 0.98, vAlong);

  // analytic soft occlusion by the orb (unit sphere in this local frame).
  // A hardware depth test hard-clips the ribbon's inner width against the
  // sphere along a pixel-exact circle; as the orb pulses and the noise
  // animates, that binary edge crawls and flickers. Instead the material
  // skips the depth test and fades out smoothly where a fragment sits
  // inside the silhouette AND behind the sphere's front surface.
  float rad = length(vLocal.xy);
  float rc = min(rad, 1.0);
  float sphereZ = sqrt(max(1.0 - rc * rc, 0.0));
  float behind = smoothstep(-0.05, 0.05, sphereZ - vLocal.z);
  float inside = 1.0 - smoothstep(0.88, 1.02, rad);
  float occlusion = 1.0 - behind * inside;

  float mask = across * head * tail * occlusion;

  col *= mask;
  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

function hexToVec3(hex: string) {
  const h = hex.replace("#", "").trim();

  const values =
    h.length === 3
      ? [
          parseInt(h[0] + h[0], 16),
          parseInt(h[1] + h[1], 16),
          parseInt(h[2] + h[2], 16),
        ]
      : [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16),
        ];

  return new THREE.Vector3(values[0] / 255, values[1] / 255, values[2] / 255);
}

const DEG = Math.PI / 180;

type AuroraBeamProps = {
  /** Which orb-local anchor the beam is fired at: (-1,0,0) or (1,0,0). */
  side?: "left" | "right";

  // ---- Soft Aurora (React Bits) parameters ----
  speed?: number;
  scale?: number;
  brightness?: number;
  color1?: string;
  color2?: string;
  noiseFrequency?: number;
  noiseAmplitude?: number;
  bandHeight?: number;
  bandSpread?: number;
  octaveDecay?: number;
  layerOffset?: number;
  colorSpeed?: number;
  enableMouseInteraction?: boolean;
  mouseInfluence?: number;

  // ---- beam / wraparound parameters ----
  /** How far EACH fork wraps around the rim, in degrees. */
  wrapAngle?: number;
  /** Exp decay rate of the standoff radius: higher = light tightens faster. */
  wrapTightness?: number;
  /** Initial standoff above the surface, as a fraction of the orb radius. */
  skim?: number;
  /** Flare coefficient of the C2 reverse-curve fork: higher = tighter/more
   *  outward flare. ~3 reproduces the old fillet's tightness. */
  flareDepth?: number;
  /** How far the arcs bow behind the orb in z — the xz-plane bend depth. */
  wrapDepth?: number;
  /** Ribbon half-width as a fraction of the orb radius. */
  beamWidth?: number;
  /** Width shrink per radian of wrap — thins the ring as it tightens. */
  widthDecay?: number;
  /** Brightness multiplier reached at the end of the wrap. */
  wrapGlow?: number;
  /** Feathering of the glow across the ribbon width (1 = React Bits raw). */
  softness?: number;
  /** Aurora sway of the beam path. */
  waveAmplitude?: number;
  waveFrequency?: number;
  /** Phase offset so beams don't animate in lockstep. */
  phase?: number;
  /** Extra world-units past the screen edge where the beam starts. */
  offscreenMargin?: number;
};

export default function AuroraBeam({
  side = "left",

  speed = 0.6,
  scale = 1.5,
  brightness = 1.0,
  color1 = "#f7f7f7",
  color2 = "#e100ff",
  noiseFrequency = 2.5,
  noiseAmplitude = 1.0,
  bandHeight = 0.5,
  bandSpread = 1.0,
  octaveDecay = 0.1,
  layerOffset = 0,
  colorSpeed = 1.0,
  enableMouseInteraction = true,
  mouseInfluence = 0.25,

  wrapAngle = 130,
  wrapTightness = 1.0,
  skim = 0.06,
  flareDepth = 3.0,
  wrapDepth = 0.35,
  beamWidth = 0.5,
  widthDecay = 0.14,
  wrapGlow = 1.25,
  softness = 2.2,
  waveAmplitude = 0.09,
  waveFrequency = 1.4,
  phase = 0,
  offscreenMargin = 1.0,
}: AuroraBeamProps) {
  const meshTopRef = useRef<THREE.Mesh>(null!);
  const materialTopRef = useRef<THREE.ShaderMaterial>(null!);
  const materialBottomRef = useRef<THREE.ShaderMaterial>(null!);
  const worldScale = useRef(new THREE.Vector3(1, 1, 1));
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5));
  const mouseCurrent = useRef(new THREE.Vector2(0.5, 0.5));

  const { gl, viewport } = useThree();

  // Bake the C2 curved centre-line (transition + wrap) once; it is pulse-
  // invariant, so it only re-runs when a shaping prop changes.
  const CURVE_SAMPLES = 128;
  const curve = useMemo(
    () =>
      buildBeamCurve({
        skim,
        wrapAngleRad: wrapAngle * DEG,
        tightness: wrapTightness,
        flareDepth,
        samples: CURVE_SAMPLES,
      }),
    [skim, wrapAngle, wrapTightness, flareDepth],
  );
  const curveTexture = useMemo(() => makeCurveTexture(curve), [curve]);
  // free the previous GPU texture when a prop change re-bakes the curve
  useEffect(() => () => curveTexture.dispose(), [curveTexture]);

  const makeUniforms = (branch: number) => ({
    uTime: { value: 0 },
    uSpeed: { value: speed },
    uSide: { value: side === "left" ? -1 : 1 },
    uBranch: { value: branch },
    uApproachLen: { value: 6 },
    uWrapAngle: { value: wrapAngle * DEG },
    uCurveTex: { value: curveTexture },
    uCurveSamples: { value: CURVE_SAMPLES },
    uCurveLength: { value: curve.curveLength },
    uTransitionLen: { value: curve.transitionLength },
    uApproachEndRadius: { value: curve.a },
    uWrapDepth: { value: wrapDepth },
    uWidth: { value: beamWidth },
    uWidthDecay: { value: widthDecay },
    uWaveAmp: { value: waveAmplitude },
    uWaveFreq: { value: waveFrequency },
    uPhase: { value: phase + branch * 3.1 },

    uScale: { value: scale },
    uBrightness: { value: brightness },
    uColor1: { value: hexToVec3(color1) },
    uColor2: { value: hexToVec3(color2) },
    uNoiseFreq: { value: noiseFrequency },
    uNoiseAmp: { value: noiseAmplitude },
    uBandHeight: { value: bandHeight },
    uBandSpread: { value: bandSpread },
    uOctaveDecay: { value: octaveDecay },
    uLayerOffset: { value: layerOffset },
    uColorSpeed: { value: colorSpeed },
    uWrapGlow: { value: wrapGlow },
    uSoftness: { value: softness },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uMouseInfluence: { value: mouseInfluence },
    uEnableMouse: { value: enableMouseInteraction },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uniformsTop = useMemo(() => makeUniforms(1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uniformsBottom = useMemo(() => makeUniforms(-1), []);

  useEffect(() => {
    if (!enableMouseInteraction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();

      mouseTarget.current.set(
        (event.clientX - rect.left) / (rect.width || 1),
        1 - (event.clientY - rect.top) / (rect.height || 1),
      );
    };

    const handlePointerLeave = () => {
      mouseTarget.current.set(0.5, 0.5);
    };

    window.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [gl, enableMouseInteraction]);

  useFrame(({ clock }, delta) => {
    const mesh = meshTopRef.current;
    if (!mesh) return;

    const t = clock.getElapsedTime();

    // The beam lives in orb-local space (unit sphere), so convert the
    // "reach the user's screen edge" requirement into local units using the
    // orb's current world scale. Recomputed every frame because the orb pulses.
    mesh.getWorldScale(worldScale.current);
    const s = Math.max(worldScale.current.x, 1e-4);

    const halfW = viewport.width / 2;
    const halfH = viewport.height / 2;
    const reach = Math.hypot(halfW, halfH) + offscreenMargin;

    // the straight run ends where the baked curve begins, at radius curve.a
    const approachLen = Math.max(reach / s - curve.a, 0.25);

    // smoothed pointer, matching Soft Aurora's easing
    if (enableMouseInteraction) {
      mouseCurrent.current.lerp(mouseTarget.current, Math.min(1, delta * 3));
    } else {
      mouseCurrent.current.set(0.5, 0.5);
    }

    const { level, bass, mid, treble } = sampleAudio();

    for (const material of [
      materialTopRef.current,
      materialBottomRef.current,
    ]) {
      if (!material) continue;

      material.uniforms.uTime.value = t;
      material.uniforms.uApproachLen.value = approachLen;
      (material.uniforms.uMouse.value as THREE.Vector2).copy(
        mouseCurrent.current,
      );

      // keep tweakable props live (ColorBends convention)
      material.uniforms.uSpeed.value = speed;
      material.uniforms.uWrapAngle.value = wrapAngle * DEG;
      material.uniforms.uCurveTex.value = curveTexture;
      material.uniforms.uCurveLength.value = curve.curveLength;
      material.uniforms.uTransitionLen.value = curve.transitionLength;
      material.uniforms.uApproachEndRadius.value = curve.a;
      material.uniforms.uWrapDepth.value = wrapDepth;
      material.uniforms.uWidth.value = beamWidth + 0.3 * (level + 1 * bass);
      material.uniforms.uWidthDecay.value = widthDecay;
      material.uniforms.uWaveAmp.value = lerp(
        waveAmplitude,
        waveAmplitude + 2,
        0.5 * treble,
      );
      material.uniforms.uWaveFreq.value = waveFrequency;
      material.uniforms.uScale.value = scale;
      material.uniforms.uBrightness.value = brightness + 0.5 * treble;
      material.uniforms.uNoiseFreq.value =
        noiseFrequency + 0.1 * (level + 1 * mid);
      material.uniforms.uNoiseAmp.value = noiseAmplitude;
      material.uniforms.uBandHeight.value = lerp(
        bandHeight,
        bandHeight + 1,
        0.1 * level,
      );
      material.uniforms.uBandSpread.value = lerp(
        bandSpread,
        bandSpread + 1,
        0.5 * level,
      );
      material.uniforms.uOctaveDecay.value = octaveDecay;
      material.uniforms.uLayerOffset.value = layerOffset;
      material.uniforms.uColorSpeed.value = colorSpeed;
      material.uniforms.uWrapGlow.value = wrapGlow + 5 * (level + 1 * mid);
      material.uniforms.uSoftness.value = lerp(
        softness - 0.3,
        softness + 0.3,
        bass,
      );
      material.uniforms.uMouseInfluence.value = mouseInfluence;
      material.uniforms.uEnableMouse.value = enableMouseInteraction;
    }
  });

  return (
    <group>
      <mesh ref={meshTopRef} renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[1, 2, 240, 12]} />
        <shaderMaterial
          ref={materialTopRef}
          uniforms={uniformsTop}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[1, 2, 240, 12]} />
        <shaderMaterial
          ref={materialBottomRef}
          uniforms={uniformsBottom}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
