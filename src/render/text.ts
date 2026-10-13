import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

// Text is converted to SVG paths, so the card renders identically everywhere
// (GitHub serves README SVGs as <img>, which can't load web fonts).

export type Weight = "medium" | "semibold" | "bold" | "extrabold";

const FILES: Record<Weight, string> = {
  medium: "BarlowCondensed-Medium.ttf",
  semibold: "BarlowCondensed-SemiBold.ttf",
  bold: "BarlowCondensed-Bold.ttf",
  extrabold: "BarlowCondensed-ExtraBold.ttf",
};

// fonts/ sits at the repo root: one level up from dist/, two up from src/render/.
function fontDir(): string {
  for (const rel of ["../fonts/", "../../fonts/"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(dir + FILES.bold)) return dir;
  }
  throw new Error("fullpitch: bundled fonts not found");
}

const cache = new Map<Weight, opentype.Font>();
function font(w: Weight): opentype.Font {
  let f = cache.get(w);
  if (!f) {
    const buf = readFileSync(fontDir() + FILES[w]);
    f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    cache.set(w, f);
  }
  return f;
}

export interface TextOpts {
  weight: Weight;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  /** Extra space between glyphs, in px. */
  tracking?: number;
  /** Shrink the size until the text fits this width. */
  maxWidth?: number;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  attrs?: string;
}

export function measure(str: string, weight: Weight, size: number, tracking = 0): number {
  const f = font(weight);
  const glyphs = f.stringToGlyphs(str);
  const scale = size / f.unitsPerEm;
  let w = 0;
  glyphs.forEach((g, i) => {
    w += (g.advanceWidth ?? 0) * scale;
    if (i < glyphs.length - 1) w += f.getKerningValue(g, glyphs[i + 1]) * scale + tracking;
  });
  return w;
}

/** Fit `str` into `maxWidth`, returning the (possibly reduced) font size. */
export function fitSize(str: string, weight: Weight, size: number, maxWidth: number, tracking = 0): number {
  const w = measure(str, weight, size, tracking);
  return w <= maxWidth ? size : Math.max(8, Math.floor(size * (maxWidth / w) * 10) / 10);
}

/** Render `str` with its baseline at (x, y) as a single <path>. */
export function text(str: string, x: number, y: number, o: TextOpts): string {
  if (!str) return "";
  const tracking = o.tracking ?? 0;
  const size = o.maxWidth ? fitSize(str, o.weight, o.size, o.maxWidth, tracking) : o.size;
  const width = measure(str, o.weight, size, tracking);
  let cx = o.anchor === "middle" ? x - width / 2 : o.anchor === "end" ? x - width : x;

  const f = font(o.weight);
  const glyphs = f.stringToGlyphs(str);
  const scale = size / f.unitsPerEm;
  let d = "";
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    cx += (g.advanceWidth ?? 0) * scale;
    if (i < glyphs.length - 1) cx += f.getKerningValue(g, glyphs[i + 1]) * scale + tracking;
  });
  if (!d) return "";
  const stroke = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.strokeWidth ?? 1}"` : "";
  const opacity = o.opacity !== undefined ? ` opacity="${o.opacity}"` : "";
  return `<path d="${d}" fill="${o.fill}"${stroke}${opacity}${o.attrs ? " " + o.attrs : ""}/>`;
}

/** Greedy word wrap into at most `maxLines`, ellipsizing the last line. */
export function wrap(str: string, weight: Weight, size: number, maxWidth: number, maxLines: number): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, weight, size) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(last + "…", weight, size) > maxWidth) last = last.replace(/\s*\S+$/, "");
  kept[maxLines - 1] = last + "…";
  return kept;
}
