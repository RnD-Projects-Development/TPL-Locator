import { describe, expect, it } from "vitest";
import { landmarkFromPoint, parseLandmarkDisplay } from "./landmark.js";

describe("landmarkFromPoint", () => {
  it("returns trimmed landmark string", () => {
    expect(landmarkFromPoint({ landmark: "  TPL Trakker  " })).toBe("TPL Trakker");
  });

  it("returns null when missing", () => {
    expect(landmarkFromPoint({})).toBeNull();
  });
});

describe("parseLandmarkDisplay", () => {
  it("splits primary and secondary on em dash", () => {
    expect(parseLandmarkDisplay("TPL Trakker — Main Road, Karachi")).toEqual({
      primary: "TPL Trakker",
      secondary: "Main Road, Karachi",
      isSpecific: true,
    });
  });

  it("handles single-part landmark", () => {
    expect(parseLandmarkDisplay("University Road")).toEqual({
      primary: "University Road",
      secondary: null,
      isSpecific: true,
    });
  });
});
