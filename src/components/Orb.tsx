import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import AuroraRibbon from "./AuroraRibbon";

const vertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  vNormal = normalize(normalMatrix * normal);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
  fresnel = pow(fresnel, 2.0);

  float pulse = 0.5 + 0.5 * sin(uTime * 1.5);

  vec3 base = mix(uColorA, uColorB, vUv.y);
  base += fresnel * vec3(0.5, 0.8, 1.0);
  base += pulse * 0.08;

  gl_FragColor = vec4(base, 1.0);
}
`;

export default function Orb() {
  const myMesh = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const { viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color("#b03bf3") },
      uColorB: { value: new THREE.Color("#88ccff") },
    }),
    [],
  );

  useFrame(({ clock, camera }) => {
    const mesh = myMesh.current;
    const material = materialRef.current;

    const t = clock.getElapsedTime();

    const radius = 1;

    const halfW = viewport.width / 2;
    const halfH = viewport.height / 2;

    const max = Math.sqrt(halfW * halfW + halfH * halfH) / radius;
    const min = (Math.min(viewport.width, viewport.height) * 0.2) / radius;

    const avg = (max + min) / 2;
    const mid = (max - min) / 2;

    const scale = avg + Math.cos(t / 4) * mid;

    mesh.scale.setScalar(scale);

    const padding = 0.5;
    mesh.position.z =
      camera.position.z - (scale * radius + camera.near + padding);

    mesh.rotation.z += 0.001;

    material.uniforms.uTime.value = t;
  });

  return (
    <group ref={groupRef}>
      <AuroraRibbon />
      <mesh ref={myMesh} renderOrder={1}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>
      
    </group>
  );
}
