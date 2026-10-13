import { describe, expect, it } from "vitest";
import { countryFromLocation } from "../render/assets";

describe("countryFromLocation", () => {
  it.each([
    ["Salamanca, Spain", "ES"],
    ["Berlin, Deutschland", "DE"],
    ["San Francisco, CA, USA", "US"],
    ["London / UK", "GB"],
    ["Japan", "JP"],
  ])("%s → %s", (loc, code) => expect(countryFromLocation(loc)).toBe(code));

  it("returns null for unknown or empty locations", () => {
    expect(countryFromLocation("the moon")).toBeNull();
    expect(countryFromLocation(null)).toBeNull();
  });
});
