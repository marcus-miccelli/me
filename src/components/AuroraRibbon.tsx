import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  float edgeFade = smoothstep(0.0, 0.35, vUv.y) *
                   (1.0 - smoothstep(0.65, 1.0, vUv.y));

  float endFade = smoothstep(0.0, 0.18, vUv.x) *
                  (1.0 - smoothstep(0.82, 1.0, vUv.x));

  float wave = 0.5 + 0.5 * sin(vUv.x * 18.0 + uTime * 1.2);
  vec3 color = mix(uColorA, uColorB, wave);

  float alpha = edgeFade * endFade * uOpacity;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

function makeRibbonGeometry() {
  const samples = 120;
  const length = 4.2;
  const baseWidth = 0.52;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const x = (u - 0.5) * length;

    const wobble =
      Math.sin(u * Math.PI * 2.0) * 0.2 + Math.sin(u * Math.PI * 7.0) * 0.055;

    const width = baseWidth * (0.75 + 0.35 * Math.sin(u * Math.PI));

    positions.push(x, wobble + width, -0.12);
    positions.push(x, wobble - width, -0.12);

    uvs.push(u, 1);
    uvs.push(u, 0);
  }

  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export default function AuroraRibbon() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const geometry = useMemo(() => makeRibbonGeometry(), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color("#66f7ff") },
      uColorB: { value: new THREE.Color("#ff35d4") },
      uOpacity: { value: 0.85 },
    }),
    [],
  );

  useFrame(({ clock }) => {
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh geometry={geometry} renderOrder={0}>
      <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      transparent
      depthWrite={false}
      depthTest={true}
      side={THREE.DoubleSide}
      blending={THREE.AdditiveBlending}
    />
    </mesh>
  );
}
