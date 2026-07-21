import { describe, expect, it } from "vitest";
import { pathWithoutHash, routeFromHash } from "./useHashRoute";

describe("routeFromHash", () => {
  it("maps #about to the about route", () => {
    expect(routeFromHash("#about")).toBe("about");
    expect(routeFromHash("#ABOUT")).toBe("about");
    expect(routeFromHash("about")).toBe("about");
  });

  it("defaults everything else to home", () => {
    expect(routeFromHash("")).toBe("home");
    expect(routeFromHash("#")).toBe("home");
    expect(routeFromHash("#projects")).toBe("home");
    expect(routeFromHash("#gallery")).toBe("home");
    expect(routeFromHash("#about/extra")).toBe("home");
  });
});

describe("pathWithoutHash", () => {
  it("drops the fragment so the address bar keeps no bare #", () => {
    expect(pathWithoutHash({ pathname: "/", search: "" })).toBe("/");
    expect(pathWithoutHash({ pathname: "/me/", search: "" })).toBe("/me/");
  });

  it("keeps the query string", () => {
    expect(pathWithoutHash({ pathname: "/", search: "?ref=cv" })).toBe(
      "/?ref=cv",
    );
  });
});
