import { buildCard } from "gitrank";
import { describe, expect, it } from "vitest";
import type { RawProfile } from "../github/fetch";
import { toSignals } from "../signals";

const NOW = Date.parse("2026-10-13T00:00:00Z");

const profile = (over: Partial<RawProfile> = {}): RawProfile => ({
  login: "dev",
  name: "Dev Example",
  avatarUrl: "https://example.com/a.png",
  location: "Lisbon, Portugal",
  createdAt: "2020-10-13T00:00:00Z",
  followers: 30,
  privateMode: true,
  ownedRepoCount: 4,
  privateRepoCount: 3,
  repos: [
    { nameWithOwner: "dev/a", stars: 10, language: "Python", isPrivate: false },
    { nameWithOwner: "dev/b", stars: 0, language: "Python", isPrivate: true },
    { nameWithOwner: "dev/c", stars: 0, language: "CSS", isPrivate: true },
    { nameWithOwner: "dev/d", stars: 2, language: "Go", isPrivate: true },
    { nameWithOwner: "dev/e", stars: 0, language: "Python", isPrivate: true },
  ],
  contributedRepos: [{ nameWithOwner: "org/x", stars: 0, language: "Go", isPrivate: true, commits: 400 }],
  recent: { commits: 900, prs: 60, reviews: 20, issues: 5, restricted: 700, apiTotal: 400, calendarTotal: 985, total: 985, activeDays: 180 },
  years: [
    { year: 2024, api: 300, calendar: 500, total: 500 },
    { year: 2025, api: 400, calendar: 900, total: 900 },
    { year: 2026, api: 0, calendar: 0, total: 0 },
  ],
  ...over,
});

describe("toSignals", () => {
  it("uses floored totals and counts private repos", () => {
    const s = toSignals(profile(), "repos", NOW);
    expect(s.recent_contributions).toBe(985);
    expect(s.total_contributions_lifetime).toBe(1400);
    expect(s.public_repos).toBe(4);
    expect(s.total_stars_owned).toBe(12);
    expect(s.max_repo_stars).toBe(10);
    expect(s.languages).toBe(3); // Python, CSS, Go
    expect(s.active_years).toBe(2); // only years with work
  });

  it("ranks headline languages by repo count, or by commits on request", () => {
    expect(toSignals(profile(), "repos", NOW).topLanguage).toBe("Python");
    expect(toSignals(profile(), "commits", NOW).topLanguage).toBe("Go");
  });

  it("feeds a valid gitrank card", () => {
    const card = buildCard(toSignals(profile(), "repos", NOW));
    expect(card.overall).toBeGreaterThan(0);
    expect(Object.values(card.stats).every((v) => v >= 1 && v <= 99)).toBe(true);
  });
});
