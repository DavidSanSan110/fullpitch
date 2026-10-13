import { formatCount, type Card, type StatKey } from "gitrank";
import { fitSize, measure, text, wrap } from "./text";
import { FINISH_ACCENT, type Theme } from "./theme";

export type Layout = "banner" | "card";

export interface RenderInput {
  card: Card;
  theme: Theme;
  layout: Layout;
  animate: boolean;
  images: { avatar: string | null; flag: string | null; logo: string | null };
  /** Language shown on the card (logo + sentence). */
  language: string | null;
  summary: { recent: number; lifetime: number; prs: number; includesPrivate: boolean };
  /** Two-digit season shown as the outlined watermark, e.g. "26". */
  season: string;
}

// Card geometry, in card-local px.
const W = 360;
const H = 540;

// Shield outline: a raised crest at the top, straight sides, tapering to a point.
const SHIELD =
  "M0,66 C28,66 52,54 70,36 C90,22 126,22 150,14 L180,0 L210,14 C234,22 270,22 290,36 " +
  "C308,54 332,66 360,66 L360,430 C360,462 338,480 306,492 C262,508 214,516 180,540 " +
  "C146,516 98,508 54,492 C22,480 0,462 0,430 Z";

/** The shield shrunk by `i` px on every side (non-uniform scale about the centre). */
const inset = (i: number) =>
  `translate(${i} ${i}) scale(${((W - 2 * i) / W).toFixed(4)} ${((H - 2 * i) / H).toFixed(4)})`;

const STAT_ROWS: [StatKey, string, StatKey, string][] = [
  ["pac", "PAC", "dri", "DRI"],
  ["sho", "SHO", "def", "DEF"],
  ["pas", "PAS", "phy", "PHY"],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const stops = (colors: string[]) =>
  colors.map((c, i) => `<stop offset="${(i / Math.max(colors.length - 1, 1)).toFixed(3)}" stop-color="${c}"/>`).join("");

function cardDefs(t: Theme): string {
  return `
  <linearGradient id="fp-frame" x1="0" y1="0" x2="1" y2="1">${stops(t.frame)}</linearGradient>
  <linearGradient id="fp-base" x1="0" y1="0" x2="0" y2="1">${stops(t.base)}</linearGradient>
  <linearGradient id="fp-band" x1="0" y1="0" x2="1" y2="0">${stops(t.band)}</linearGradient>
  <linearGradient id="fp-band-fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="fp-band-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
    <rect x="0" y="0" width="${W}" height="340" fill="url(#fp-band-fade)"/>
  </mask>
  <pattern id="fp-orn" width="26" height="26" patternUnits="userSpaceOnUse">
    <path d="M13 1.5 L24.5 13 L13 24.5 L1.5 13 Z" fill="none" stroke="${t.pattern}" stroke-width="0.7"/>
    <path d="M13 7 C16.5 9.5 16.5 16.5 13 19 C9.5 16.5 9.5 9.5 13 7 Z" fill="none" stroke="${t.pattern}" stroke-width="0.6"/>
    <circle cx="0" cy="0" r="2" fill="${t.pattern}"/><circle cx="26" cy="0" r="2" fill="${t.pattern}"/>
    <circle cx="0" cy="26" r="2" fill="${t.pattern}"/><circle cx="26" cy="26" r="2" fill="${t.pattern}"/>
  </pattern>
  <radialGradient id="fp-glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="fp-photo-fade" cx="0.5" cy="0.46" r="0.52">
    <stop offset="0" stop-color="#fff"/><stop offset="0.62" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </radialGradient>
  <mask id="fp-photo-mask" maskContentUnits="objectBoundingBox">
    <rect width="1" height="1" fill="url(#fp-photo-fade)"/>
  </mask>
  <filter id="fp-gray" color-interpolation-filters="sRGB">
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncR type="linear" slope="1.08" intercept="-0.02"/><feFuncG type="linear" slope="1.08" intercept="-0.02"/><feFuncB type="linear" slope="1.08" intercept="-0.02"/></feComponentTransfer>
  </filter>
  <linearGradient id="fp-shine" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="fp-clip"><path d="${SHIELD}" transform="${inset(7)}"/></clipPath>
  <filter id="fp-drop" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.55"/>
  </filter>`;
}

/** The player card itself, drawn at the origin (W×H) — the caller translates it. */
function cardBody(i: RenderInput): string {
  const { card, theme: t, images } = i;
  const firstName = (card.name.split(/\s+/)[0] || card.login).toUpperCase();

  const photo = images.avatar
    ? `<ellipse cx="240" cy="196" rx="104" ry="118" fill="url(#fp-glow)" opacity="0.7"/>
       <image href="${images.avatar}" x="120" y="62" width="240" height="268" preserveAspectRatio="xMidYMid slice"
              filter="url(#fp-gray)" mask="url(#fp-photo-mask)"/>`
    : "";

  const shine = i.animate
    ? `<rect x="-260" y="-40" width="150" height="${H + 80}" fill="url(#fp-shine)" transform="skewX(-18)">
         <animate attributeName="x" values="-260;520;520" keyTimes="0;0.32;1" dur="8s" begin="1.5s" repeatCount="indefinite"/>
       </rect>`
    : "";

  const stats = STAT_ROWS.map(([lk, ll, rk, rl], r) => {
    const y = 424 + r * 40;
    const num = { weight: "extrabold" as const, size: 37, fill: t.ink };
    const lab = { weight: "medium" as const, size: 32, fill: t.label };
    return (
      text(String(card.stats[lk]), 116, y, { ...num, anchor: "end" }) +
      text(ll, 124, y, lab) +
      text(String(card.stats[rk]), 238, y, { ...num, anchor: "end" }) +
      text(rl, 246, y, lab)
    );
  }).join("");

  return `
  <g filter="url(#fp-drop)"><path d="${SHIELD}" fill="url(#fp-frame)"/></g>
  <path d="${SHIELD}" transform="${inset(3.5)}" fill="#000" opacity="0.45"/>
  <path d="${SHIELD}" transform="${inset(5)}" fill="url(#fp-frame)"/>
  <g clip-path="url(#fp-clip)">
    <rect width="${W}" height="${H}" fill="url(#fp-base)"/>
    <rect width="${W}" height="${H}" fill="url(#fp-orn)" opacity="0.13"/>
    <g mask="url(#fp-band-mask)">
      <rect x="128" y="0" width="${W - 128}" height="340" fill="url(#fp-band)"/>
      <rect x="128" y="0" width="${W - 128}" height="340" fill="url(#fp-orn)" opacity="0.22"/>
      <rect x="128" y="0" width="3" height="340" fill="${t.rule}" opacity="0.55"/>
    </g>
    <g transform="skewX(-12)">
      ${text(`FP${i.season}`, 238, 318, { weight: "extrabold", size: 200, fill: "none", stroke: t.watermark, strokeWidth: 2, opacity: 0.38, anchor: "middle" })}
    </g>
    ${photo}
    ${shine}
  </g>
  ${text(String(card.overall), 80, 126, { weight: "extrabold", size: 80, fill: t.ink, anchor: "middle" })}
  ${text(card.position, 80, 164, { weight: "semibold", size: 34, fill: t.ink, anchor: "middle", tracking: 1 })}
  <line x1="56" y1="180" x2="104" y2="180" stroke="${t.rule}" stroke-opacity="0.7"/>
  ${images.flag ? `<image href="${images.flag}" x="53" y="190" width="54" height="36" preserveAspectRatio="xMidYMid slice"/>` : ""}
  ${images.flag && images.logo ? `<line x1="56" y1="236" x2="104" y2="236" stroke="${t.rule}" stroke-opacity="0.7"/>` : ""}
  ${images.logo ? `<image href="${images.logo}" x="56" y="${images.flag ? 246 : 192}" width="48" height="48"/>` : ""}
  ${text(firstName, W / 2, 364, { weight: "bold", size: 52, fill: t.ink, anchor: "middle", tracking: 1, maxWidth: 270 })}
  <line x1="46" y1="382" x2="${W - 46}" y2="382" stroke="${t.rule}" stroke-opacity="0.6"/>
  ${stats}
  <line x1="${W / 2}" y1="396" x2="${W / 2}" y2="506" stroke="${t.rule}" stroke-opacity="0.6"/>
  <line x1="${W / 2 - 22}" y1="520" x2="${W / 2 + 22}" y2="520" stroke="${t.rule}" stroke-opacity="0.6"/>`;
}

function footer(i: RenderInput, x: number, y: number): string {
  const o = { weight: "semibold" as const, size: 15, fill: "#c9a85a", tracking: 1.6 };
  return text("FULLPITCH", x + 14, y, o) + text(`@${i.card.login}`, x + W - 14, y, { ...o, anchor: "end" });
}

function panel(i: RenderInput, x: number): string {
  const { card } = i;
  const accent = FINISH_ACCENT[card.finish];
  const maxW = 1200 - x - 56;

  const tier = `${card.overall} ${card.finishLabel}`;
  const tierSvg = text(tier, x, 338, { weight: "semibold", size: 36, fill: accent });
  const tierW = measureSafe(tier, 36);
  const archetypeSvg =
    text("·", x + tierW + 14, 338, { weight: "semibold", size: 36, fill: "#6b7178" }) +
    text(card.archetype, x + tierW + 34, 338, { weight: "semibold", size: 36, fill: "#f2f3f5", maxWidth: maxW - tierW - 34 });

  const sentence = `${card.archetypeBlurb}${i.language ? ` · ${i.language}` : ""}.`;
  // One line if a slightly smaller size fits; otherwise wrap at full size.
  const oneLine = fitSize(sentence, "medium", 28, maxW);
  const sentenceSize = oneLine >= 23 ? oneLine : 28;
  const lines = oneLine >= 23 ? [sentence] : wrap(sentence, "medium", 28, maxW, 2);

  const s = i.summary;
  const facts = `${formatCount(s.recent)} contributions this year · ${formatCount(s.lifetime)} lifetime · ${formatCount(s.prs)} PRs`;
  const factsY = 404 + lines.length * 36 + 18;
  const factsW = measureSafe(facts, 24, "medium");
  const pill = s.includesPrivate
    ? `<rect x="${x + factsW + 16}" y="${factsY - 20}" width="118" height="27" rx="13.5" fill="none" stroke="#2ec4a6" stroke-opacity="0.8"/>` +
      text("INCL. PRIVATE", x + factsW + 16 + 59, factsY - 0.5, { weight: "semibold", size: 16, fill: "#2ec4a6", anchor: "middle", tracking: 1.2 })
    : "";

  return `
  ${text("FULL", x, 192, { weight: "semibold", size: 30, fill: "#f2f3f5", tracking: 3 })}
  ${text("PITCH", x + measureSafe("FULL", 30, "semibold", 3) + 3, 192, { weight: "semibold", size: 30, fill: "#2ec4a6", tracking: 3 })}
  ${text(card.name, x, 276, { weight: "bold", size: 84, fill: "#f7f8fa", maxWidth: maxW })}
  ${tierSvg}${archetypeSvg}
  ${lines.map((l, n) => text(l, x, 398 + n * 36, { weight: "medium", size: sentenceSize, fill: "#9aa1a9" })).join("")}
  ${text(facts, x, factsY, { weight: "medium", size: 24, fill: "#c4c9cf" })}${pill}
  ${text(`github.com/${card.login}`, x, factsY + 52, { weight: "medium", size: 24, fill: "#6e757d" })}`;
}

const measureSafe = (s: string, size: number, weight: "medium" | "semibold" = "semibold", tracking = 0) =>
  measure(s, weight, size, tracking);

export function renderSvg(i: RenderInput): string {
  const banner = i.layout === "banner";
  const width = banner ? 1200 : 400;
  const height = banner ? 630 : 600;
  const cx = banner ? 92 : 20;
  const cy = banner ? 34 : 22;
  const title = `${i.card.name} — ${i.card.overall} ${i.card.position} ${i.card.finishLabel}`;
  const desc = `PAC ${i.card.stats.pac}, SHO ${i.card.stats.sho}, PAS ${i.card.stats.pas}, DRI ${i.card.stats.dri}, DEF ${i.card.stats.def}, PHY ${i.card.stats.phy}. ${i.card.archetype}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="fp-title fp-desc">
<title id="fp-title">${esc(title)}</title>
<desc id="fp-desc">${esc(desc)}</desc>
<defs>
  ${cardDefs(i.theme)}
  <radialGradient id="fp-bg" cx="0.22" cy="0.45" r="0.85">
    <stop offset="0" stop-color="#1c2027"/><stop offset="1" stop-color="#0b0c0f"/>
  </radialGradient>
</defs>
<rect width="${width}" height="${height}" rx="18" fill="url(#fp-bg)"/>
<g transform="translate(${cx} ${cy})">${cardBody(i)}</g>
${footer(i, cx, cy + H + 18)}
${banner ? panel(i, 528) : ""}
</svg>
`;
}
