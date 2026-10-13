import { languageLogoUrl, logoSlugFor } from "../languages";

// Every image is inlined as a data: URI — README SVGs can't fetch anything at view time.

export async function dataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "fullpitch" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] || guessType(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const guessType = (url: string) =>
  url.endsWith(".svg") ? "image/svg+xml" : url.endsWith(".png") ? "image/png" : "image/jpeg";

export const flagUrl = (iso2: string) => `https://flagcdn.com/w160/${iso2.toLowerCase()}.png`;

export function logoUrl(language: string | null | undefined): string | null {
  const slug = language ? logoSlugFor(language) : null;
  return slug ? languageLogoUrl(slug) : null;
}

// ------------------------------------------------------------ country lookup

const ALIASES: Record<string, string> = {
  usa: "US", "u.s.a.": "US", "u.s.": "US", us: "US", america: "US",
  uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB", wales: "GB", britain: "GB",
  españa: "ES", deutschland: "DE", italia: "IT", brasil: "BR", méxico: "MX",
  "the netherlands": "NL", holland: "NL", nederland: "NL", schweiz: "CH", suisse: "CH",
  österreich: "AT", polska: "PL", türkiye: "TR", turkey: "TR", "south korea": "KR", korea: "KR",
  россия: "RU", "中国": "CN", "日本": "JP", uae: "AE", czechia: "CZ",
};

let names: Map<string, string> | null = null;
function countryNames(): Map<string, string> {
  if (names) return names;
  names = new Map();
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  const A = 65;
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      let name: string | undefined;
      try {
        name = dn.of(code);
      } catch {
        continue;
      }
      if (name && name !== code) names.set(name.toLowerCase(), code);
    }
  return names;
}

/** Best-effort ISO 3166 alpha-2 code from a free-text GitHub location. */
export function countryFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(/[,/|·•\-–]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .reverse(); // countries usually come last: "Salamanca, Spain"
  const known = countryNames();
  for (const p of parts) {
    const hit = ALIASES[p] ?? known.get(p);
    if (hit) return hit;
  }
  return null;
}
