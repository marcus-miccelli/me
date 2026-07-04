import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

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
 * Path model (orb-local space, computed in the vertex shader). Each beam is
 * built from TWO ribbon strips sharing the same approach:
 *   1. Approach: a straight run along ±x from beyond the screen edge to the
 *      sphere, with a gentle animated aurora wave.
 *   2. Fork: a circular fillet (radius forkRadius) turns each strip
 *      tangentially onto the rim — one up, one down — with true tangent
 *      continuity, so the ribbon never folds at the impact point.
 *   3. Wrap: each strip hugs the silhouette — an arc just outside the rim
 *      whose standoff decays as exp(-tightness * dphi), so the light
 *      visibly TIGHTENS the further it bends. Top and bottom arcs are
 *      exactly symmetric, and each arc bows backwards in z (wrapDepth) so
 *      the bend lives in 3D and is depth-tested against the orb.
 */

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uSide;        // -1 = beam from the left, +1 = beam from the right
uniform float uBranch;      // +1 = arcs over the top, -1 = arcs under the bottom
uniform float uApproachLen; // straight run length (orb-local units), set per-frame from the viewport
uniform float uWrapAngle;   // how far each fork wraps around the rim (radians)
uniform float uSkim;        // initial standoff above the surface (fraction of radius)
uniform float uTightness;   // exp decay of the standoff -> "light tightens" as it bends
uniform float uForkRadius;  // fillet radius of the fork turn (fraction of orb radius)
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
 * The path is C1 (tangent-continuous) by construction, in three pieces
 * parameterised by a single arclength D:
 *
 *   1. Straight: radial run from off-screen down to radius (r0 + f).
 *   2. Fillet:  a quarter-circle of radius f that turns the radial heading
 *               tangentially — this IS the fork; the top strip turns one
 *               way, the bottom strip the other. (A hard switch here was
 *               what folded the ribbon into the flickering square.)
 *   3. Arc:     rim-hugging sweep whose standoff decays as
 *               exp(-tightness * dphi), so the light tightens as it bends,
 *               bowing backwards in z through the sweep.
 */
vec3 pathPoint(float u, out float dist, out float wrap, out float fork) {
  float anchor = uSide < 0.0 ? PI : 0.0;
  float dir = uSide * uBranch; // turn direction around the silhouette

  float r0 = 1.0 + uSkim;
  float f = uForkRadius;

  // classical line-circle fillet: centre sits at distance f from the radial
  // line AND at distance (r0 + f) from the origin, so it is tangent to BOTH
  // the incoming straight run and the rim circle
  float a = sqrt(r0 * r0 + 2.0 * r0 * f); // where the straight run ends
  float delta = atan(f, a);               // rim angle of the fillet exit
  float gamma = PI * 0.5 - delta;         // fillet sweep
  float filletLen = f * gamma;

  float total = uApproachLen + filletLen + uWrapAngle;
  float D = u * total;
  dist = D;

  vec2 R = vec2(cos(anchor), sin(anchor));        // radial unit (outwards)
  vec2 T = dir * vec2(-sin(anchor), cos(anchor)); // turn-side tangential unit

  // ---- 1. straight approach from off-screen ----
  if (D < uApproachLen) {
    float x = a + (uApproachLen - D);
    wrap = 0.0;
    fork = 0.0;

    vec3 p = vec3(x * R, 0.0);

    // aurora sway, faded out before the fillet so the turn stays clean
    float s = D / max(uApproachLen, 1e-4);
    float win = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 0.9, s));
    p.y +=
      (sin(x * uWaveFreq + uTime * uSpeed * 0.6 + uPhase) * uWaveAmp +
        sin(x * uWaveFreq * 2.6 - uTime * uSpeed * 0.35 + uPhase * 1.7) *
          uWaveAmp * 0.4) * win;

    return p;
  }

  // ---- 2. fillet: tangent turn from the line onto the rim ----
  if (D < uApproachLen + filletLen) {
    float beta = (D - uApproachLen) / max(f, 1e-4); // 0..gamma
    wrap = 0.0;
    fork = beta / max(gamma, 1e-4);

    // in the (R, T) basis: centre at (a, f), sweeping from the line-tangency
    // point towards the rim-tangency point
    float theta = -PI * 0.5 - beta;
    vec2 pc = vec2(a, f) + f * vec2(cos(theta), sin(theta));

    return vec3(pc.x * R + pc.y * T, 0.0);
  }

  // ---- 3. rim-hugging arc ----
  float dphi = D - uApproachLen - filletLen;
  wrap = clamp(dphi / max(uWrapAngle, 1e-4), 0.0, 1.0);
  fork = 1.0;

  float psi = anchor + dir * (delta + dphi);

  // standoff tightens exponentially as the light bends; the eased start
  // keeps the decay's initial slope at zero so the fillet exit stays smooth
  float decay = exp(-uTightness * dphi * smoothstep(0.0, 0.5, dphi));
  float rr = 1.0 + uSkim * decay;

  vec3 p = vec3(rr * cos(psi), rr * sin(psi), 0.0);

  // the bend bows backwards: strongest xz interaction mid-arc, and always
  // behind the orb so depth-testing stays honest; sin^2 eases in and out so
  // the dive into z doesn't kink the path at the fillet exit
  float bow = sin(min(dphi, PI));
  p.z = -uWrapDepth * bow * bow;

  // residual aurora shimmer, damped as the wrap tightens
  float shimmer = sin(dphi * uWaveFreq * 2.0 + uTime * uSpeed * 0.6 + uPhase) *
                  uWaveAmp * 0.5 * exp(-1.2 * dphi);
  p.xy += normalize(p.xy) * shimmer;

  return p;
}

void main() {
  float u = clamp(position.x + 0.5, 0.0, 1.0);
  float v = position.y; // -1..1 across the strip

  float d0; float w0; float f0;
  float d1; float w1; float f1;
  vec3 p = pathPoint(u, d0, w0, f0);
  vec3 p2 = pathPoint(min(u + 0.002, 1.0), d1, w1, f1);

  // screen-facing width direction: perpendicular to the projected tangent
  vec2 tanXY = p2.xy - p.xy;
  vec2 sideDir = length(tanXY) > 1e-5
    ? normalize(vec2(-tanXY.y, tanXY.x))
    : vec2(0.0, 1.0);

  float widthProfile = mix(0.7, 1.0, smoothstep(0.0, 0.3, u));
  widthProfile *= exp(-uWidthDecay * w0 * uWrapAngle);

  vec3 pos = p + vec3(sideDir, 0.0) * v * uWidth * widthProfile;

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

  for (float i = 0.0; i < 3.0; i += 1.0) {
    noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);
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
  /** Fillet radius of the fork turn, as a fraction of the orb radius. */
  forkRadius?: number;
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
  forkRadius = 0.45,
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

  const makeUniforms = (branch: number) => ({
    uTime: { value: 0 },
    uSpeed: { value: speed },
    uSide: { value: side === "left" ? -1 : 1 },
    uBranch: { value: branch },
    uApproachLen: { value: 6 },
    uWrapAngle: { value: wrapAngle * DEG },
    uSkim: { value: skim },
    uTightness: { value: wrapTightness },
    uForkRadius: { value: forkRadius },
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

    // the straight run ends where the fillet begins, at radius
    // sqrt(r0^2 + 2 r0 f) — mirror of the vertex shader's `a`
    const r0 = 1 + skim;
    const filletStart = Math.sqrt(r0 * r0 + 2 * r0 * forkRadius);
    const approachLen = Math.max(reach / s - filletStart, 0.25);

    // smoothed pointer, matching Soft Aurora's easing
    if (enableMouseInteraction) {
      mouseCurrent.current.lerp(mouseTarget.current, Math.min(1, delta * 3));
    } else {
      mouseCurrent.current.set(0.5, 0.5);
    }

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
      material.uniforms.uSkim.value = skim;
      material.uniforms.uTightness.value = wrapTightness;
      material.uniforms.uForkRadius.value = forkRadius;
      material.uniforms.uWrapDepth.value = wrapDepth;
      material.uniforms.uWidth.value = beamWidth;
      material.uniforms.uWidthDecay.value = widthDecay;
      material.uniforms.uWaveAmp.value = waveAmplitude;
      material.uniforms.uWaveFreq.value = waveFrequency;
      material.uniforms.uScale.value = scale;
      material.uniforms.uBrightness.value = brightness;
      material.uniforms.uNoiseFreq.value = noiseFrequency;
      material.uniforms.uNoiseAmp.value = noiseAmplitude;
      material.uniforms.uBandHeight.value = bandHeight;
      material.uniforms.uBandSpread.value = bandSpread;
      material.uniforms.uOctaveDecay.value = octaveDecay;
      material.uniforms.uLayerOffset.value = layerOffset;
      material.uniforms.uColorSpeed.value = colorSpeed;
      material.uniforms.uWrapGlow.value = wrapGlow;
      material.uniforms.uSoftness.value = softness;
      material.uniforms.uMouseInfluence.value = mouseInfluence;
      material.uniforms.uEnableMouse.value = enableMouseInteraction;
    }
  });

  return (
    <group>
      <mesh ref={meshTopRef} renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[1, 2, 220, 1]} />
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
        <planeGeometry args={[1, 2, 220, 1]} />
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
