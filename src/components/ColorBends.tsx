import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAudio } from "../audio/audioBus";

const MAX_COLORS = 8 as const;
const POINTER_SMOOTHING = 8;

const frag = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;

  vec2 rp = vec2(
    p.x * uRot.x - p.y * uRot.y,
    p.x * uRot.y + p.y * uRot.x
  );

  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;

  vec2 toward = uPointer - rp;
  q += toward * uMouseInfluence * 0.2;

  for (int j = 0; j < 5; j++) {
    if (j >= uIterations - 1) break;
    vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
    q += (rr - q) * 0.15;
  }

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;

    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;

      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));

      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);

      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;

      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));

      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }

    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;

    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));

      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);

      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;

      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);

      col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
    }

    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  col *= uIntensity;

  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = uTransparent > 0 ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`;

const vert = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

type ColorBendsProps = {
  rotation?: number;
  speed?: number;
  colors?: string[];
  transparent?: boolean;
  autoRotate?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  parallax?: number;
  noise?: number;
  iterations?: number;
  intensity?: number;
  bandWidth?: number;
};

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

export default function ColorBends({
  rotation = 90,
  speed = 0.2,
  colors = ["#ffffff"],
  transparent = false,
  autoRotate = 0,
  scale = 1,
  frequency = 1,
  warpStrength = 1,
  mouseInfluence = 0,
  parallax = 0,
  noise = 0.1,
  iterations = 1,
  intensity = 1.5,
  bandWidth = 6,
}: ColorBendsProps) {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointerTargetRef = useRef(new THREE.Vector2(0, 0));
  const pointerCurrentRef = useRef(new THREE.Vector2(0, 0));

  const { gl, size } = useThree();

  const uniforms = useMemo(
    () => ({
      uCanvas: { value: new THREE.Vector2(size.width, size.height) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uRot: { value: new THREE.Vector2(1, 0) },
      uColorCount: { value: 0 },
      uColors: {
        value: Array.from(
          { length: MAX_COLORS },
          () => new THREE.Vector3(0, 0, 0),
        ),
      },
      uTransparent: { value: transparent ? 1 : 0 },
      uScale: { value: scale },
      uFrequency: { value: frequency },
      uWarpStrength: { value: warpStrength },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uMouseInfluence: { value: mouseInfluence },
      uParallax: { value: parallax },
      uNoise: { value: noise },
      uIterations: { value: iterations },
      uIntensity: { value: intensity },
      uBandWidth: { value: bandWidth },
    }),
    [],
  );

  useEffect(() => {
    gl.setClearColor(0x000000, transparent ? 0 : 1);
  }, [gl, transparent]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();

      const x = ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
      const y = -(((event.clientY - rect.top) / (rect.height || 1)) * 2 - 1);

      pointerTargetRef.current.set(x, y);
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [gl]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;

    const nextColors = colors
      .filter(Boolean)
      .slice(0, MAX_COLORS)
      .map(hexToVec3);

    for (let i = 0; i < MAX_COLORS; i++) {
      const target = material.uniforms.uColors.value[i] as THREE.Vector3;
      target.copy(nextColors[i] ?? new THREE.Vector3(0, 0, 0));
    }

    material.uniforms.uColorCount.value = nextColors.length;
  }, [colors]);

  useFrame(({ clock }, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const elapsed = clock.elapsedTime;

    pointerCurrentRef.current.lerp(
      pointerTargetRef.current,
      Math.min(1, delta * POINTER_SMOOTHING),
    );

    const deg = (rotation % 360) + autoRotate * elapsed;
    const rad = (deg * Math.PI) / 180;

    const { level, bass, treble } = sampleAudio();

    material.uniforms.uTime.value = elapsed;
    material.uniforms.uCanvas.value.set(size.width, size.height);
    material.uniforms.uRot.value.set(Math.cos(rad), Math.sin(rad));
    material.uniforms.uPointer.value.copy(pointerCurrentRef.current);

    material.uniforms.uSpeed.value = speed;
    material.uniforms.uScale.value = scale;
    material.uniforms.uFrequency.value = frequency;
    material.uniforms.uWarpStrength.value = warpStrength + (0.001 * bass);
    material.uniforms.uMouseInfluence.value = mouseInfluence;
    material.uniforms.uParallax.value = parallax;
    material.uniforms.uNoise.value = noise - (1 * level + 2 * treble);
    material.uniforms.uIterations.value = iterations;
    material.uniforms.uIntensity.value = intensity + (3 * level + 5 * bass);
    material.uniforms.uBandWidth.value = bandWidth + (3 * level + 5 * bass);
    material.uniforms.uTransparent.value = transparent ? 1 : 0;
  });

  return (
    <mesh renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent={transparent}
        premultipliedAlpha={transparent}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
