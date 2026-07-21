import { useEffect, useRef } from "react";
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
 *
 * The component is route-aware via props: `enabled=false` fades the track out
 * and suspends the context (about/projects/gallery are silent); `muted` fades
 * the gain without suspending, so unmuting rejoins the live position.
 */
const LOOP_START = 5; // seconds (0:000 start, loop from 5:000 to end)
const FADE = 0.09; // gain fade time constant (s)
const SUSPEND_AFTER_MS = 450; // let the fade finish before suspending

type Props = {
  enabled: boolean;
  muted: boolean;
  /** Fires once, when the track actually starts producing sound. */
  onStarted?: () => void;
};

export default function AudioPlayer({ enabled, muted, onStarted }: Props) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const mutedRef = useRef(muted);
  const onStartedRef = useRef(onStarted);
  const suspendTimer = useRef<number | null>(null);

  enabledRef.current = enabled;
  mutedRef.current = muted;
  onStartedRef.current = onStarted;

  useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    ctxRef.current = ctx;
    gainRef.current = gain;
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
    let disposed = false;

    const start = () => {
      if (disposed || startedRef.current || !buffer || ctx.state !== "running")
        return;
      startedRef.current = true;
      gain.gain.value = mutedRef.current ? 0 : 1;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = Math.min(LOOP_START, buffer.duration);
      source.loopEnd = buffer.duration;
      source.connect(gain);
      source.start(0, 0); // begin at 0:000
      onStartedRef.current?.();
    };

    const onGesture = () => {
      // no sound on the silent routes — the next gesture on home starts it
      if (!enabledRef.current || startedRef.current) return;
      void ctx.resume().then(start);
    };

    void fetch(audioUrl)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        if (disposed) return;
        buffer = buf;
        if (!enabledRef.current) return;
        void ctx.resume().then(start); // try now; else a gesture will start it
      });

    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      disposed = true;
      startedRef.current = false;
      ctxRef.current = null;
      gainRef.current = null;
      if (suspendTimer.current !== null) {
        window.clearTimeout(suspendTimer.current);
        suspendTimer.current = null;
      }
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

  // Route gate: fade out and suspend when leaving home; resume and fade back
  // in (unless muted) when returning.
  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    if (suspendTimer.current !== null) {
      window.clearTimeout(suspendTimer.current);
      suspendTimer.current = null;
    }
    if (!startedRef.current) return;

    if (enabled) {
      void ctx.resume().then(() => {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(
          mutedRef.current ? 0 : 1,
          ctx.currentTime,
          FADE,
        );
      });
    } else {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, FADE);
      suspendTimer.current = window.setTimeout(() => {
        suspendTimer.current = null;
        void ctx.suspend();
      }, SUSPEND_AFTER_MS);
    }
  }, [enabled]);

  // Mute gate: gain only, playback position keeps advancing.
  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain || !startedRef.current || !enabled) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, FADE);
  }, [muted, enabled]);

  return null;
}
