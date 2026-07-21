import { useRef } from "react";
import { burstGoo } from "../lib/goo";

const REBURST_MS = 700;
import "../css/goo.css";
import "../css/MuteButton.css";

function SpeakerOnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M15.5 8.5a5 5 0 0 1 0 7m2.7-10a9 9 0 0 1 0 13"
      />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="m15 9 6 6m0-6-6 6"
      />
    </svg>
  );
}

type Props = {
  /** Fades in once the soundtrack actually starts, on sonic pages only. */
  show: boolean;
  muted: boolean;
  onToggle: () => void;
};

/** Circular mute disc in the bottom-right corner — island material, gooey
 *  burst on toggle, kept apart from the contact island. */
export function MuteButton({ show, muted, onToggle }: Props) {
  const gooRef = useRef<HTMLSpanElement>(null);
  const lastBurstAt = useRef(0);

  const hoverBurst = () => {
    const now = performance.now();
    if (now - lastBurstAt.current < REBURST_MS) return;
    lastBurstAt.current = now;
    if (gooRef.current) burstGoo(gooRef.current);
  };

  return (
    <button
      type="button"
      className={`mute-btn${show ? "" : " is-hidden"}`}
      onMouseEnter={hoverBurst}
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute music" : "Mute music"}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
    >
      <span className="goo-filter" ref={gooRef} aria-hidden="true" />
      <span className="mute-btn__stamp">
        {muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
      </span>
      <span className="mute-btn__label">{muted ? "unmute" : "mute"}</span>
    </button>
  );
}
