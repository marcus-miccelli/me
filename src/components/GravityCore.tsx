// src/components/GravityCore.tsx
//
// Spectral-star core visual (see inspo reference): a radial FREQUENCY-SPECTRUM
// star built from moving "shots". Each FFT bin has a fixed base direction; while
// that frequency is active it EMITS shots at a rate scaled by its level, so a
// sustained note spawns many concurrent, slightly-varied instances of its line.
// Each shot is a dotted packet that races out along a curved petal and back to
// the core, then dies. Petal shape varies per shot — from pointed vesica-piscis
// leaves (low curl) to rounder loops (high curl). Quiet music => no shots => a
// tiny bright star. Whole-scene chromatic aberration + bloom (Home) add fringing.
import { useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getOrbState } from "./gravity/orbBus";
import { makeStarTexture, makeDotTexture } from "./gravity/sprites";
import { sampleAudio, sampleSpectrum, expand } from "../audio/audioBus";

// --- tuning -----------------------------------------------------------------
const BINS = 512; // FFT bins (analyser fftSize 1024 -> 512)
const SHOTS = 1600; // concurrent shot pool
const TRAIL = 28; // dots per shot
const DOTS = SHOTS * TRAIL;

const CORE = {
  Lbase: 5.6, // shot length at full bin level (world units) — large scale
  curlMin: 0.7, // petal curl variance: low = pointed vesica leaf ...
  curlMax: 3.6, // ... high = rounder loop; higher overall = sharper turns
  vertBias: 1.6, // vertical stretch -> tall diamond envelope
  floor: 0.42, // per-bin contrast floor (below this a bin reads as 0)
  smooth: 0.05, // per-bin level smoothing time constant (s)
  speed: 2.8, // shot travel speed (out-and-back per second)
  speedVar: 0.6, // per-shot speed variation
  trailSpan: 0.5, // fraction of the petal a shot's dotted body occupies
  emitRate: 16, // shots/sec emitted by a bin at full level
  emitMinAmp: 0.06, // a bin must exceed this level to emit
  dirJitter: 0.32, // spread of instances around a bin's base direction
  dotSize: 2.2, // point size (px)
  caShift: 0.02, // baked chromatic aberration: radial RGB split (grows w/ radius)
  hdr: 2.4, // HDR gain on dot colour so shots clear the bloom threshold (>1)
};

function hash(n: number) {
  return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
}

// The shot dots are drawn in three passes (R/G/B). uShift pushes each channel's
// vertices radially outward by a different amount (scaled by radius), baking a
// chromatic-aberration split into GravityCore alone — no whole-scene CA pass.
const particleVert = `
uniform float uShift;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aSize;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec3 pos = position;
  float d = length(pos.xy);
  if (d > 0.0001) {
    pos.xy += (pos.xy / d) * (uShift * d);
  }
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const particleFrag = `
precision highp float;
uniform sampler2D uTex;
uniform vec3 uMask;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * uMask * t.rgb, t.a * vAlpha);
}
`;

// fixed base direction + colour per frequency bin
interface Bins {
  dx: Float32Array;
  dy: Float32Array;
  dz: Float32Array;
  tint: Float32Array; // BINS*3
  amp: Float32Array; // smoothed level
  accum: Float32Array; // fractional emission carry
}

function buildBins(): Bins {
  const B: Bins = {
    dx: new Float32Array(BINS),
    dy: new Float32Array(BINS),
    dz: new Float32Array(BINS),
    tint: new Float32Array(BINS * 3),
    amp: new Float32Array(BINS),
    accum: new Float32Array(BINS),
  };
  for (let i = 0; i < BINS; i++) {
    const theta = hash(i) * Math.PI * 2;
    const el = (hash(i + 101) - 0.5) * 2;
    let dx = Math.cos(theta) * (1 - Math.abs(el) * 0.4);
    let dy = Math.sin(theta) * (1 - Math.abs(el) * 0.4) * 1.6; // vertical lean
    let dz = el * 0.7;
    const l = Math.hypot(dx, dy, dz) || 1;
    B.dx[i] = dx / l;
    B.dy[i] = dy / l;
    B.dz[i] = dz / l;
    const f = i / BINS; // low = warm, high = cool
    B.tint[i * 3 + 0] = 1.0 - f * 0.55;
    B.tint[i * 3 + 1] = 0.72 + Math.sin(f * Math.PI) * 0.2;
    B.tint[i * 3 + 2] = 0.5 + f * 0.5;
  }
  return B;
}

// live shot pool
interface Shots {
  ux: Float32Array;
  uy: Float32Array;
  uz: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  curl: Float32Array;
  L: Float32Array;
  s: Float32Array; // progress 0..1
  speed: Float32Array;
  alive: Uint8Array;
  tint: Float32Array; // SHOTS*3
}

function makeShots(): Shots {
  return {
    ux: new Float32Array(SHOTS),
    uy: new Float32Array(SHOTS),
    uz: new Float32Array(SHOTS),
    wx: new Float32Array(SHOTS),
    wy: new Float32Array(SHOTS),
    wz: new Float32Array(SHOTS),
    curl: new Float32Array(SHOTS),
    L: new Float32Array(SHOTS),
    s: new Float32Array(SHOTS),
    speed: new Float32Array(SHOTS),
    alive: new Uint8Array(SHOTS),
    tint: new Float32Array(SHOTS * 3),
  };
}

let rngSeed = 1;
function rnd() {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
  return rngSeed / 4294967296;
}

// spawn a shot for bin b into pool slot q
function spawnShot(S: Shots, B: Bins, q: number, b: number, amp: number) {
  // base direction + jitter (so many instances of one bin differ slightly)
  let ux = B.dx[b] + (rnd() - 0.5) * CORE.dirJitter;
  let uy = B.dy[b] + (rnd() - 0.5) * CORE.dirJitter;
  let uz = B.dz[b] + (rnd() - 0.5) * CORE.dirJitter;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // perpendicular curl direction w = normalize(u x random)
  const rx = rnd() - 0.5;
  const ry = rnd() - 0.5;
  const rz = rnd() - 0.5;
  let wx = uy * rz - uz * ry;
  let wy = uz * rx - ux * rz;
  let wz = ux * ry - uy * rx;
  const wl = Math.hypot(wx, wy, wz) || 1;

  S.ux[q] = ux;
  S.uy[q] = uy;
  S.uz[q] = uz;
  S.wx[q] = wx / wl;
  S.wy[q] = wy / wl;
  S.wz[q] = wz / wl;
  S.curl[q] = CORE.curlMin + rnd() * (CORE.curlMax - CORE.curlMin);
  S.L[q] = CORE.Lbase * amp * (0.8 + rnd() * 0.4);
  S.s[q] = 0;
  S.speed[q] = CORE.speed * (1 - CORE.speedVar + rnd() * CORE.speedVar * 2);
  S.alive[q] = 1;
  S.tint[q * 3 + 0] = B.tint[b * 3 + 0];
  S.tint[q * 3 + 1] = B.tint[b * 3 + 1];
  S.tint[q * 3 + 2] = B.tint[b * 3 + 2];
}

export default function GravityCore({ groupRef }: { groupRef?: Ref<THREE.Group> }) {
  const coreGroup = useRef<THREE.Group>(null!);
  const starRef = useRef<THREE.Sprite>(null!);
  const cursor = useRef(0);

  const starTex = useMemo(() => makeStarTexture(), []);
  const dotTex = useMemo(() => makeDotTexture(), []);

  const dotPos = useMemo(() => new Float32Array(DOTS * 3), []);
  const dotColor = useMemo(() => new Float32Array(DOTS * 3), []);
  const dotAlpha = useMemo(() => new Float32Array(DOTS), []);
  const dotSizeArr = useMemo(() => {
    const a = new Float32Array(DOTS);
    a.fill(CORE.dotSize);
    return a;
  }, []);

  const bins = useMemo(() => buildBins(), []);
  const shots = useMemo(() => makeShots(), []);

  // one shared geometry, drawn in 3 radially-offset R/G/B passes (baked CA)
  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(dotColor, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(dotAlpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(dotSizeArr, 1));
    const mk = (mask: [number, number, number], shift: number) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: dotTex },
          uMask: { value: new THREE.Vector3(...mask) },
          uShift: { value: shift },
        },
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Points(geo, mat);
      p.frustumCulled = false;
      p.renderOrder = 2;
      return p;
    };
    const list = [
      mk([1, 0, 0], -CORE.caShift),
      mk([0, 1, 0], 0),
      mk([0, 0, 1], CORE.caShift),
    ];
    return { geo, list };
  }, [dotPos, dotColor, dotAlpha, dotSizeArr, dotTex]);

  const starMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: starTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(5.5, 5.5, 5.8),
      }),
    [starTex],
  );

  useFrame(({ }, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    const { centerZ, scale, radius } = getOrbState();
    const anchorZ = centerZ + scale * radius;
    const { level, mid, treble } = sampleAudio();
    coreGroup.current.position.set(0, 0, anchorZ);

    const spec = sampleSpectrum();
    const n = Math.min(spec.length, BINS);
    const k = 1 - Math.exp(-dt / CORE.smooth);

    // --- emission: active bins spawn shots (louder/longer -> more) ---------
    for (let i = 0; i < BINS; i++) {
      const target = i < n ? expand(spec[i] / 255, CORE.floor) : 0;
      const a = bins.amp[i] + (target - bins.amp[i]) * k;
      bins.amp[i] = a;
      if (a < CORE.emitMinAmp) {
        bins.accum[i] = 0;
        continue;
      }
      bins.accum[i] += a * CORE.emitRate * dt;
      let guard = 0;
      while (bins.accum[i] >= 1 && guard < 5) {
        bins.accum[i] -= 1;
        spawnShot(shots, bins, cursor.current, i, a);
        cursor.current = (cursor.current + 1) % SHOTS;
        guard++;
      }
    }

    // --- advance + draw shots ---------------------------------------------
    for (let q = 0; q < SHOTS; q++) {
      const base = q * TRAIL;
      if (!shots.alive[q]) {
        for (let j = 0; j < TRAIL; j++) dotAlpha[base + j] = 0;
        continue;
      }
      const sp = shots.s[q] + shots.speed[q] * dt;
      if (sp >= 1) {
        shots.alive[q] = 0;
        for (let j = 0; j < TRAIL; j++) dotAlpha[base + j] = 0;
        continue;
      }
      shots.s[q] = sp;

      const ux = shots.ux[q];
      const uy = shots.uy[q];
      const uz = shots.uz[q];
      const wx = shots.wx[q];
      const wy = shots.wy[q];
      const wz = shots.wz[q];
      const curl = shots.curl[q];
      const L = shots.L[q];
      const tr = shots.tint[q * 3 + 0];
      const tg = shots.tint[q * 3 + 1];
      const tb = shots.tint[q * 3 + 2];

      for (let j = 0; j < TRAIL; j++) {
        const slot = base + j;
        const p = sp - (j / (TRAIL - 1)) * CORE.trailSpan;
        if (p < 0 || p > 1) {
          dotAlpha[slot] = 0;
          continue;
        }
        const ang = curl * p; // monotonic sweep -> teardrop/leaf loop
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const r = L * Math.sin(Math.PI * p); // out-and-back to the core
        const dx = ux * c + wx * sn;
        const dy = uy * c + wy * sn;
        const dz = uz * c + wz * sn;

        dotPos[slot * 3 + 0] = dx * r;
        dotPos[slot * 3 + 1] = dy * r * CORE.vertBias;
        dotPos[slot * 3 + 2] = dz * r;

        const headFade = 1 - j / TRAIL;
        const bright = (0.5 + headFade * 0.7) * CORE.hdr;
        dotAlpha[slot] = 0.3 + 0.7 * headFade;
        dotColor[slot * 3 + 0] = tr * bright;
        dotColor[slot * 3 + 1] = tg * bright;
        dotColor[slot * 3 + 2] = tb * bright;
      }
    }

    (points.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (points.geo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (points.geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    const s = 0.14 + level * 0.16 + mid * 0.16;
    starRef.current.scale.set(s * 3.2, s * 7.5 + mid * 1.4, 1);
    (starRef.current.material as THREE.SpriteMaterial).opacity = 0.85 + treble * 0.15;
  });

  return (
    <group ref={groupRef}>
      {points.list.map((p, i) => (
        <primitive key={i} object={p} />
      ))}
      <group ref={coreGroup}>
        <sprite ref={starRef} material={starMat} />
      </group>
    </group>
  );
}
