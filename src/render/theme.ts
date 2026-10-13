import type { Finish } from "gitrank";

export type ThemeName = "navy" | "gold" | "silver" | "bronze" | "black";

export interface Theme {
  /** Outer frame gradient stops (diagonal). */
  frame: string[];
  /** Card body gradient stops (top → bottom). */
  base: string[];
  /** Vertical band behind the photo (left → right). */
  band: string[];
  /** Fine ornament pattern on the body. */
  pattern: string;
  /** OVR, name and stat numbers. */
  ink: string;
  /** Position and stat labels. */
  label: string;
  /** Hairlines and dividers. */
  rule: string;
  /** Outlined watermark text. */
  watermark: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  // The "in-form" look: deep navy with gold, a gold-and-cream band behind the photo.
  navy: {
    frame: ["#8a6420", "#f7dd8c", "#b8902f", "#fbe6a2", "#8e6a22"],
    base: ["#17306f", "#0f2257", "#0a1840", "#081232"],
    band: ["#a07622", "#d4ae55", "#ead39a", "#f3e7c6"],
    pattern: "#d9b65a",
    ink: "#f3d27a",
    label: "#f7ecd0",
    rule: "#d9b65a",
    watermark: "#e2c06a",
  },
  gold: {
    frame: ["#7a5a14", "#fff1b8", "#c9a443", "#fff4c9", "#8a6a1c"],
    base: ["#f3dc8f", "#e2c26a", "#d4ad4f", "#c39a3c"],
    band: ["#f9eab8", "#fff6da", "#fffaf0", "#ffffff"],
    pattern: "#fff3c4",
    ink: "#3b2a07",
    label: "#3b2a07",
    rule: "#6b4f12",
    watermark: "#fff5cf",
  },
  silver: {
    frame: ["#5f6670", "#f4f6f8", "#9aa3ad", "#ffffff", "#6c737c"],
    base: ["#e3e7eb", "#c9cfd6", "#b3bac3", "#9ea6b0"],
    band: ["#eef1f4", "#f8fafb", "#ffffff", "#ffffff"],
    pattern: "#ffffff",
    ink: "#252a31",
    label: "#252a31",
    rule: "#4a525c",
    watermark: "#ffffff",
  },
  bronze: {
    frame: ["#5a3416", "#f0bf8c", "#9c6233", "#f6cfa5", "#6a3e1b"],
    base: ["#d9a477", "#c48a5a", "#ad7346", "#955f37"],
    band: ["#ecc7a3", "#f6e0c9", "#fff5ea", "#ffffff"],
    pattern: "#f6d6b6",
    ink: "#2e1a0b",
    label: "#2e1a0b",
    rule: "#4e2e14",
    watermark: "#f6d6b6",
  },
  // Icon: black with warm white-gold.
  black: {
    frame: ["#6d5a2c", "#f6ead0", "#a8915a", "#fff8e6", "#6d5a2c"],
    base: ["#2a2a2e", "#1b1b1f", "#121215", "#0b0b0d"],
    band: ["#8f7a45", "#d9c99c", "#f3ead2", "#ffffff"],
    pattern: "#c9b27a",
    ink: "#f4e7c4",
    label: "#f8f1df",
    rule: "#c9b27a",
    watermark: "#d8c48f",
  },
};

export function themeFor(name: ThemeName | "auto", finish: Finish): Theme {
  if (name !== "auto") return THEMES[name];
  switch (finish) {
    case "bronze":
      return THEMES.bronze;
    case "silver":
      return THEMES.silver;
    case "gold":
      return THEMES.gold;
    case "icon":
      return THEMES.black;
    default:
      return THEMES.navy; // totw (in-form), toty, founder
  }
}

/** Colour for the "84 IN-FORM" headline on the banner. */
export const FINISH_ACCENT: Record<Finish, string> = {
  bronze: "#d8955a",
  silver: "#c7cdd4",
  gold: "#f0cf6b",
  totw: "#86a8ff",
  toty: "#5cc8ff",
  icon: "#f2e6c4",
  founder: "#ff6b6b",
};
