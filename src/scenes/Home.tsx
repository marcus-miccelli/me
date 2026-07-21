import { Canvas } from "@react-three/fiber";
import ColorBends from "../components/ColorBends";
import Orb from "../components/Orb";
// import GravityCore from "../components/GravityCore";
import "../css/Home.css";

type Props = {
  /** When false (another page is up) the scene is hidden and the frame loop
   *  stops — no GPU work, no WebGL context teardown/re-init on return. */
  active: boolean;
};

export default function Home({ active }: Props) {
  return (
    <div className={`background${active ? "" : " background--hidden"}`}>
      <Canvas
        className="scene-canvas"
        dpr={[1, 2]}
        frameloop={active ? "always" : "never"}
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
        {/* <GravityCore /> */}
      </Canvas>
    </div>
  );
}
