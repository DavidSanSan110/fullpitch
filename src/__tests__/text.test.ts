import { describe, expect, it } from "vitest";
import { fitSize, measure, text, wrap } from "../render/text";

describe("text", () => {
  it("renders glyphs as a single path", () => {
    expect(text("84", 0, 0, { weight: "bold", size: 40, fill: "#fff" })).toMatch(/^<path d="M[^"]+" fill="#fff"\/>$/);
  });

  it("shrinks to fit", () => {
    const size = fitSize("A very long name indeed", "bold", 80, 200);
    expect(size).toBeLessThan(80);
    expect(measure("A very long name indeed", "bold", size)).toBeLessThanOrEqual(200.5);
  });

  it("wraps and ellipsizes", () => {
    const lines = wrap("one two three four five six seven eight nine ten", "medium", 28, 120, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
});
