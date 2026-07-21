/**
 * Shared SVG filter for the gooey burst. Blur + alpha-contrast is the classic
 * metaball trick — unlike ReactBits' blend-mode version it works over
 * transparent/blurred backdrops, which our islands sit on. Render once.
 */
export function GooDefs() {
  return (
    <svg className="goo-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="goo-metaball">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
          />
        </filter>
      </defs>
    </svg>
  );
}
