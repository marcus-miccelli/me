/**
 * Shared audio-analysis bus. `AudioPlayer` registers the live `AnalyserNode`
 * here; any component (including R3F components inside <Canvas>, which React
 * Context can't reach across the reconciler boundary) reads levels per frame:
 *
 *   import { sampleAudio } from "../audio/audioBus";
 *   useFrame(() => {
 *     const { level, bass, mid, treble } = sampleAudio();
 *     mesh.scale.setScalar(1 + bass * 0.3);
 *   });
 *
 * Responsiveness comes from three things:
 *  1. bass uses the PEAK bin (a kick concentrates energy — averaging buries it);
 *  2. each band is contrast-expanded through a per-band FLOOR (real tracks sit
 *     at a high, compressed baseline — remap baseline->0, loud->1 so impacts
 *     actually swing);
 *  3. an instant-attack / exponential-release envelope makes a hit spike then
 *     fall off, reading as a punch rather than a mush.
 * Tune FLOOR (contrast) and RELEASE (decay) to taste.
 */

let analyser: AnalyserNode | null = null;
let freq = new Uint8Array(0);

export interface AudioBands {
  /** Overall loudness, 0..1. */
  level: number;
  /** Low band (peak), 0..1. */
  bass: number;
  /** Mid band, 0..1. */
  mid: number;
  /** High band, 0..1. */
  treble: number;
}

// split points across the frequency bins (bins run low->high frequency)
const BASS_END = 0.08;
const MID_END = 0.35;

/** Pure spectrum -> raw bands (peak bass, average mid/treble/level). */
export function rawBands(freq: Uint8Array): AudioBands {
  const n = freq.length;
  if (n === 0) return { level: 0, bass: 0, mid: 0, treble: 0 };

  const bassEnd = Math.max(1, Math.floor(n * BASS_END));
  const midEnd = Math.max(bassEnd + 1, Math.floor(n * MID_END));

  let bassPeak = 0;
  let m = 0;
  let t = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i] / 255;
    sum += v;
    if (i < bassEnd) {
      if (v > bassPeak) bassPeak = v;
    } else if (i < midEnd) {
      m += v;
    } else {
      t += v;
    }
  }
  return {
    level: sum / n,
    bass: bassPeak,
    mid: m / (midEnd - bassEnd),
    treble: t / (n - midEnd),
  };
}

// contrast floor per band: values below FLOOR read as 0, so the loud region
// uses the full 0..1 swing. Higher = punchier / more gated.
const FLOOR: AudioBands = { level: 0.15, bass: 0.75, mid: 0.2, treble: 0.15 };
// envelope time constants (s): fast rise (ATTACK), slower fall (RELEASE).
// RELEASE is the real decay knob — larger = longer tail after a hit.
const ATTACK = 0.012;
const RELEASE = 0.1;

const bands: AudioBands = { level: 0, bass: 0, mid: 0, treble: 0 };
let lastMs = 0;

export function setAnalyser(node: AnalyserNode | null) {
  analyser = node;
  freq = node ? new Uint8Array(node.frequencyBinCount) : new Uint8Array(0);
  bands.level = bands.bass = bands.mid = bands.treble = 0;
  lastMs = 0;
}

/** Contrast expansion: map [floor, 1] -> [0, 1], clamped. */
export const expand = (v: number, floor: number) =>
  Math.min(1, Math.max(0, (v - floor) / (1 - floor)));

// One-pole envelope follower: move `cur` toward `target` with a time constant
// that is short on the way up (ATTACK) and long on the way down (RELEASE). The
// `1 - exp(-dt/tau)` coefficient makes it frame-rate independent. This replaces
// the old peak-hold max(): it tracks the signal both up AND down, so the decay
// actually controls the fall instead of getting stuck on the last peak.
function follow(cur: number, target: number, dt: number): number {
  const tau = target > cur ? ATTACK : RELEASE;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

/**
 * Read the current spectrum into contrast-expanded, envelope-followed bands
 * (0..1). Cheap; safe to call multiple times per frame. Zeros until audio plays.
 */
export function sampleAudio(): AudioBands {
  if (!analyser) return bands;
  analyser.getByteFrequencyData(freq);
  const raw = rawBands(freq);

  const now = performance.now();
  const dt = lastMs ? Math.min((now - lastMs) / 1000, 0.1) : 0;
  lastMs = now;

  bands.level = follow(bands.level, expand(raw.level, FLOOR.level), dt);
  bands.bass = follow(bands.bass, expand(raw.bass, FLOOR.bass), dt);
  bands.mid = follow(bands.mid, expand(raw.mid, FLOOR.mid), dt);
  bands.treble = follow(bands.treble, expand(raw.treble, FLOOR.treble), dt);
  return bands;
}
