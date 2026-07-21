import { describe, expect, it } from "vitest";
import { SECTIONS } from "./cv";
import { ERAS, HERO, OBJECTIVES, SIGNOFF } from "./story";

const bulletsById = new Map(
  SECTIONS.flatMap((s) => s.entries)
    .flatMap((e) => e.bullets)
    .map((b) => [b.id, b]),
);

describe("story data integrity", () => {
  it("resolves every receipt to a cv bullet with marginalia", () => {
    for (const era of ERAS) {
      for (const receipt of era.receipts ?? []) {
        const bullet = bulletsById.get(receipt.bulletId);
        expect(bullet, receipt.bulletId).toBeDefined();
        expect(bullet?.more, receipt.bulletId).toBeDefined();
      }
    }
  });

  it("has unique era ids and non-empty bodies", () => {
    const ids = ERAS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const era of ERAS) {
      expect(era.body.length).toBeGreaterThan(0);
      for (const p of era.body) expect(p.length).toBeGreaterThan(0);
    }
  });

  it("contains no plaintext contact details for scrapers", () => {
    const blob = JSON.stringify({
      HERO,
      ERAS,
      OBJECTIVES,
      SIGNOFF,
    }).toLowerCase();
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/linkedin\.com/);
    expect(blob).not.toMatch(/github\.com/);
    expect(blob).not.toMatch(/\+61/);
  });
});
