import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame, type ThreeElements } from "@react-three/fiber";

export default function Orb() {
  const myMesh = useRef<THREE.Mesh>(null!);
  const { viewport, camera } = useThree();

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();

    const radius = 1;

    const halfW = viewport.width / 2;
    const halfH = viewport.height / 2;

    const max = Math.sqrt(halfW * halfW + halfH * halfH) / radius;
    const min = (Math.min(viewport.width, viewport.height) * 0.2) / radius;

    const avg = (max + min) / 2;
    const mid = (max - min) / 2;

    const scale = avg + Math.cos(t / 4) * mid;

    myMesh.current.scale.setScalar(scale);

    // keep the camera outside the sphere
    const padding = 0.5;
    myMesh.current.position.z =
      camera.position.z - (scale * radius + camera.near + padding);
  });
  return (
    <mesh ref={myMesh} position={[0, 0, 0]} renderOrder={1}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0} />
    </mesh>
  );
}
