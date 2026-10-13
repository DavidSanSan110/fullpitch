import type { Signals } from "gitrank";
import type { RawProfile, RepoInfo } from "./github/fetch";
import { rankLanguages, rankLanguagesWeighted } from "./languages";

const YEAR_MS = 31_557_600_000;

export type LanguageRanking = "repos" | "commits";

// RawProfile → gitrank Signals. Field semantics follow GitFut's adapter so the
// scoring stays calibrated; the difference is only in what's *visible*:
// private repos, private PRs/reviews and the calendar floor all count here.
export function toSignals(p: RawProfile, ranking: LanguageRanking = "repos", now = Date.now()): Signals {
  const account_age_years = Math.max(0, (now - Date.parse(p.createdAt)) / YEAR_MS);

  const total_stars_owned = p.repos.reduce((s, r) => s + r.stars, 0);
  const max_repo_stars = p.repos.reduce((m, r) => Math.max(m, r.stars), 0);

  // Language range over the union of owned repos and repos committed to recently.
  const union = new Map<string, RepoInfo>();
  for (const r of p.repos) union.set(r.nameWithOwner, r);
  for (const r of p.contributedRepos) if (!union.has(r.nameWithOwner)) union.set(r.nameWithOwner, r);
  const languages = new Set([...union.values()].map((r) => r.language).filter(Boolean)).size;

  const rankedLanguages =
    ranking === "commits" && p.contributedRepos.length
      ? rankLanguagesWeighted(commitWeights(p))
      : rankLanguages([...union.values()]);

  const lifetime = p.years.reduce((s, y) => s + y.total, 0);
  const yearsWithWork = p.years.filter((y) => y.total > 0).length;
  const active_years = Math.min(Math.max(yearsWithWork, 1), Math.ceil(account_age_years) || 1);
  const recent_spike = p.recent.total > 2 * (lifetime / Math.max(active_years, 1));

  return {
    login: p.login,
    name: p.name,
    avatarUrl: p.avatarUrl,
    location: p.location,
    followers: p.followers,
    account_age_years,
    public_repos: p.ownedRepoCount,
    total_stars_owned,
    max_repo_stars,
    languages,
    rankedLanguages,
    topLanguage: rankedLanguages[0] ?? null,
    recent_contributions: p.recent.total,
    active_days_recent: p.recent.activeDays,
    active_years,
    total_contributions_lifetime: lifetime,
    prs_to_others: p.recent.prs,
    reviews: p.recent.reviews,
    issues_closed: p.recent.issues,
    recent_commits: p.recent.commits,
    recent_spike,
  };
}

// Commit-weighted languages: recent commits per repo, with every owned repo
// adding a small base weight so a quiet year doesn't erase long-standing stacks.
function commitWeights(p: RawProfile) {
  const contributed = new Map<string, number>();
  for (const r of p.contributedRepos) contributed.set(r.nameWithOwner, r.commits ?? 1);
  const rows = p.repos.map((r) => ({ language: r.language, weight: 1 + (contributed.get(r.nameWithOwner) ?? 0) }));
  for (const r of p.contributedRepos)
    if (!p.repos.some((o) => o.nameWithOwner === r.nameWithOwner)) rows.push({ language: r.language, weight: contributed.get(r.nameWithOwner) ?? 1 });
  return rows;
}
