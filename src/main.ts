import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCard, formatCount, type Card } from "gitrank";
import { fetchProfile, type RawProfile } from "./github/fetch";
import { countryFromLocation, dataUri, flagUrl, logoUrl } from "./render/assets";
import { renderSvg, type Layout } from "./render/card";
import { themeFor, THEMES, type ThemeName } from "./render/theme";
import { toSignals, type LanguageRanking } from "./signals";

// Runs as a GitHub Action (inputs arrive as INPUT_* env vars) or as a local CLI:
//   npx tsx src/main.ts --username octocat --output card.svg   (token from GH_TOKEN)

const args = parseArgs(process.argv.slice(2));

function input(name: string, fallback = ""): string {
  const env = process.env[`INPUT_${name.toUpperCase()}`];
  const v = (env !== undefined && env !== "" ? env : args[name]) ?? "";
  return v.trim() || fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = input(name).toLowerCase();
  return v ? ["true", "yes", "1", "on"].includes(v) : fallback;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = input(name, fallback).toLowerCase() as T;
  if (!allowed.includes(v)) throw new Error(`Input "${name}" must be one of: ${allowed.join(", ")} (got "${v}").`);
  return v;
}

async function run() {
  const token = input("token") || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("A GitHub token is required (input `token`, or GH_TOKEN for local runs).");
  const login = input("username") || process.env.GITHUB_REPOSITORY_OWNER || "";
  if (!login) throw new Error("Input `username` is required.");

  const output = input("output", "fullpitch-card.svg");
  const jsonOutput = input("json_output");
  const layout = oneOf<Layout>("layout", ["banner", "card"], "banner");
  const themeName = oneOf<ThemeName | "auto">("theme", ["auto", ...(Object.keys(THEMES) as ThemeName[])], "auto");
  const ranking = oneOf<LanguageRanking>("language_ranking", ["repos", "commits"], "repos");
  const includePrivate = bool("include_private", true);
  const calendarFloor = bool("public_calendar_floor", true);
  const animate = bool("animate", true);

  console.log(`fullpitch: scouting @${login}…`);
  const profile = await fetchProfile({ login, token, includePrivate, calendarFloor });
  if (includePrivate && !profile.privateMode)
    console.warn(`fullpitch: the token doesn't belong to @${login}, so only public data is visible.`);

  const signals = toSignals(profile, ranking);
  const language = input("top_language") || signals.topLanguage || null;
  if (input("top_language")) signals.topLanguage = language;
  const country = (input("country") || countryFromLocation(profile.location) || "").toLowerCase();

  const card = buildCard(signals, { country });
  const [avatar, flag, logo] = await Promise.all([
    dataUri(profile.avatarUrl),
    country ? dataUri(flagUrl(country)) : Promise.resolve(null),
    (() => {
      const url = logoUrl(language);
      return url ? dataUri(url) : Promise.resolve(null);
    })(),
  ]);

  const lifetime = signals.total_contributions_lifetime;
  const svg = renderSvg({
    card,
    theme: themeFor(themeName, card.finish),
    layout,
    animate,
    images: { avatar, flag, logo },
    language,
    summary: { recent: signals.recent_contributions, lifetime, prs: signals.prs_to_others, includesPrivate: profile.privateMode },
    season: String(new Date().getUTCFullYear()).slice(-2),
  });

  write(output, svg);
  if (jsonOutput) write(jsonOutput, JSON.stringify({ generatedAt: new Date().toISOString(), card, signals, sources: sources(profile) }, null, 2) + "\n");

  console.log(`fullpitch: ${card.overall} ${card.position} ${card.finishLabel} · ${card.archetype} → ${output}`);
  setOutputs({ overall: card.overall, position: card.position, finish: card.finish, path: output });
  writeSummary(card, profile, lifetime);

  if (process.env.GITHUB_ACTIONS === "true" && bool("commit", true))
    commit([output, jsonOutput].filter(Boolean), input("commit_message", "Update fullpitch card [skip ci]"));
}

function sources(p: RawProfile) {
  return {
    privateMode: p.privateMode,
    ownedRepos: p.ownedRepoCount,
    privateRepos: p.privateRepoCount,
    recent: p.recent,
    years: p.years,
  };
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function setOutputs(o: Record<string, string | number>) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, Object.entries(o).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function writeSummary(card: Card, p: RawProfile, lifetime: number) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const s = card.stats;
  const r = p.recent;
  const calendar = r.calendarTotal === null ? "n/a" : formatCount(r.calendarTotal);
  appendFileSync(
    file,
    `### ⚽ ${card.name} — ${card.overall} ${card.position} ${card.finishLabel} · ${card.archetype}

| PAC | SHO | PAS | DRI | DEF | PHY |
|:-:|:-:|:-:|:-:|:-:|:-:|
| ${s.pac} | ${s.sho} | ${s.pas} | ${s.dri} | ${s.def} | ${s.phy} |

| Last 12 months | |
|---|---|
| Contributions used | **${formatCount(r.total)}** (token view ${formatCount(r.apiTotal)}, public calendar ${calendar}) |
| Commits · PRs · reviews · issues | ${formatCount(r.commits)} · ${r.prs} · ${r.reviews} · ${r.issues} |
| Active days | ${r.activeDays} |
| Lifetime contributions | ${formatCount(lifetime)} |
| Repos (private) | ${p.ownedRepoCount} (${p.privateRepoCount}) |
| Private data visible | ${p.privateMode ? "yes — token belongs to the profile owner" : "no — public data only"} |
`,
  );
}

function commit(paths: string[], message: string) {
  const git = (...a: string[]) => execFileSync("git", a, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  git("add", "--", ...paths);
  try {
    git("diff", "--cached", "--quiet");
    console.log("fullpitch: card unchanged, nothing to commit.");
    return;
  } catch {
    // diff --quiet exits 1 when there are staged changes
  }
  git("commit", "-m", message);
  git("push");
  console.log("fullpitch: committed and pushed.");
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    const key = m[1].replace(/-/g, "_");
    if (m[2] !== undefined) out[key] = m[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
    else out[key] = "true";
  }
  return out;
}

run().catch((e: Error) => {
  console.error(`::error::fullpitch: ${e.message}`);
  process.exitCode = 1;
});
