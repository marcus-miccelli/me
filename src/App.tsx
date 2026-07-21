import { useState } from "react";
import Home from "./scenes/Home";
import About from "./scenes/About";
import AudioPlayer from "./components/AudioPlayer";
import { GooDefs } from "./components/GooDefs";
import { MainMenu } from "./components/MainMenu";
import { MuteButton } from "./components/MuteButton";
import { SocialDock } from "./components/SocialDock";
import { useHashRoute } from "./hooks/useHashRoute";

function App() {
  const route = useHashRoute();
  const [muted, setMuted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const onHome = route === "home";

  return (
    <>
      <GooDefs />
      <AudioPlayer
        enabled={onHome}
        muted={muted}
        onStarted={() => setAudioOn(true)}
      />
      <Home active={onHome} />
      {onHome && <MainMenu />}
      {route === "about" && <About />}
      <SocialDock paper={route === "about"} />
      <MuteButton
        show={audioOn && onHome}
        muted={muted}
        onToggle={() => setMuted((m) => !m)}
      />
    </>
  );
}

export default App;
