import { useEffect, useRef, useState } from "react";
import { getEmail, getGitHubUrl, getLinkedInUrl } from "../lib/contact";
import { burstGoo, placeGoo } from "../lib/goo";
import "../css/goo.css";
import "../css/SocialDock.css";

type CopyState = "idle" | "copied" | "failed";

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5M.2 8.25h4.6V23H.2zm7.68 0h4.41v2.02h.06c.61-1.16 2.11-2.38 4.35-2.38 4.65 0 5.51 3.06 5.51 7.04V23h-4.6v-7.25c0-1.73-.03-3.96-2.41-3.96-2.41 0-2.78 1.88-2.78 3.83V23h-4.6z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 19 19" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        d="M3 5.5h18v13H3zm.5.5 8.5 7 8.5-7"
      />
    </svg>
  );
}

/**
 * Floating "reach me" dock, persistent across pages. Deliberately not styled
 * like navigation: small muted stamps on an oval island at the top centre,
 * external-arrow cues on the links, and a copy action (not a link) for email.
 * Clicking any stamp fires a gooey particle burst (ReactBits GooeyNav-style).
 */
export function SocialDock({ paper = false }: { paper?: boolean }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  // Profile URLs stay out of the DOM until a human hovers/focuses — decoded
  // lazily so neither the served HTML nor an idle DOM snapshot leaks them.
  const [liHref, setLiHref] = useState<string>();
  const [ghHref, setGhHref] = useState<string>();
  const resetTimer = useRef<number | null>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const gooRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const lastBurstEl = useRef<HTMLElement | null>(null);
  const lastBurstAt = useRef(0);

  // Burst on pointer-enter (clicks navigate away, so they'd waste it). The
  // shared filter span is cleared and repositioned per burst, so flicking
  // between stamps restarts cleanly; re-entering the same stamp while its
  // burst is still in flight is a no-op to avoid jitter flicker.
  const hoverBurst = (target: HTMLElement) => {
    const island = islandRef.current;
    const goo = gooRef.current;
    if (!island || !goo) return;
    const now = performance.now();
    if (target === lastBurstEl.current && now - lastBurstAt.current < 700)
      return;
    lastBurstEl.current = target;
    lastBurstAt.current = now;
    placeGoo(goo, target, island);
    burstGoo(goo);
  };

  const copyEmail = async () => {
    const email = getEmail();
    let ok = false;
    try {
      await navigator.clipboard.writeText(email);
      ok = true;
    } catch {
      // Fallback for older browsers / non-secure contexts.
      const area = document.createElement("textarea");
      area.value = email;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
    }

    setCopyState(ok ? "copied" : "failed");
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const emailLabel =
    copyState === "copied"
      ? "copied!"
      : copyState === "failed"
        ? getEmail()
        : "copy email";

  return (
    <nav
      className={`social-dock${paper ? " social-dock--paper" : ""}`}
      aria-label="Contact"
    >
      <div className="social-dock__island" ref={islandRef}>
        <span className="goo-filter" ref={gooRef} aria-hidden="true" />
        <a
          className="social-dock__btn"
          href={liHref}
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn (opens in new tab)"
          onMouseEnter={(e) => {
            setLiHref(getLinkedInUrl());
            hoverBurst(e.currentTarget);
          }}
          onFocus={() => setLiHref(getLinkedInUrl())}
          onClick={(e) => {
            if (!liHref) {
              e.preventDefault();
              window.open(getLinkedInUrl(), "_blank", "noopener");
            }
          }}
        >
          <span className="social-dock__stamp">
            <LinkedInIcon />
          </span>
          <span className="social-dock__label">linkedin ↗</span>
        </a>
        <a
          className="social-dock__btn"
          href={ghHref}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub (opens in new tab)"
          onMouseEnter={(e) => {
            setGhHref(getGitHubUrl());
            hoverBurst(e.currentTarget);
          }}
          onFocus={() => setGhHref(getGitHubUrl())}
          onClick={(e) => {
            if (!ghHref) {
              e.preventDefault();
              window.open(getGitHubUrl(), "_blank", "noopener");
            }
          }}
        >
          <span className="social-dock__stamp">
            <GitHubIcon />
          </span>
          <span className="social-dock__label">github ↗</span>
        </a>
        <button
          type="button"
          className="social-dock__btn"
          onMouseEnter={(e) => hoverBurst(e.currentTarget)}
          onClick={() => void copyEmail()}
          aria-label="Copy email address to clipboard"
        >
          <span className="social-dock__stamp">
            <MailIcon />
          </span>
          <span className="social-dock__label">{emailLabel}</span>
        </button>
      </div>
      <span className="visually-hidden" role="status">
        {copyState === "copied" ? "Email address copied to clipboard" : ""}
      </span>
    </nav>
  );
}
