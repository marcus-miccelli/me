import { describe, expect, it } from "vitest";
import { CLIPS, LOCATORS, RULER, TRACKS } from "./arrangement";
import { SECTIONS } from "./cv";
import { ERAS } from "./story";

const bulletIds = new Set(
  SECTIONS.flatMap((s) => s.entries)
    .flatMap((e) => e.bullets)
    .map((b) => b.id),
);
const eraIds = new Set(ERAS.map((e) => e.id));
/** A track row is a (category, lane) pair — that pair is what the header
 * column renders, so a clip addressing a pair with no row is invisible. */
const rowKeys = new Set(TRACKS.map((t) => `${t.track}:${t.lane}`));

describe("arrangement data integrity", () => {
  it("gives every track row a unique id", () => {
    const ids = TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rowKeys.size).toBe(TRACKS.length);
  });

  it("puts every track row to use", () => {
    for (const track of TRACKS) {
      const clips = CLIPS.filter(
        (c) => c.track === track.track && c.lane === track.lane,
      );
      expect(clips.length, `${track.id} has no clips`).toBeGreaterThan(0);
    }
  });

  it("has unique clip ids on known tracks with valid spans", () => {
    const ids = CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const clip of CLIPS) {
      expect(rowKeys.has(`${clip.track}:${clip.lane}`), clip.id).toBe(true);
      expect(clip.lane).toBeGreaterThanOrEqual(0);
      expect(clip.from, clip.id).toBeLessThan(clip.to);
      expect(clip.from, clip.id).toBeGreaterThanOrEqual(RULER.start);
      expect(clip.to, clip.id).toBeLessThanOrEqual(RULER.end);
    }
  });

  it("never overlaps two clips in the same lane of a track", () => {
    for (const a of CLIPS) {
      for (const b of CLIPS) {
        if (a.id >= b.id) continue;
        if (a.track !== b.track || a.lane !== b.lane) continue;
        const overlaps = a.from < b.to && b.from < a.to;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("resolves every clip bullet to a cv bullet", () => {
    for (const clip of CLIPS) {
      for (const id of clip.bulletIds ?? []) {
        expect(bulletIds.has(id), `${clip.id} → ${id}`).toBe(true);
      }
    }
  });

  it("resolves every locator to an era, in chronological order", () => {
    let last = -Infinity;
    for (const locator of LOCATORS) {
      expect(eraIds.has(locator.eraId), locator.eraId).toBe(true);
      expect(locator.at).toBeGreaterThan(last);
      last = locator.at;
    }
  });

  it("contains no plaintext contact details for scrapers", () => {
    const blob = JSON.stringify({ CLIPS, LOCATORS, TRACKS }).toLowerCase();
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/linkedin\.com/);
    expect(blob).not.toMatch(/github\.com/);
    expect(blob).not.toMatch(/\+61/);
  });
});
