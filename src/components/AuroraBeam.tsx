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
 *      sphere surface, with a gentle animated aurora wave. Near the orb the
 *      two strips fork apart (splitLead), one steering up, one down.
 *   2. Wrap: each strip then hugs the silhouette — a circular arc just
 *      outside the rim whose standoff radius decays as
 *      (1 + skim * exp(-tightness * dphi)), so the light visibly TIGHTENS
 *      the further it bends. Top and bottom arcs are exactly symmetric.
 *      The arc bows backwards in z (wrapDepth) so the bend lives in 3D,
 *      strongest in the xz plane, and is correctly depth-tested against
 *      the orb.
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
uniform float uSplitLead;   // how early the fork opens before the rim (radians)
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

const float PI = 3.141592653589793;

vec3 pathPoint(float u, out float dist, out float wrap, out float fork) {
  float r0 = 1.0 + uSkim;
  float fA = uApproachLen / (uApproachLen + uWrapAngle);
  float anchor = uSide < 0.0 ? PI : 0.0;
  float dir = uSide * uBranch; // arc direction around the silhouette

  if (u < fA) {
    // ---- straight approach from off-screen towards the anchor point ----
    float s = u / max(fA, 1e-5);
    dist = s * uApproachLen;
    wrap = 0.0;

    float x = mix(r0 + uApproachLen, r0, s);

    // the two strips share this path, then steer apart just before the rim
    fork = smoothstep(0.55, 1.0, s);
    float ang = anchor + dir * uSplitLead * fork;

    vec3 p = vec3(x * cos(ang), x * sin(ang), 0.0);

    // aurora sway, faded near the fork so the entry into the arc is clean
    float win = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.65, 0.95, s));
    p.y +=
      (sin(x * uWaveFreq + uTime * uSpeed * 0.6 + uPhase) * uWaveAmp +
        sin(x * uWaveFreq * 2.6 - uTime * uSpeed * 0.35 + uPhase * 1.7) *
          uWaveAmp * 0.4) * win;

    return p;
  }

  // ---- arc hugging the silhouette ----
  float q = (u - fA) / max(1.0 - fA, 1e-5);
  float dphi = q * uWrapAngle;
  dist = uApproachLen + dphi;
  wrap = q;
  fork = 1.0;

  // standoff tightens exponentially the further the light bends
  float rr = 1.0 + uSkim * exp(-uTightness * dphi);

  // continue from where the fork left off
  float psi = anchor + dir * (uSplitLead + dphi);

  vec3 p = vec3(rr * cos(psi), rr * sin(psi), 0.0);

  // the bend bows backwards: strongest xz interaction mid-arc, and always
  // behind the orb so depth-testing stays honest
  p.z = -uWrapDepth * sin(min(dphi, PI));

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

  // feathered ribbon edges + head/tail fades
  float across =
    smoothstep(0.0, 0.28, vAcross) * (1.0 - smoothstep(0.72, 1.0, vAcross));
  float head = smoothstep(0.0, 0.03, vAlong);
  float tail = 1.0 - smoothstep(0.8, 1.0, vAlong);
  float mask = across * head * tail;

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
  /** How early the top/bottom fork opens before the rim, in degrees. */
  splitLead?: number;
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

  wrapAngle = 155,
  wrapTightness = 1.0,
  skim = 0.06,
  splitLead = 14,
  wrapDepth = 0.35,
  beamWidth = 0.5,
  widthDecay = 0.14,
  wrapGlow = 1.5,
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
    uSplitLead: { value: splitLead * DEG },
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
    const approachLen = Math.max(reach / s - (1 + skim), 0.25);

    // smoothed pointer, matching Soft Aurora's easing
    if (enableMouseInteraction) {
      mouseCurrent.current.lerp(mouseTarget.current, Math.min(1, delta * 3));
    } else {
      mouseCurrent.current.set(0.5, 0.5);
    }

    for (const material of [materialTopRef.current, materialBottomRef.current]) {
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
      material.uniforms.uSplitLead.value = splitLead * DEG;
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
          depthTest
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
          depthTest
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}