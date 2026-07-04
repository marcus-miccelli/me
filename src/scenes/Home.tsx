import { Canvas } from "@react-three/fiber";
import ColorBends from "../components/ColorBends";
import Orb from "../components/Orb";
import "../css/Home.css";

export default function Home() {
  return (
    <div className="background">
      <Canvas
        className="scene-canvas"
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: false,
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
      </Canvas>
    </div>
  );
}
