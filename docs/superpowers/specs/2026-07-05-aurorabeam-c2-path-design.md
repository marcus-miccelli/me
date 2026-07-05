# AuroraBeam C² Path — Design

Date: 2026-07-05
Component: `src/components/AuroraBeam.tsx`

## Problem

The beam centre-line is built from three analytic pieces — straight approach,
circular fillet, rim-hugging wrap — joined **C1** (position + tangent continuous)
but **not C2**: curvature jumps at each seam.

Measured (right side, top branch, approachLen = 1):

- **J1 approach→fillet:** κ `0 → −2.22`
- **J2 fillet→wrap:** κ `−2.22 → +1.02` (a **sign flip** — an inflection)

Per branch there are two seams; J1 is shared by both branches of a fork (the
apex), J2 fires on each branch — the **three critical points per fork** the user
observes, forming a triangle. A circular arc can *never* meet a straight line
with curvature continuity (κ = 0 vs 1/R by definition), so no repositioning of a
circular fillet fixes it.

The current mitigation is a Gaussian low-pass over the centre-line
(`smoothPath`). It removes the gross creases but is an approximation, costs many
`pathPoint` evaluations per vertex, and its residual is visible as faint
mini-creases. We want the joins to be continuous **by construction**.

## Decisions (agreed)

- **Keep the S-bulge.** The beam should still flare outward, then wrap in. So the
  transition is a **C² reverse curve**: κ goes `0 → negative (flare) → smoothly
  through 0 (inflection) → +κ_rim`. No jumps, look preserved.
- **Phase 1** — implement the C² fix on the current **left/right fork**
  structure. **Phase 2 (optional, deferred)** — experiment with a top/bottom
  beam restructure and A/B it. Out of scope here.
- **Method** — define the curved centre-line by a **continuous curvature
  profile** and bake it on the CPU; sample it in the vertex shader. Chosen over
  clothoid (needs Fresnel in-shader) and Bézier (needs a quintic + fragile
  control-point algebra for exact endpoint curvature). A curvature profile
  expresses the reverse curve directly and is C² by construction, with the flare
  as a tunable knob.

## Architecture

Two units with a clean interface between them.

### 1. CPU curve builder (`buildBeamCurve`, memoized)

Pure function of the geometry props (not per-frame). Produces the baked
**curved region** = transition + wrap, as an arclength-parametrised polyline.

Inputs (props): `skim`, `wrapAngle`, `wrapTightness`, `flareDepth`,
`flareLength` (the last two replace `forkRadius`). Independent of `approachLen`
(the pulse) — the curved region is pulse-invariant, so it bakes once and re-bakes
only when a prop changes.

Curvature profile κ(s), s = arclength from the transition start:

Define `κ_rim ≡ 1/(1 + skim)` — the curvature of a circle hugging the standoff
radius, i.e. the wrap's curvature at φ=0. Pinning the transition's end curvature
to this value is what makes the transition→wrap join continuous.

- **Transition** `s ∈ [0, L_t]`: smooth `0 → κ_rim` with a negative excursion.
  Concretely `κ(s) = κ_rim · h(s/L_t) − c_flare · b(s/L_t)`, where `h` is a
  smootherstep (0→1) and `b` is a unit hump that is 0 at both ends
  (e.g. `sin²(π·x)`). Gives `κ(0)=0` (matches the straight approach) and
  `κ(L_t)=κ_rim`, dipping negative in between (the flare).
- **Wrap** `s ∈ [L_t, L_total]`: `κ = 1/rr` with `rr = 1 + skim·decay(φ)`,
  `decay = exp(−tightness·φ·smoothstep(0,0.5,φ))` (current wrap behaviour). φ is
  the wrap angle swept so far. `κ(L_t)=κ_rim=1/(1+skim)` matches the wrap start
  (`decay(0)=1`), so the whole profile is C⁰ in κ end-to-end → the curve is
  **C²** throughout.

Integrate along arclength: `θ(s) = θ0 + ∫κ`, `p(s) = p0 + ∫(cosθ, sinθ)`.

**Knobs vs solver unknowns.** Art-facing props: `flareLength` (the transition
arclength `L_t`, how far along the beam the flare extends) and `flareDepth` (a
bias on the flare's outward reach). The transition starts on the side's radial
axis at radius `a` with radial heading (κ=0). The CPU **solver** adjusts the two
free internal parameters — the approach-end radius `a` and the flare coefficient
`c_flare` — via a 2×2 Newton to satisfy two constraints at `s = L_t`: endpoint
radius `= 1 + skim`, and heading tangential (⊥ radius). `flareDepth` seeds/bounds
`c_flare`; `flareLength` fixes `L_t`. (Exact knob↔unknown split may be refined in
the plan, but the intent is: user sets flare *shape*, solver guarantees the
curve *lands* on the rim tangentially.) `a` is thus a build **output** — the
shader's straight run ends there. Wrap then integrates until the swept angle
reaches `wrapAngle`, giving `L_total` and the tail.

Output: `Float32Array` of N≈128 samples, each `(x, y, θ, κ)`, uniform in
arclength; plus scalars `a` (approach-end radius) and `L_total` (curved
arclength). Uploaded as an RGBA `FloatType` `DataTexture` (128×1). *Fallback if
vertex-texture-fetch is a problem: a uniform `vec4[128]` array.*

### 2. Vertex shader (revised `pathPoint`)

The path is `approach (analytic) ++ curved (sampled)`, parametrised by total
arclength `D = u_warped · (approachLen + L_total)` (the existing arclength
tessellation warp is unchanged).

- `D < approachLen` → **approach**: radial point at radius `a + (approachLen−D)`
  along the side's radial axis; `θ` = radial heading; `κ = 0`; `z = 0`. (Keeps
  the animated approach sway, gated by `shim`, as today.)
- else → **curved**: `arc = D − approachLen`; sample the texture at
  `arc / L_total` → `(x, y, θ, κ)`. `pos.xy = (x,y)`; `sideDir = (−sinθ, cosθ)`;
  `z = −wrapDepth · bow(φ)²` analytic from wrap progress; add wrap shimmer
  (`shim`-gated). `κ` feeds the width-cap directly.

Everything downstream is unchanged: **arclength tessellation warp**, **offset
curvature width-cap** (`cappedHW = desiredHW / sqrt(1 + (desiredHW·κ/SAFETY)²)`,
now fed the exact baked κ — no finite-difference, no smoothing), **tail width
taper**, **shimmer via `shim`**, occlusion, fwidth noise-AA, MSAA.

**Removed:** `smoothPath` (the low-pass) and the circular-fillet branch of
`pathPoint`. The multi-tap `pathPoint` calls per vertex collapse to a single
texture fetch for the curved region.

## Data flow / pulse

- **Bake time** (prop change only): `buildBeamCurve` → `DataTexture`.
- **Per frame:** only `approachLen` (from the pulse) and `uTime` (shimmer/noise)
  change. The baked curve is static. Both beams (left/right) share one baked
  texture; `uSide`/`uBranch` mirror it via the existing radial/tangent basis.

## Continuity guarantee

C² holds by construction: κ(s) is continuous (C⁰) end to end, so the integrated
curve is C². J1 and J2 no longer exist as seams — there is a single continuous
curved region. No smoothing kernel, so no piecewise-linear curvature kinks
(the mini-creases) remain.

## Testing / verification

- **Numeric:** assert the baked κ array is continuous (max adjacent Δκ below a
  threshold) and endpoints (`κ[0]=0`, tangential landing) within tolerance.
- **Visual (frozen debug harness — freeze pulse scale + time via `window.__dbg`,
  full page reload after shader edits):** sweep scales ≈2–8 and several time
  phases; confirm at each fork and along the wrap there are no creases, hooks,
  notches, fans, or mini-creases; confirm full-width beams preserved and the
  S-bulge silhouette retained.
- **Perf:** vertex texture fetch replaces ~20 `pathPoint` calls/vertex — expect
  a net reduction; sanity-check frame time.
- **Before/after** screenshots at a fixed frozen frame.

## Out of scope (Phase 2, later)

Top/bottom beam restructure (removes the shared-approach fork apex at the cost of
doubled straight approaches). Separate design + A/B.

## Risks

- **Vertex texture fetch / float textures** — WebGL2 guarantees both; fallback is
  a uniform `vec4[128]` array.
- **Solver robustness** — 2×2 Newton; add iteration cap + a sane analytic initial
  guess (seed from the current fillet geometry). If it fails to converge for
  extreme props, clamp knobs and warn.
- **Look shift** — flare knobs are tuned to reproduce the current S-bulge
  silhouette as the default; verify against before/after.
