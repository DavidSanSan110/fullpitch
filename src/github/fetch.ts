import { publicCalendar, type CalendarWindow } from "./calendar";
import { GithubError, gql } from "./graphql";

// Everything the card needs, gathered from three sources and merged so that no
// single blind spot can shrink the result:
//
//  1. GraphQL, authenticated as the profile owner — private repos, their
//     languages and stars, and contribution totals the token can see.
//  2. Search, with the same token — private PRs / reviews / issues, which the
//     contributions API otherwise folds into an anonymous "restricted" lump.
//  3. The public calendar (see ./calendar) — a per-year floor for volume.
//
// With a token that belongs to someone else, (1) and (2) only see public data
// and the card degrades to what public-only scorers show.

export interface FetchOptions {
  login: string;
  token: string;
  includePrivate: boolean;
  calendarFloor: boolean;
  now?: Date;
}

export interface RepoInfo {
  nameWithOwner: string;
  stars: number;
  language: string | null;
  isPrivate: boolean;
  /** Commits in the last year — set on contributed repos only. */
  commits?: number;
}

export interface YearTotals {
  year: number;
  /** Contributions the token's GraphQL view saw (all types, incl. the private lump). */
  api: number;
  /** What the public calendar shows for the year, if it could be read. */
  calendar: number | null;
  /** max(api, calendar) — the figure scoring uses. */
  total: number;
}

export interface RawProfile {
  login: string;
  name: string;
  avatarUrl: string;
  location: string | null;
  createdAt: string;
  followers: number;
  /** True when the token belongs to this user, so private data is in view. */
  privateMode: boolean;
  ownedRepoCount: number;
  privateRepoCount: number;
  repos: RepoInfo[];
  /** Repos (owned or not) with a real commit footprint in the last year. */
  contributedRepos: RepoInfo[];
  recent: {
    commits: number;
    prs: number;
    reviews: number;
    issues: number;
    restricted: number;
    apiTotal: number;
    calendarTotal: number | null;
    total: number;
    activeDays: number;
  };
  years: YearTotals[];
}

const MIN_CONTRIBUTED_LANG_COMMITS = 3;
const DAY_MS = 86_400_000;

export async function fetchProfile(o: FetchOptions): Promise<RawProfile> {
  const now = o.now ?? new Date();
  const from = new Date(now.getTime() - 365 * DAY_MS);

  // App tokens (e.g. GITHUB_TOKEN) may not resolve `viewer`; that just means public-only.
  const viewerLogin = await gql<{ viewer: { login: string } }>(o.token, `query { viewer { login } }`)
    .then((d) => d.viewer.login)
    .catch((e: GithubError) => {
      if (e.kind === "auth") throw e;
      return "";
    });
  const privateMode = o.includePrivate && viewerLogin.toLowerCase() === o.login.toLowerCase();

  const user = await fetchUser(o.token, o.login);
  const repos = await fetchOwnedRepos(o.token, o.login, privateMode);

  const createdYear = new Date(user.createdAt).getUTCFullYear();
  const yearList: number[] = [];
  for (let y = createdYear; y <= now.getUTCFullYear(); y++) yearList.push(y);

  const [recentWindow, search, recentCal, years] = await Promise.all([
    fetchWindow(o.token, o.login, from, now, true),
    fetchSearchCounts(o.token, o.login, from),
    o.calendarFloor ? publicCalendar(o.login) : Promise.resolve(null),
    mapLimit(yearList, 3, (y) => fetchYear(o, y, now)),
  ]);

  const apiTotal = sumTypes(recentWindow);
  const calendarTotal = recentCal?.total ?? null;
  const total = Math.max(apiTotal, recentWindow.calendarTotal, calendarTotal ?? 0);

  // Breakdown: take whichever source saw more of each type. Search sees private
  // PRs/reviews/issues that contributions only report as the restricted lump.
  const prs = Math.max(recentWindow.prs, privateMode ? search.prs : 0);
  const reviews = Math.max(recentWindow.reviews, privateMode ? search.reviews : 0);
  const issues = Math.max(recentWindow.issues, privateMode ? search.issues : 0);
  // Commits get the remainder: the private lump is overwhelmingly commits, and
  // GitHub exposes no private commit count to anyone, not even the owner.
  const commits = Math.max(recentWindow.commits + recentWindow.restricted, total - prs - reviews - issues, 0);

  const contributedRepos = recentWindow.byRepo
    .filter((r) => !r.isFork && r.commits >= MIN_CONTRIBUTED_LANG_COMMITS && (privateMode || !r.isPrivate))
    .map(({ nameWithOwner, language, isPrivate, commits }) => ({ nameWithOwner, language, isPrivate, commits, stars: 0 }));

  return {
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatarUrl,
    location: user.location,
    createdAt: user.createdAt,
    followers: user.followers.totalCount,
    privateMode,
    ownedRepoCount: repos.length,
    privateRepoCount: repos.filter((r) => r.isPrivate).length,
    repos,
    contributedRepos,
    recent: {
      commits,
      prs,
      reviews,
      issues,
      restricted: recentWindow.restricted,
      apiTotal,
      calendarTotal,
      total,
      activeDays: Math.max(recentWindow.activeDays, recentCal?.activeDays ?? 0),
    },
    years,
  };
}

// ---------------------------------------------------------------- user + repos

interface UserNode {
  login: string;
  name: string | null;
  avatarUrl: string;
  location: string | null;
  createdAt: string;
  followers: { totalCount: number };
}

async function fetchUser(token: string, login: string): Promise<UserNode> {
  const { user } = await gql<{ user: UserNode | null }>(
    token,
    `query($login: String!) { user(login: $login) { login name avatarUrl(size: 460) location createdAt followers { totalCount } } }`,
    { login },
  );
  if (!user) throw new GithubError(`No GitHub user named "${login}".`, "notfound");
  return user;
}

async function fetchOwnedRepos(token: string, login: string, privateMode: boolean): Promise<RepoInfo[]> {
  const out: RepoInfo[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    type Page = {
      user: {
        repositories: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: { nameWithOwner: string; stargazerCount: number; isPrivate: boolean; primaryLanguage: { name: string } | null }[];
        };
      };
    };
    const data: Page = await gql<Page>(
      token,
      `query($login: String!, $after: String, $privacy: RepositoryPrivacy) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, privacy: $privacy, first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { nameWithOwner stargazerCount isPrivate primaryLanguage { name } }
          }
        }
      }`,
      { login, after, privacy: privateMode ? null : "PUBLIC" },
    );
    const conn = data.user.repositories;
    for (const n of conn.nodes)
      out.push({ nameWithOwner: n.nameWithOwner, stars: n.stargazerCount, language: n.primaryLanguage?.name ?? null, isPrivate: n.isPrivate });
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

// ------------------------------------------------------------- contributions

interface WindowTotals {
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  restricted: number;
  calendarTotal: number;
  activeDays: number;
  byRepo: { nameWithOwner: string; language: string | null; isPrivate: boolean; isFork: boolean; commits: number }[];
}

const sumTypes = (w: WindowTotals) => w.commits + w.prs + w.reviews + w.issues + w.restricted;

interface CollectionNode {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  restrictedContributionsCount: number;
  contributionCalendar: { totalContributions: number; weeks?: { contributionDays: { contributionCount: number }[] }[] };
  commitContributionsByRepository?: {
    repository: { nameWithOwner: string; isFork: boolean; isPrivate: boolean; primaryLanguage: { name: string } | null };
    contributions: { totalCount: number };
  }[];
}

// One contributionsCollection window. GitHub rejects windows with too many
// events (RESOURCE_LIMITS_EXCEEDED); when that happens, split in half and sum.
async function fetchWindow(token: string, login: string, from: Date, to: Date, detail: boolean, depth = 0): Promise<WindowTotals> {
  const fields = `
    totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions
    totalIssueContributions restrictedContributionsCount
    contributionCalendar { totalContributions ${detail ? "weeks { contributionDays { contributionCount } }" : ""} }
    ${detail ? "commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner isFork isPrivate primaryLanguage { name } } contributions { totalCount } }" : ""}`;
  try {
    const { user } = await gql<{ user: { c: CollectionNode } }>(
      token,
      `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) { c: contributionsCollection(from: $from, to: $to) { ${fields} } } }`,
      { login, from: from.toISOString(), to: to.toISOString() },
    );
    const c = user.c;
    return {
      commits: c.totalCommitContributions,
      prs: c.totalPullRequestContributions,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
      restricted: c.restrictedContributionsCount,
      calendarTotal: c.contributionCalendar.totalContributions,
      activeDays: (c.contributionCalendar.weeks ?? []).reduce(
        (n, w) => n + w.contributionDays.filter((d) => d.contributionCount > 0).length,
        0,
      ),
      byRepo: (c.commitContributionsByRepository ?? []).map((r) => ({
        nameWithOwner: r.repository.nameWithOwner,
        language: r.repository.primaryLanguage?.name ?? null,
        isPrivate: r.repository.isPrivate,
        isFork: r.repository.isFork,
        commits: r.contributions.totalCount,
      })),
    };
  } catch (e) {
    if ((e as GithubError).kind !== "resource" || depth >= 4) throw e;
    const mid = new Date((from.getTime() + to.getTime()) / 2);
    const [a, b] = await Promise.all([
      fetchWindow(token, login, from, mid, detail, depth + 1),
      fetchWindow(token, login, mid, to, detail, depth + 1),
    ]);
    return mergeWindows(a, b);
  }
}

function mergeWindows(a: WindowTotals, b: WindowTotals): WindowTotals {
  const byRepo = new Map(a.byRepo.map((r) => [r.nameWithOwner, { ...r }]));
  for (const r of b.byRepo) {
    const prev = byRepo.get(r.nameWithOwner);
    if (prev) prev.commits += r.commits;
    else byRepo.set(r.nameWithOwner, { ...r });
  }
  return {
    commits: a.commits + b.commits,
    prs: a.prs + b.prs,
    reviews: a.reviews + b.reviews,
    issues: a.issues + b.issues,
    restricted: a.restricted + b.restricted,
    calendarTotal: a.calendarTotal + b.calendarTotal,
    activeDays: a.activeDays + b.activeDays,
    byRepo: [...byRepo.values()],
  };
}

async function fetchYear(o: FetchOptions, year: number, now: Date): Promise<YearTotals> {
  const from = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const to = end > now ? now : end;

  const [w, cal] = await Promise.all([
    fetchWindow(o.token, o.login, from, to, false).catch(() => null),
    o.calendarFloor ? publicCalendar(o.login, `${year}-01-01`, `${year}-12-31`) : Promise.resolve<CalendarWindow | null>(null),
  ]);
  const api = w ? Math.max(sumTypes(w), w.calendarTotal) : 0;
  const calendar = cal?.total ?? null;
  return { year, api, calendar, total: Math.max(api, calendar ?? 0) };
}

// -------------------------------------------------------------------- search

async function fetchSearchCounts(token: string, login: string, from: Date) {
  const since = from.toISOString().slice(0, 10);
  const q = (s: string) => JSON.stringify(s);
  try {
    const data = await gql<Record<"prs" | "reviews" | "issues", { issueCount: number }>>(
      token,
      `query {
        prs: search(type: ISSUE, query: ${q(`author:${login} is:pr created:>=${since}`)}) { issueCount }
        reviews: search(type: ISSUE, query: ${q(`reviewed-by:${login} -author:${login} is:pr updated:>=${since}`)}) { issueCount }
        issues: search(type: ISSUE, query: ${q(`author:${login} is:issue created:>=${since}`)}) { issueCount }
      }`,
    );
    return { prs: data.prs.issueCount, reviews: data.reviews.issueCount, issues: data.issues.issueCount };
  } catch {
    return { prs: 0, reviews: 0, issues: 0 }; // search is enrichment only
  }
}

// ------------------------------------------------------------------- helpers

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
