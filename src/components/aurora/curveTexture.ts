import * as THREE from "three";
import type { BeamCurve } from "./curve";

/**
 * The RGBA float payload for the curve texture: one texel per sample carrying
 * `(x, y, theta, kappa)` in the canonical (R,T) frame. Kept as a seam so the
 * channel layout has one authority.
 */
export function packCurve(curve: BeamCurve): Float32Array {
  return curve.samples;
}

/**
 * A 1×N RGBA float DataTexture of the baked curve, for vertex-shader sampling.
 * NearestFilter (no float-linear-filter dependency) — the shader lerps by hand.
 */
export function makeCurveTexture(curve: BeamCurve): THREE.DataTexture {
  const n = curve.samples.length / 4;
  const tex = new THREE.DataTexture(
    packCurve(curve),
    n,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
