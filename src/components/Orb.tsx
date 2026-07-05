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
precision highp float;

uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform float uColorNum;
uniform float uPixelSize;
uniform float uNoise;
uniform vec3 uBaseColor;
uniform vec3 uWaveColor;

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

float waveFbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;

  for (int i = 0; i < 4; i++) {
    value += amp * abs(noise(vec3(p, uTime * 0.025)) * 2.0 - 1.0);
    p *= uWaveFrequency;
    amp *= uWaveAmplitude;
  }

  return value;
}

float wavePattern(vec2 p) {
  vec2 drift = vec2(uTime * uWaveSpeed, -uTime * uWaveSpeed * 0.7);
  float warp = waveFbm(p - drift);
  return waveFbm(p + vec2(warp * 0.85, -warp * 0.55));
}

float bayer2(vec2 p) {
  p = mod(floor(p), 2.0);
  return 2.0 * p.x + 3.0 * p.y - 4.0 * p.x * p.y;
}

float bayer8(vec2 p) {
  p = floor(p);
  float coarse = bayer2(floor(p / 4.0)) * 16.0;
  float mid = bayer2(floor(p / 2.0)) * 4.0;
  float fine = bayer2(p);
  return (coarse + mid + fine) / 64.0;
}

float colorBendsNoise(vec2 coord) {
  return fract(sin(dot(coord + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
}

float orderedDither(float value) {
  vec2 pixel = floor(gl_FragCoord.xy / max(uPixelSize, 1.0));
  float threshold = bayer8(pixel) - 0.5;
  float levels = max(uColorNum - 1.0, 2.0);
  value += threshold / levels;
  return floor(clamp(value, 0.0, 1.0) * levels + 0.5) / levels;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 objectNormal = normalize(vObjectNormal);

  float radial = clamp(length(normal.xy), 0.0, 1.0);
  float spin = uTime * 0.025;
  vec2 p = objectNormal.xy * 1.15 + objectNormal.z * vec2(0.18, -0.12);
  p = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p;

  float waves = wavePattern(p);
  float grain = colorBendsNoise(gl_FragCoord.xy * 0.92);
  float dust = colorBendsNoise(floor(gl_FragCoord.xy / 2.0) * 2.0 + 19.0);
  float fineGrain = colorBendsNoise(gl_FragCoord.xy * 1.9 + vec2(41.0, 17.0));

  float body = smoothstep(0.16, 1.15, waves);
  body = pow(body, 1.35);
  body += (grain - 0.5) * uNoise * 0.45;
  body += (dust - 0.5) * uNoise * 0.25;

  float centerSink = 1.0 - smoothstep(0.05, 0.42, radial + (waves - 0.5) * 0.055);
  float edgeFade = 1.0 - smoothstep(0.68, 1.0, radial);
  float outerBlack = smoothstep(0.84, 1.0, radial);

  float value = body * 0.3 + 0.014;
  value = mix(value, 0.0, centerSink * 0.28);
  value = orderedDither(value);

  float surfaceMask = smoothstep(0.08, 0.48, radial);
  float filmGrain = (grain - 0.5) * uNoise * 0.8;
  filmGrain += (dust - 0.5) * uNoise * 0.45;
  filmGrain += (fineGrain - 0.5) * uNoise * 0.55;
  value = clamp(value + filmGrain * surfaceMask, 0.0, 1.0);

  value *= edgeFade;
  value = mix(value, 0.0, outerBlack * 0.95);
  value = clamp(value, 0.0, 0.2);

  vec3 col = mix(uBaseColor, uWaveColor, value);
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
      uWaveSpeed: { value: 0.25 },
      uWaveFrequency: { value: 2.1 },
      uWaveAmplitude: { value: 0.43 },
      uColorNum: { value: 32.4 },
      uPixelSize: { value: 1.0 },
      uNoise: { value: 0.10 },
      uBaseColor: { value: new THREE.Color("#ffffff") },
      uWaveColor: { value: new THREE.Color("#000000") },
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
          color2="#1900ff"
          phase={0}
        />
        <AuroraBeam
          side="right"
          brightness={1.1}
          speed={3.5}
          bandSpread={2.6}
          noiseAmplitude={3}
          color1="#f7f7f7"
          color2="#c41515"
          layerOffset={0.6}
          phase={17.3}
        />
      </mesh>
    </group>
  );
}



