import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import AuroraBeam from "./AuroraBeam";

const vertexShader = `
varying vec3 vNormal;
varying vec3 vObjectNormal;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  vNormal = normalize(normalMatrix * normal);
  vObjectNormal = normalize(normal);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uGrainColor;
uniform vec3 uDustColor;

varying vec3 vNormal;
varying vec3 vObjectNormal;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.52;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.08 + vec3(3.17, 1.91, 4.63);
    amplitude *= 0.48;
  }

  return value;
}

float ridged(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 4; i++) {
    float n = noise(p);
    value += amplitude * (1.0 - abs(n * 2.0 - 1.0));
    p = p * 2.32 + vec3(1.73, 4.21, 2.57);
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 objectNormal = normalize(vObjectNormal);

  float radial = clamp(length(normal.xy), 0.0, 1.0);
  float slowSpin = uTime * 0.024;
  vec3 p = objectNormal * 5.25;
  p.xy = mat2(cos(slowSpin), -sin(slowSpin), sin(slowSpin), cos(slowSpin)) * p.xy;

  float charcoal = fbm(p * 1.45 + vec3(0.0, 0.0, uTime * 0.008));
  float grit = ridged(p * 6.4 - vec3(0.0, uTime * 0.012, 0.0));
  float pores = ridged(p * 12.5 + vec3(1.1, 0.0, -uTime * 0.008));
  float hairline = ridged(p * 24.0 + vec3(0.0, 2.4, uTime * 0.004));
  float flecks = hash(floor(objectNormal * 150.0));
  float microFlecks = hash(floor(objectNormal * 310.0 + vec3(7.0, 3.0, 11.0)));
  float screenGrain = hash(vec3(floor(gl_FragCoord.xy * 1.45), floor(uTime * 9.0)));

  float coarseGrain = charcoal * 0.065 + grit * 0.09 + pores * 0.06;
  float fineGrain = hairline * 0.055 + smoothstep(0.58, 0.98, flecks) * 0.09;
  fineGrain += smoothstep(0.72, 0.995, microFlecks) * 0.07;
  float powder = (screenGrain - 0.5) * 0.1;
  float pits = smoothstep(0.48, 0.86, pores) * smoothstep(0.08, 0.68, radial);

  float light = max(dot(objectNormal, normalize(vec3(-0.55, 0.42, 0.46))), 0.0);
  float bodyShade = 0.18 + light * 0.34;
  float centerVoid = 1.0 - smoothstep(0.08, 0.36, radial + (charcoal - 0.5) * 0.05);
  float edgeFade = 1.0 - smoothstep(0.7, 0.99, radial);
  float outerBlack = smoothstep(0.82, 1.0, radial);

  vec3 col = uBaseColor * (0.55 + bodyShade);
  col += uGrainColor * max(coarseGrain + fineGrain + powder, 0.0) * (0.72 + bodyShade);
  col += uDustColor * smoothstep(0.62, 1.0, screenGrain) * 0.018;
  col = mix(col, vec3(0.0), pits * 0.46);
  col = mix(col, vec3(0.0), centerVoid * 0.42);
  col *= edgeFade;
  col = mix(col, vec3(0.0), outerBlack * 0.92);
  col = clamp(col, 0.0, 0.14);

  gl_FragColor = vec4(col, 1.0);
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
      uBaseColor: { value: new THREE.Color("#030303") },
      uGrainColor: { value: new THREE.Color("#77736a") },
      uDustColor: { value: new THREE.Color("#2f2d2a") },
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
      <mesh ref={myMesh} renderOrder={1}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />

        {/*
          Children of the orb mesh: the beams inherit the orb's rotation.z
          and pulsing scale, so their anchors stay locked to the orb-local
          points (-1, 0, 0) and (1, 0, 0).
        */}
        <AuroraBeam
          side="left"
          brightness={1.1}
          speed={3.5}
          bandSpread={2.6}
          noiseAmplitude={3}
          color1="#f7f7f7"
          color2="#e100ff"
          phase={0}
        />
        <AuroraBeam
          side="right"
          brightness={1.1}
          speed={3.5}
          bandSpread={2.6}
          noiseAmplitude={3}
          color1="#f7f7f7"
          color2="#66f7ff"
          layerOffset={0.6}
          phase={17.3}
        />
      </mesh>
    </group>
  );
}


