import { useEffect, useState } from "react";

export type Route = "home" | "about";

/** Map a location.hash value to a route, defaulting to home. */
export function routeFromHash(hash: string): Route {
  return hash.replace(/^#/, "").toLowerCase() === "about" ? "about" : "home";
}

/** The address with any fragment dropped — "/" rather than "/#". */
export function pathWithoutHash(url: {
  pathname: string;
  search: string;
}): string {
  return url.pathname + url.search;
}

/**
 * Go home. Assigning `location.hash = ""` leaves a bare "#" hanging in
 * the address bar, so replace the whole URL instead — and announce it
 * ourselves, because pushState never fires hashchange.
 */
export function goHome(): void {
  if (routeFromHash(window.location.hash) === "home") return;
  window.history.pushState(null, "", pathWithoutHash(window.location));
  window.dispatchEvent(new Event("hashchange"));
}

/** Tiny hash router: re-renders on hashchange, no dependency needed.
 * popstate covers back/forward across the pushState entry goHome adds. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    routeFromHash(window.location.hash),
  );

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return route;
}
