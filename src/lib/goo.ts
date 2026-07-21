/**
 * Gooey particle burst, adapted from ReactBits' GooeyNav (MIT).
 * https://reactbits.dev/components/gooey-nav
 *
 * Spawn particles inside a `.goo-filter` element (see goo.css — the blur +
 * contrast filter over a black field is what makes separate white dots read
 * as merging liquid). Position the element over the trigger first.
 */

export type GooOptions = {
  particleCount?: number;
  animationTime?: number;
  timeVariance?: number;
  /** [start radius, end radius] in px — particles fly inward. */
  particleDistances?: [number, number];
  particleR?: number;
  /** Indexes into the --goo-N color custom properties. */
  colors?: number[];
};

const noise = (n = 1) => n / 2 - Math.random() * n;

const getXY = (
  distance: number,
  pointIndex: number,
  totalPoints: number,
): [number, number] => {
  const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
  return [distance * Math.cos(angle), distance * Math.sin(angle)];
};

export function burstGoo(element: HTMLElement, opts: GooOptions = {}): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const {
    particleCount = 12,
    animationTime = 500,
    timeVariance = 250,
    particleDistances = [68, 8],
    particleR = 100,
    colors = [1, 2, 3, 1, 2, 3, 1, 4],
  } = opts;

  // clear any burst still in flight
  for (const p of element.querySelectorAll(".goo-particle")) p.remove();

  const bubbleTime = animationTime * 2 + timeVariance;
  element.style.setProperty("--time", `${bubbleTime}ms`);

  for (let i = 0; i < particleCount; i++) {
    const t = animationTime * 2 + noise(timeVariance * 2);
    const start = getXY(particleDistances[0], particleCount - i, particleCount);
    const end = getXY(
      particleDistances[1] + noise(7),
      particleCount - i,
      particleCount,
    );
    const rotateBase = noise(particleR / 10);
    const rotate =
      rotateBase > 0
        ? (rotateBase + particleR / 20) * 10
        : (rotateBase - particleR / 20) * 10;
    const color = colors[Math.floor(Math.random() * colors.length)];

    element.classList.remove("goo-active");

    setTimeout(() => {
      if (!element.isConnected) return;
      const particle = document.createElement("span");
      const point = document.createElement("span");
      particle.classList.add("goo-particle");
      particle.style.setProperty("--start-x", `${start[0]}px`);
      particle.style.setProperty("--start-y", `${start[1]}px`);
      particle.style.setProperty("--end-x", `${end[0]}px`);
      particle.style.setProperty("--end-y", `${end[1]}px`);
      particle.style.setProperty("--time", `${t}ms`);
      particle.style.setProperty("--scale", `${1 + noise(0.2)}`);
      particle.style.setProperty("--color", `var(--goo-${color}, #ffffff)`);
      particle.style.setProperty("--rotate", `${rotate}deg`);

      point.classList.add("goo-point");
      particle.appendChild(point);
      element.appendChild(particle);

      requestAnimationFrame(() => {
        element.classList.add("goo-active");
      });
      setTimeout(() => {
        particle.remove();
      }, t);
    }, 30);
  }
}

/** Move a `.goo-filter` overlay onto `target`, relative to `container`. */
export function placeGoo(
  goo: HTMLElement,
  target: HTMLElement,
  container: HTMLElement,
): void {
  const containerRect = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  goo.style.left = `${rect.x - containerRect.x}px`;
  goo.style.top = `${rect.y - containerRect.y}px`;
  goo.style.width = `${rect.width}px`;
  goo.style.height = `${rect.height}px`;
}
