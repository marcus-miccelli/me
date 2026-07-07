import { describe, it, expect, beforeEach } from "vitest";
import { rawBands, expand, setAnalyser, sampleAudio } from "./audioBus";

function bins(fill: (i: number, n: number) => number, n = 100): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = fill(i, n);
  return a;
}

describe("rawBands", () => {
  it("full spectrum -> all bands 1", () => {
    const b = rawBands(bins(() => 255));
    expect(b.level).toBeCloseTo(1, 5);
    expect(b.bass).toBeCloseTo(1, 5);
    expect(b.mid).toBeCloseTo(1, 5);
    expect(b.treble).toBeCloseTo(1, 5);
  });

  it("silence -> all bands 0", () => {
    expect(rawBands(bins(() => 0))).toEqual({
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
    });
  });

  it("bass is the PEAK bin, not diluted by averaging", () => {
    const b = rawBands(bins((i) => (i === 3 ? 255 : 0))); // one loud bass bin
    expect(b.bass).toBeCloseTo(1, 5);
    expect(b.treble).toBe(0);
    expect(b.bass).toBeGreaterThan(b.mid);
  });
});

describe("expand (contrast floor)", () => {
  it("maps [floor, 1] onto [0, 1]", () => {
    expect(expand(0.75, 0.75)).toBeCloseTo(0, 5);
    expect(expand(1, 0.75)).toBeCloseTo(1, 5);
    expect(expand(0.875, 0.75)).toBeCloseTo(0.5, 5);
  });
  it("clamps below the floor to 0 and above 1 to 1", () => {
    expect(expand(0.5, 0.75)).toBe(0);
    expect(expand(2, 0.75)).toBe(1);
  });
});

describe("sampleAudio", () => {
  beforeEach(() => setAnalyser(null));
  it("returns zeros with no analyser", () => {
    expect(sampleAudio()).toEqual({ level: 0, bass: 0, mid: 0, treble: 0 });
  });
});
