import { describe, it, expect, beforeEach } from "vitest";
import { getOrbState, setOrbState } from "./orbBus";

describe("orbBus", () => {
  beforeEach(() => setOrbState(0, 1, 1));

  it("defaults are sane", () => {
    const s = getOrbState();
    expect(s.centerZ).toBe(0);
    expect(s.scale).toBe(1);
    expect(s.radius).toBe(1);
  });

  it("setOrbState updates fields; radius defaults to previous", () => {
    setOrbState(5, 3);
    const s = getOrbState();
    expect(s.centerZ).toBe(5);
    expect(s.scale).toBe(3);
    expect(s.radius).toBe(1);
  });

  it("returns a stable reference (singleton)", () => {
    expect(getOrbState()).toBe(getOrbState());
  });
});
