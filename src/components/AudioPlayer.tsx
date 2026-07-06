import { useEffect } from "react";
import audioUrl from "../assets/portfolio lq.mp3";
import { setAnalyser } from "../audio/audioBus";

/**
 * Plays the portfolio track from the very start (0:000), then loops the region
 * [LOOP_START, end] forever — so the intro plays once and the body loops.
 *
 * Uses the Web Audio API (rather than <audio loop>) because it supports custom
 * loop points and gives us an AudioContext to hang analysis off later for the
 * audio-reactive orb/beams.
 *
 * Browsers block audible autoplay until a user gesture, so playback starts on
 * the first pointer/key interaction if it can't start immediately.
 */
const LOOP_START = 5; // seconds (0:000 start, loop from 5:000 to end)

export default function AudioPlayer() {
  useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    // source -> gain -> analyser -> destination. AnalyserNode is a pass-through,
    // so audio is unchanged; it just taps the signal for the reactive visuals.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // keep this low: the audioBus envelope follower does the smoothing/decay.
    // high analyser smoothing double-smooths and masks the envelope's release.
    analyser.smoothingTimeConstant = 0.2;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    setAnalyser(analyser);

    let buffer: AudioBuffer | null = null;
    let source: AudioBufferSourceNode | null = null;
    let started = false;
    let disposed = false;

    const start = () => {
      if (disposed || started || !buffer || ctx.state !== "running") return;
      started = true;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = Math.min(LOOP_START, buffer.duration);
      source.loopEnd = buffer.duration;
      source.connect(gain);
      source.start(0, 0); // begin at 0:000
    };

    const onGesture = () => {
      void ctx.resume().then(start);
    };

    void fetch(audioUrl)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        if (disposed) return;
        buffer = buf;
        void ctx.resume().then(start); // try now; else a gesture will start it
      });

    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      disposed = true;
      setAnalyser(null);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      try {
        source?.stop();
      } catch {
        // already stopped
      }
      void ctx.close();
    };
  }, []);

  return null;
}
