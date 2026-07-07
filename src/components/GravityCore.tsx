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
  caUV: 0.16, // per-dot chromatic aberration: R/B sprite-UV split (0..~0.4)
  // petal blend mode. "additive" = original glow (adds to the scene). "difference"
  // = abs(backdrop - petal): inverts over the bright orb, stays visible on black.
  // Difference grabs the framebuffer each frame (see the points' onBeforeRender).
  blendMode: "difference" as "additive" | "difference",
  hdr: 2.4, // HDR gain on dot colour so shots clear the bloom threshold (>1)
  // petal emanation radius = orbScale * (1 - norm) * rimPush. norm 1 (orb large)
  // -> 0: every petal starts and ends at a single centre point. norm 0 (orb
  // small) -> the sphere rim: petals appear to come out of the sphere's edges.
  rimPush: 1.0,
  // star inverse-breath: the central core swings opposite the orb (big core when
  // orb small, tiny when orb large) — the primary thing that grows/shrinks.
  starSmallOrb: 3.6,
  starBigOrb: 0.2,
};

function hash(n: number) {
  return (((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1) + 1) % 1;
}

// Single-pass shot dots. Chromatic aberration is folded in per-dot: the R and B
// channels sample the dot sprite at UVs offset along the point's screen-radial
// direction (vDir), so each dot fringes red/blue without needing 3 draw passes.
// One pass lets us swap the blend mode cleanly (additive / subtractive / custom).
const particleVert = `
attribute float aAlpha;
attribute vec3 aColor;
attribute float aSize;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vDir;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec2 d = position.xy;
  vDir = length(d) > 0.0001 ? normalize(d) : vec2(1.0, 0.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// uDiff switches output: 0 = plain colour (additive blend adds it to the scene);
// 1 = Photoshop "Difference" = abs(backdrop - source). The backdrop is the scene
// rendered so far (grabbed to uBackdrop before this pass), sampled at screen UV.
// With NormalBlending the result reads as true difference where the dot is opaque
// and leaves the backdrop untouched where it's transparent. abs() means petals
// stay visible on black (|0 - c| = c) yet invert over the bright orb.
const particleFrag = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uBackdrop;
uniform vec2 uResolution;
uniform float uCA;
uniform float uDiff;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vDir;
void main() {
  vec2 uv = gl_PointCoord;
  vec2 o = vDir * uCA;
  float rr = texture2D(uTex, uv + o).r;
  vec4  gg = texture2D(uTex, uv);
  float bb = texture2D(uTex, uv - o).b;
  vec3 tex = vec3(rr, gg.g, bb);
  vec3 col = vColor * tex;
  float a = gg.a * vAlpha;
  if (uDiff > 0.5) {
    vec3 bg = texture2D(uBackdrop, gl_FragCoord.xy / uResolution).rgb;
    gl_FragColor = vec4(abs(bg - col), a);
  } else {
    gl_FragColor = vec4(col, a);
  }
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

export default function GravityCore({
  groupRef,
}: {
  groupRef?: Ref<THREE.Group>;
}) {
  const coreGroup = useRef<THREE.Group>(null!);
  const petalGroup = useRef<THREE.Group>(null!);
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

  // difference-mode backdrop: a copy of the rendered scene, grabbed between the
  // main-scene render and the petal composite in the manual render loop below.
  const backdropTex = useRef<THREE.FramebufferTexture | null>(null);
  const drawSize = useRef(new THREE.Vector2());

  // one geometry, one pass. CA is folded into the fragment shader (per-dot R/B
  // UV split); the blend mode is chosen from CORE.blendMode.
  const points = useMemo(() => {
    const diff = CORE.blendMode === "difference";
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(dotColor, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(dotAlpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(dotSizeArr, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: dotTex },
        uCA: { value: CORE.caUV },
        uBackdrop: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uDiff: { value: diff ? 1 : 0 },
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      // difference composites over the backdrop (NormalBlending); additive glows.
      blending: diff ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    // difference must not depth-test against the orb (orb is nearer the camera);
    // it composites over the already-rendered backdrop instead.
    if (diff) mat.depthTest = false;
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    p.renderOrder = 2;
    return { geo, mat, diff, list: [p] };
  }, [dotPos, dotColor, dotAlpha, dotSizeArr, dotTex]);

  // In difference mode the petals render in their own scene so we can composite
  // them AFTER grabbing the backdrop (grabbing mid-scene-render corrupts the
  // frame). In additive mode they render inline via JSX and this is unused.
  const petalScene = useMemo(
    () => (points.diff ? new THREE.Scene() : null),
    [points.diff],
  );

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

  useFrame(
    (state, rawDelta) => {
      const dt = Math.min(rawDelta, 1 / 30);
      const { centerZ, scale, radius, norm } = getOrbState();
      const anchorZ = centerZ + scale * radius;
      const { level, mid, treble } = sampleAudio();
      coreGroup.current.position.set(0, 0, anchorZ);

      // star inverse breath: big core when orb small (norm 0), tiny when orb large.
      const Fstar =
        CORE.starSmallOrb + (CORE.starBigOrb - CORE.starSmallOrb) * norm;
      // petal base radius: 0 when orb large (all from one centre point) -> the orb
      // rim when orb small (petals emanate from the sphere's edge).
      const r0 = scale * (1 - norm) * CORE.rimPush;

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

          // translate the whole petal outward along its base direction u by r0, so
          // its start/end anchor sits on the sphere rim (small orb) or at the centre
          // point (large orb) instead of always at the origin.
          dotPos[slot * 3 + 0] = ux * r0 + dx * r;
          dotPos[slot * 3 + 1] = (uy * r0 + dy * r) * CORE.vertBias;
          dotPos[slot * 3 + 2] = uz * r0 + dz * r;

          const headFade = 1 - j / TRAIL;
          const bright = (0.5 + headFade * 0.7) * CORE.hdr;
          dotAlpha[slot] = 0.3 + 0.7 * headFade;
          dotColor[slot * 3 + 0] = tr * bright;
          dotColor[slot * 3 + 1] = tg * bright;
          dotColor[slot * 3 + 2] = tb * bright;
        }
      }

      (
        points.geo.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;
      (points.geo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate =
        true;
      (points.geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate =
        true;

      const s = 0.14 + level * 0.16 + mid * 0.16;
      starRef.current.scale.set(
        s * 3.2 * Fstar,
        (s * 7.5 + mid * 1.4) * Fstar,
        1,
      );
      (starRef.current.material as THREE.SpriteMaterial).opacity =
        0.85 + treble * 0.15;

      // --- difference-mode manual render (priority 1 takes over R3F's render) ---
      // 1) render the scene (petals live in petalScene, so they're excluded)
      // 2) copy the finished framebuffer into a texture — safe BETWEEN renders
      // 3) composite the petals on top; their shader reads the backdrop copy and
      //    outputs abs(backdrop - petal). No feedback loop, no mid-render grab.
      if (petalScene) {
        const { gl, scene, camera } = state;
        // parent the petals into their own scene (idempotent; done here rather than
        // in useMemo so it survives React StrictMode's double-invoke of the memo).
        const petal = points.list[0];
        if (petal.parent !== petalScene) petalScene.add(petal);

        gl.autoClear = true;
        gl.render(scene, camera);

        gl.getDrawingBufferSize(drawSize.current);
        const w = drawSize.current.x;
        const h = drawSize.current.y;
        let tex = backdropTex.current;
        if (!tex || tex.image.width !== w || tex.image.height !== h) {
          tex?.dispose();
          tex = new THREE.FramebufferTexture(w, h);
          backdropTex.current = tex;
        }
        gl.copyFramebufferToTexture(tex);
        points.mat.uniforms.uBackdrop.value = tex;
        points.mat.uniforms.uResolution.value.set(w, h);

        gl.autoClear = false;
        gl.render(petalScene, camera);
        gl.autoClear = true;
      }
    },
    points.diff ? 1 : 0,
  );

  return (
    <group ref={groupRef}>
      <group ref={petalGroup}>
        {!points.diff &&
          points.list.map((p, i) => <primitive key={i} object={p} />)}
      </group>
      <group ref={coreGroup}>
        <sprite ref={starRef} material={starMat} />
      </group>
    </group>
  );
}
