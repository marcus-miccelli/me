import ColourBends from "./components/ColorBends"

function App() {
  return (
    <div className="background">
      <ColourBends
            colors= {["#ffffff"]}
            transparent={false}
            rotation={90}
            autoRotate={0}
            speed={0.2}
            scale={1}
            frequency={1}
            warpStrength={1}
            mouseInfluence={1}
            parallax={0.5}
            noise={0.10}
            iterations={1}
            intensity={1.5}
            bandWidth={6}
          />
    </div>
    
  )
}

export default App