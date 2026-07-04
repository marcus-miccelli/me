import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import '../css/Orb.css';



export default function Orb() {
    return (
    <mesh>
      <sphereGeometry />
      <meshStandardMaterial />
    </mesh>
  );
}