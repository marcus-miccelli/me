import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  NAME,
  PDF_NAME,
  PDF_PATH,
  SECTIONS,
  SEEKING,
  TAGLINE,
} from "../data/cv";
import type { Bullet } from "../data/cv";
import { ERAS, HERO, OBJECTIVES, SIGNOFF } from "../data/story";
import { goHome, pathWithoutHash } from "../hooks/useHashRoute";
import { CLIPS, LOCATORS, RULER, TRACKS } from "../data/arrangement";
import type { Clip } from "../data/arrangement";
import type { Era } from "../data/story";
import "../css/About.css";

const bulletsById = new Map<string, Bullet>(
  SECTIONS.flatMap((s) => s.entries)
    .flatMap((e) => e.bullets)
    .map((b) => [b.id, b]),
);

const erasById = new Map<string, Era>(ERAS.map((e) => [e.id, e]));

/** bulletId → the clip that carries it (for era-receipt cross-navigation). */
const clipByBullet = new Map<string, Clip>();
for (const clip of CLIPS) {
  for (const id of clip.bulletIds ?? []) clipByBullet.set(id, clip);
}

const SPAN = RULER.end - RULER.start;
const pos = (t: number) => `${((t - RULER.start) / SPAN) * 100}%`;
const width = (from: number, to: number) => `${((to - from) / SPAN) * 100}%`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Row index of a clip in TRACKS — used to stack the overview miniature. */
const rowOfClip = (clip: Clip) =>
  TRACKS.findIndex((t) => t.track === clip.track && t.lane === clip.lane);

const MAX_ZOOM = 14;

/** Live's fader range. Squaring the normalised value crowds the scale as
 * it falls away toward −inf and lands unity (0 dB) at ~85% of the travel,
 * which is where Live puts it. */
const DB_MIN = -70;
const DB_MAX = 6;

const faderTravel = (db: number) =>
  Math.pow(clamp((db - DB_MIN) / (DB_MAX - DB_MIN), 0, 1), 2);

/** …and back, for dragging. Full travel is exactly +6; the bottom of it
 * is −inf, not a number. */
const travelDb = (travel: number) => {
  if (travel <= 0.001) return -Infinity;
  const db = DB_MIN + (DB_MAX - DB_MIN) * Math.sqrt(clamp(travel, 0, 1));
  return Math.round(db * 10) / 10;
};

const dbLabel = (db: number) => (db === -Infinity ? "-inf" : db.toFixed(1));

/** Live prints pan as C, or 1–50 either side of centre. */
const panLabel = (pan: number) =>
  pan === 0 ? "C" : `${Math.round(Math.abs(pan) * 50)}${pan < 0 ? "L" : "R"}`;

/** Whole years — the only grid marks that need a DOM node (they carry the
 * label). Year and quarter *lines* are a repeating background driven by
 * --years; see About.css. */
const YEARS: number[] = [];
for (let y = Math.ceil(RULER.start); y <= Math.floor(RULER.end); y++) {
  YEARS.push(y);
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const fmtTime = (t: number) => {
  const year = Math.floor(t);
  return `${year} ${MONTHS[Math.min(11, Math.floor((t - year) * 12))]}`;
};

/** **bold** → <b>, [label](href) → an external link. */
const RICH = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function renderRich(text: string) {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of text.matchAll(RICH)) {
    const at = match.index ?? 0;
    if (at > cursor) {
      out.push(<Fragment key={key++}>{text.slice(cursor, at)}</Fragment>);
    }
    if (match[1]) {
      out.push(
        <a
          key={key++}
          className="cvw__link"
          href={match[2]}
          target="_blank"
          rel="noreferrer"
        >
          {match[1]}
        </a>,
      );
    } else {
      out.push(<b key={key++}>{match[3]}</b>);
    }
    cursor = at + match[0].length;
  }
  if (cursor < text.length) {
    out.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  }
  return out;
}

/** Placeholder copy (awaiting Marcus's own words) renders muted. */
const isPlaceholder = (text: string) => text.startsWith("[ placeholder");

/** Deterministic pseudo-waveform (FNV hash of the clip id — stable across
 * renders, no Math.random). Bar count scales with clip duration *and* the
 * zoom step so on-screen bar width stays constant instead of stretching
 * into blocks, and a slow swell modulates the noise so it reads as
 * zoomed-out audio, not static. */
const Waveform = memo(function Waveform({
  seed,
  duration,
  detail,
}: {
  seed: string;
  duration: number;
  detail: number;
}) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const phase = (h >>> 0) % 7;
  const count = clamp(Math.round(duration * 28 * detail), 8, 1400);
  const segments: string[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    const v = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    const swell = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.31 + phase));
    const amp = (0.12 + 0.88 * v * swell) * 11;
    segments.push(
      `M${(i + 0.2).toFixed(1)} ${(13 - amp).toFixed(1)}h0.6v${(amp * 2).toFixed(1)}h-0.6z`,
    );
  }
  return (
    <svg
      className="clip__wave"
      viewBox={`0 0 ${count} 26`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={segments.join("")} fill="currentColor" />
    </svg>
  );
});

type Selection =
  { kind: "clip"; id: string } | { kind: "era"; id: string } | null;

export default function About() {
  const [selected, setSelected] = useState<Selection>(null);
  /** Horizontal zoom of the arrangement — 1 = whole ruler fits the pane. */
  const [zoom, setZoom] = useState(1);
  const lastClearAt = useRef(0);
  const arrRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const rectRef = useRef<HTMLDivElement>(null);
  /** Header mixer pose — seeded from the data, then live. Nothing here is
   * routed anywhere; the strip just behaves like Live's. */
  const [mix, setMix] = useState<
    Record<
      string,
      {
        db: number;
        pan: number;
        on: boolean;
        solo: boolean;
        armed: boolean;
        folded: boolean;
      }
    >
  >(() =>
    Object.fromEntries(
      TRACKS.map((t) => [
        t.id,
        {
          db: t.db,
          pan: t.pan,
          on: true,
          solo: false,
          armed: !!t.armed,
          folded: false,
        },
      ]),
    ),
  );
  const mixDragRef = useRef<{
    id: string;
    kind: "db" | "pan";
    y: number;
    from: number;
  } | null>(null);
  /** Timeline fraction the viewport is centred on — survives zoom changes. */
  const centerRef = useRef(0.5);
  const dragRef = useRef<{ y: number; zoom: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected((current) => {
        if (current !== null) {
          lastClearAt.current = Date.now();
          return null;
        }
        // Don't eject to the menu on a reflexive double-Esc.
        if (Date.now() - lastClearAt.current > 600) {
          goHome();
        }
        return current;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Track headers are pinned to the RIGHT (Live-style), so the timeline
   * is everything left of them: scrollWidth minus one header column. */
  const metrics = () => {
    const arr = arrRef.current;
    if (!arr) return null;
    const gutter =
      arr.querySelector<HTMLElement>(".arr__gutter")?.clientWidth ?? 0;
    const total = arr.scrollWidth - gutter;
    const view = arr.clientWidth - gutter;
    return { arr, gutter, total, view };
  };

  /** Overview rectangle mirrors the visible slice of the timeline. */
  const syncRect = () => {
    const m = metrics();
    const rect = rectRef.current;
    if (!m || !rect) return;
    const frac = clamp(m.view / m.total, 0.03, 1);
    rect.style.width = `${frac * 100}%`;
    rect.style.left = `${clamp(m.arr.scrollLeft / m.total, 0, 1 - frac) * 100}%`;
    // keep the zoom anchor honest when the user scrolls by wheel/trackpad
    centerRef.current = clamp((m.arr.scrollLeft + m.view / 2) / m.total, 0, 1);
  };

  /** Scroll so centerRef sits mid-pane, then redraw the rectangle. */
  const applyView = () => {
    const m = metrics();
    if (!m) return;
    // whole pixels — a fractional scroll blurs every 1px rule in the grid
    m.arr.scrollLeft = Math.round(
      clamp(
        centerRef.current * m.total - m.view / 2,
        0,
        Math.max(0, m.total - m.view),
      ),
    );
    syncRect();
  };

  // Zoom changes the inner width — re-anchor the scroll in the same frame.
  useLayoutEffect(applyView, [zoom]);

  useEffect(() => {
    syncRect();
    window.addEventListener("resize", syncRect);
    return () => window.removeEventListener("resize", syncRect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Drag the overview: ↔ scrolls, ↕ zooms (up = in), like Live's. */
  const onOvwDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { y: event.clientY, zoom };
    const box = event.currentTarget.getBoundingClientRect();
    centerRef.current = clamp((event.clientX - box.left) / box.width, 0, 1);
    applyView();
  };

  const onOvwMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const box = event.currentTarget.getBoundingClientRect();
    centerRef.current = clamp((event.clientX - box.left) / box.width, 0, 1);
    const next = clamp(
      drag.zoom * Math.pow(1.011, drag.y - event.clientY),
      1,
      MAX_ZOOM,
    );
    if (Math.abs(next - zoom) > 0.002) setZoom(next);
    applyView();
  };

  const onOvwUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** Fader / pan drag — vertical and relative, the way every control in
   * Live moves: up raises, down lowers, and a click alone changes
   * nothing. Cosmetic; none of it is routed anywhere. */
  const onMixDown = (
    event: React.PointerEvent<HTMLSpanElement>,
    id: string,
    kind: "db" | "pan",
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    mixDragRef.current = {
      id,
      kind,
      y: event.clientY,
      from: kind === "db" ? faderTravel(mix[id].db) : mix[id].pan,
    };
  };

  /** 200px of drag covers the fader's whole travel, or pan hard to hard. */
  const onMixMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = mixDragRef.current;
    if (!drag) return;
    const dy = (drag.y - event.clientY) / 200;
    setMix((current) => ({
      ...current,
      [drag.id]: {
        ...current[drag.id],
        ...(drag.kind === "db"
          ? { db: travelDb(drag.from + dy) }
          : { pan: clamp(Math.round((drag.from + dy * 2) * 50) / 50, -1, 1) }),
      },
    }));
  };

  const toggleMix = (
    event: React.MouseEvent,
    id: string,
    key: "on" | "solo" | "armed" | "folded",
  ) => {
    event.stopPropagation();
    setMix((current) => ({
      ...current,
      [id]: { ...current[id], [key]: !current[id][key] },
    }));
  };

  /** Double-click restores the default, as it does on any Live control:
   * unity for the fader, centre for pan — both plain 0. */
  const resetMix = (
    event: React.MouseEvent,
    id: string,
    kind: "db" | "pan",
  ) => {
    event.stopPropagation();
    mixDragRef.current = null;
    setMix((current) => ({ ...current, [id]: { ...current[id], [kind]: 0 } }));
  };

  const onMixUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    mixDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** Playhead follows the pointer (ref-mutated — no re-renders) with a
   * live time readout. It hides under the pinned header column. */
  const onArrPointerMove = (event: React.PointerEvent) => {
    const m = metrics();
    const head = playheadRef.current;
    const readout = readoutRef.current;
    if (!m || !head || !readout) return;
    const box = m.arr.getBoundingClientRect();
    const x = event.clientX - box.left + m.arr.scrollLeft;
    if (x > m.total || event.clientX > box.right - m.gutter) {
      head.style.opacity = "0";
      readout.textContent = "";
      return;
    }
    head.style.opacity = "1";
    head.style.left = `${x}px`;
    readout.textContent = fmtTime(RULER.start + (x / m.total) * SPAN);
  };

  const onArrPointerLeave = () => {
    if (playheadRef.current) playheadRef.current.style.opacity = "0";
    if (readoutRef.current) readoutRef.current.textContent = "";
  };

  const selectedClip =
    selected?.kind === "clip"
      ? CLIPS.find((c) => c.id === selected.id)
      : undefined;
  const selectedEra =
    selected?.kind === "era" ? erasById.get(selected.id) : undefined;

  return (
    <div className="about">
      {/* ------------------- title bar ------------------- */}
      <header className="tb">
        <a
          className="tb__menu"
          href={pathWithoutHash(window.location)}
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          ← menu
        </a>
        <span className="tb__file">
          <span className="tb__dot" aria-hidden="true" />
          marcus_miccelli.als
        </span>
        <span className="tb__transport" aria-hidden="true">
          <span className="tb__box">140.00</span>
          <span className="tb__box">4 / 4</span>
          <span className="tb__box tb__box--readout">
            <span ref={readoutRef} />
          </span>
        </span>
        <a
          className="tb__export"
          href={PDF_PATH}
          download={PDF_NAME}
          title={`download ${PDF_NAME}`}
        >
          want my cv? ↓ pdf
        </a>
      </header>

      {/* --------- overview: drag ↔ to scroll, ↕ to zoom --------- */}
      <div
        className="ovw"
        onPointerDown={onOvwDown}
        onPointerMove={onOvwMove}
        onPointerUp={onOvwUp}
        onPointerCancel={onOvwUp}
        title="drag to scroll · drag up/down to zoom"
      >
        <div className="ovw__mini" aria-hidden="true">
          {CLIPS.map((clip) => (
            <span
              key={clip.id}
              className="ovw__clip"
              style={{
                left: pos(clip.from),
                width: width(clip.from, clip.to),
                top: `${(rowOfClip(clip) * 100) / TRACKS.length}%`,
                height: `${100 / TRACKS.length}%`,
                background: `var(--t-${clip.track})`,
              }}
            />
          ))}
        </div>
        <div className="ovw__rect" ref={rectRef} aria-hidden="true" />
      </div>

      {/* ------------------- arrangement ------------------- */}
      <div
        className="arr"
        ref={arrRef}
        onScroll={syncRect}
        onPointerMove={onArrPointerMove}
        onPointerLeave={onArrPointerLeave}
      >
        {/* clicking anywhere that isn't a clip or locator clears the selection */}
        <div
          className="arr__inner"
          style={{ "--zoom": zoom, "--years": SPAN } as React.CSSProperties}
          onClick={() => setSelected(null)}
        >
          {/* ruler */}
          <div className="arr__row arr__row--ruler">
            <div className="arr__gutter" aria-hidden="true" />
            <div className="arr__lane ruler">
              {YEARS.map((y) => (
                <span key={y} className="ruler__tick" style={{ left: pos(y) }}>
                  <em>{y}</em>
                </span>
              ))}
              {selectedClip && (
                <span
                  className="ruler__brace"
                  style={{
                    left: pos(selectedClip.from),
                    width: width(selectedClip.from, selectedClip.to),
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          {/* locators — the story's eras */}
          <div className="arr__row arr__row--locators">
            <div className="arr__gutter" aria-hidden="true" />
            <div className="arr__lane locators">
              {LOCATORS.map((locator) => {
                const era = erasById.get(locator.eraId);
                if (!era) return null;
                const open =
                  selected?.kind === "era" && selected.id === locator.eraId;
                return (
                  <button
                    key={locator.eraId}
                    type="button"
                    className={`locator${open ? " is-sel" : ""}`}
                    style={{ left: pos(locator.at) }}
                    aria-pressed={open}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(
                        open ? null : { kind: "era", id: locator.eraId },
                      );
                    }}
                  >
                    {era.title.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* tracks — one header per row, on the right, like Live */}
          {TRACKS.map((track, ti) => {
            const clips = CLIPS.filter(
              (c) => c.track === track.track && c.lane === track.lane,
            );
            const m = mix[track.id];
            return (
              <div
                className={`arr__row arr__row--track${m.on ? "" : " is-off"}${
                  m.folded ? " is-folded" : ""
                }`}
                key={track.id}
                style={
                  { "--tint": `var(--t-${track.track})` } as React.CSSProperties
                }
              >
                <div className="arr__gutter arr__gutter--track">
                  {/* the colour block, full row height, like Live's */}
                  <span className="tk">
                    <button
                      type="button"
                      className={`tk__fold${m.folded ? " is-folded" : ""}`}
                      aria-expanded={!m.folded}
                      aria-label={`fold ${track.name}`}
                      onClick={(e) => toggleMix(e, track.id, "folded")}
                    />
                    <span className="tk__name">
                      {ti + 1} {track.name}
                    </span>
                  </span>
                  {/* to its right, on a two-column grid: activator over the
                   * fader, solo + arm over the pan. All live, all inert. */}
                  <span className="mix">
                    <button
                      type="button"
                      className={`mix__act${m.on ? "" : " is-off"}`}
                      aria-pressed={m.on}
                      aria-label={`${track.name} track on`}
                      onClick={(e) => toggleMix(e, track.id, "on")}
                    >
                      {ti + 1}
                    </button>
                    <span className="mix__pair">
                      <button
                        type="button"
                        className={`mix__btn${m.solo ? " is-solo" : ""}`}
                        aria-pressed={m.solo}
                        aria-label={`${track.name} solo`}
                        onClick={(e) => toggleMix(e, track.id, "solo")}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        className={`mix__btn mix__arm${
                          m.armed ? " is-armed" : ""
                        }`}
                        aria-pressed={m.armed}
                        aria-label={`${track.name} record arm`}
                        onClick={(e) => toggleMix(e, track.id, "armed")}
                      />
                    </span>
                    <span
                      className="mix__slider mix__vol"
                      aria-hidden="true"
                      style={
                        { "--v": faderTravel(m.db) } as React.CSSProperties
                      }
                      onPointerDown={(e) => onMixDown(e, track.id, "db")}
                      onPointerMove={onMixMove}
                      onPointerUp={onMixUp}
                      onPointerCancel={onMixUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => resetMix(e, track.id, "db")}
                    >
                      <b />
                      <em>{dbLabel(m.db)}</em>
                    </span>
                    <span
                      className="mix__slider mix__pan"
                      aria-hidden="true"
                      style={
                        {
                          "--pl": `${m.pan < 0 ? 50 + m.pan * 50 : 50}%`,
                          "--pw": `${Math.abs(m.pan) * 50}%`,
                        } as React.CSSProperties
                      }
                      onPointerDown={(e) => onMixDown(e, track.id, "pan")}
                      onPointerMove={onMixMove}
                      onPointerUp={onMixUp}
                      onPointerCancel={onMixUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => resetMix(e, track.id, "pan")}
                    >
                      <b />
                      <em>{panLabel(m.pan)}</em>
                    </span>
                  </span>
                </div>
                <div className="arr__lane track">
                  {clips.map((clip) => {
                    const open =
                      selected?.kind === "clip" && selected.id === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        className={`clip${open ? " is-sel" : ""}${
                          clip.ongoing ? " clip--ongoing" : ""
                        }`}
                        style={{
                          left: pos(clip.from),
                          width: width(clip.from, clip.to),
                        }}
                        title={clip.label}
                        aria-pressed={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(
                            open ? null : { kind: "clip", id: clip.id },
                          );
                        }}
                      >
                        <span className="clip__strip">
                          {clip.short ?? clip.label}
                        </span>
                        <Waveform
                          seed={clip.id}
                          duration={clip.to - clip.from}
                          detail={Math.round(zoom)}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* the drop-zone gray below the last track */}
          <div className="arr__dead" aria-hidden="true" />

          <div className="playhead" ref={playheadRef} aria-hidden="true" />
        </div>
      </div>

      {/* ------------------- clip view ------------------- */}
      <section
        className="cvw"
        aria-live="polite"
        style={
          selectedClip
            ? ({
                "--tint": `var(--t-${selectedClip.track})`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {selectedClip ? (
          <>
            <div className="cvw__meta">
              <h2 className="cvw__name">{selectedClip.label}</h2>
              <p className={`cvw__tag cvw__tag--${selectedClip.track}`}>
                {selectedClip.track}
              </p>
              <div className="cvw__fields">
                <span className="cvw__field">
                  <b>start</b>
                  {fmtTime(selectedClip.from)}
                </span>
                <span className="cvw__field">
                  <b>end</b>
                  {selectedClip.ongoing ? "wip" : fmtTime(selectedClip.to)}
                </span>
                <span className="cvw__field">
                  <b>length</b>
                  {(selectedClip.to - selectedClip.from).toFixed(1)}
                  {selectedClip.ongoing ? "+" : ""} yr
                </span>
              </div>
              {selectedClip.meta && (
                <p className="cvw__sub">{selectedClip.meta}</p>
              )}
            </div>
            <div className="cvw__body">
              <div className="cvw__cols">
                {(selectedClip.bulletIds ?? []).map((id) => {
                  const bullet = bulletsById.get(id);
                  if (!bullet) return null;
                  return (
                    <div className="cvw__item" key={id}>
                      <p className="cvw__line">‣ {renderRich(bullet.text)}</p>
                      {bullet.more?.body.map((p, i) => (
                        <p key={i} className="cvw__note">
                          {p}
                        </p>
                      ))}
                    </div>
                  );
                })}
                {!selectedClip.bulletIds?.length && (
                  <p className="cvw__note">
                    off the record — this one predates the cv.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : selectedEra ? (
          <>
            <div className="cvw__meta">
              <h2 className="cvw__name cvw__name--era">
                {selectedEra.title.toLowerCase()}
              </h2>
              <p className="cvw__tag cvw__tag--era">locator</p>
              <div className="cvw__fields">
                <span className="cvw__field">
                  <b>span</b>
                  {selectedEra.years.toLowerCase()}
                </span>
              </div>
            </div>
            <div className="cvw__body">
              <div className="cvw__cols">
                {selectedEra.body.map((p, i) => (
                  <p
                    key={i}
                    className={`cvw__line${isPlaceholder(p) ? " is-ph" : ""}`}
                  >
                    {p}
                  </p>
                ))}
                {selectedEra.pull && (
                  <p
                    className={`cvw__pull${
                      isPlaceholder(selectedEra.pull) ? " is-ph" : ""
                    }`}
                  >
                    {selectedEra.pull}
                  </p>
                )}
                {selectedEra.receipts?.map((receipt) => {
                  const clip = clipByBullet.get(receipt.bulletId);
                  if (!clip) return null;
                  return (
                    <button
                      key={receipt.bulletId}
                      type="button"
                      className="cvw__ref"
                      onClick={() => setSelected({ kind: "clip", id: clip.id })}
                    >
                      → {clip.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cvw__meta">
              <h2 className="cvw__name cvw__name--era">{NAME.toLowerCase()}</h2>
              <p className="cvw__tag cvw__tag--info">info</p>
              <p className="cvw__sub">
                {TAGLINE} {SEEKING}
              </p>
            </div>
            <div className="cvw__body">
              <div className="cvw__cols">
                <p className="cvw__quote">“{HERO.quote}”</p>
                <ul className="cvw__objectives">
                  {OBJECTIVES.map((o) => (
                    <li key={o.key}>
                      <b>{o.key.toLowerCase()}</b>{" "}
                      <span className={isPlaceholder(o.text) ? "is-ph" : ""}>
                        {o.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <p
                  className={`cvw__line${
                    isPlaceholder(SIGNOFF) ? " is-ph" : ""
                  }`}
                >
                  {SIGNOFF}
                </p>
                <p className="cvw__hint">
                  click a clip or locator · esc clears, then exits
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
