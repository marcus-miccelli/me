import Home from "./scenes/Home";
import AudioPlayer from "./components/AudioPlayer";
import { MainMenu } from "./components/MainMenu"

function App() {
  return (
    <>
      <AudioPlayer />
      <Home />
      <MainMenu />
    </>
  );
}

export default App;
