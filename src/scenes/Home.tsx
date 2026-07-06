import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";
import ColorBends from "../components/ColorBends";
import Orb from "../components/Orb";
import GravityCore from "../components/GravityCore";
import "../css/Home.css";

export default function Home() {
  return (
    <div className="background">
      <Canvas
        className="scene-canvas"
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        orthographic
        camera={{
          // left: -1,
          // right: 1,
          // top: 1,
          // bottom: -1,
          zoom: 100,
          near: 0.01,
          far: 100,
          position: [0, 0, 10],
        }}
      >
        <ambientLight intensity={0.2} />
        <directionalLight position={[3, 4, 5]} intensity={1} />
        <ColorBends />
        <Orb />
        <GravityCore />
        <EffectComposer>
          <Bloom
            intensity={0.9}
            luminanceThreshold={0.9}
            luminanceSmoothing={0.12}
            mipmapBlur
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new Vector2(0.004, 0.004)}
            radialModulation
            modulationOffset={0.08}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
