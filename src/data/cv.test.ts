import { describe, expect, it } from "vitest";
import { SECTIONS } from "./cv";

const allBullets = SECTIONS.flatMap((s) => s.entries).flatMap((e) => e.bullets);
const allEntries = SECTIONS.flatMap((s) => s.entries);

describe("cv data integrity", () => {
  it("has globally unique ids across sections, entries and bullets", () => {
    const ids = [
      ...SECTIONS.map((s) => s.id),
      ...allEntries.map((e) => e.id),
      ...allBullets.map((b) => b.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every marginalia a title and non-empty body", () => {
    for (const bullet of allBullets) {
      if (!bullet.more) continue;
      expect(bullet.more.title.length).toBeGreaterThan(0);
      expect(bullet.more.body.length).toBeGreaterThan(0);
      for (const p of bullet.more.body) expect(p.length).toBeGreaterThan(0);
    }
  });

  it("has balanced ** bold markers in every bullet", () => {
    for (const bullet of allBullets) {
      const markers = bullet.text.split("**").length - 1;
      expect(markers % 2).toBe(0);
    }
  });

  it("uses en dashes in date ranges, not em dashes", () => {
    for (const entry of allEntries) {
      if (entry.kind === "role") expect(entry.right).not.toContain("—");
    }
  });

  /** credly is deliberately allowed — a credential index, not a contact
   * channel, and the CV links it in the same breath. */
  it("contains no plaintext contact details for scrapers", () => {
    const blob = JSON.stringify({ SECTIONS }).toLowerCase();
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/linkedin\.com/);
    expect(blob).not.toMatch(/github\.com/);
    expect(blob).not.toMatch(/\+61/);
  });
});
