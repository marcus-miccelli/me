/**
 * Shared orb-state bus. `Orb` publishes its live center-z and scale each frame;
 * `GravityCore` reads them to derive its rest anchor. Mirrors the audioBus
 * singleton pattern because React Context can't cross the R3F reconciler cleanly.
 */
export interface OrbState {
  /** World-space z of the orb's center. */
  centerZ: number;
  /** Uniform scale applied to the unit sphere. */
  scale: number;
  /** Base (unscaled) orb radius, world units. */
  radius: number;
}

const state: OrbState = { centerZ: 0, scale: 1, radius: 1 };

export function setOrbState(centerZ: number, scale: number, radius?: number): void {
  state.centerZ = centerZ;
  state.scale = scale;
  if (radius !== undefined) state.radius = radius;
}

export function getOrbState(): OrbState {
  return state;
}
