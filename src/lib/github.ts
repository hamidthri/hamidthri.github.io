/**
 * Build-time GitHub stats — deterministic and offline-safe.
 *
 * Runs only in .astro frontmatter (server, at build). Each repo is fetched
 * from the GitHub API with a bounded timeout; ANY failure (offline, 403
 * rate-limit, 404, timeout) falls back to the committed cache so `astro build`
 * never fails. No requests are ever made from the browser.
 */
import cacheData from '../../public/data/github-cache.json';
import { githubUser } from './site';

export interface RepoStat {
  repo: string;
  stars: number;
  pushedAt: string;
  url: string;
}

const cache = cacheData as RepoStat[];
const cacheMap = new Map(cache.map((r) => [r.repo, r]));

/** Token (optional) lifts the API rate limit from 60→5000/h in CI. */
const token =
  import.meta.env.GITHUB_TOKEN ||
  (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined);

async function fetchRepo(repo: string): Promise<RepoStat | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.github.com/repos/${githubUser}/${repo}`, {
      headers,
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) return null;
    const j = (await res.json()) as { stargazers_count: number; pushed_at: string; html_url: string };
    return { repo, stars: j.stargazers_count, pushedAt: j.pushed_at, url: j.html_url };
  } catch {
    return null;
  }
}

const fallback = (repo: string): RepoStat =>
  cacheMap.get(repo) ?? { repo, stars: 0, pushedAt: '', url: `https://github.com/${githubUser}/${repo}` };

/** One repo's stats (live → cache → zeroed default). */
export async function getRepoStat(repo?: string): Promise<RepoStat | null> {
  if (!repo) return null;
  return (await fetchRepo(repo)) ?? fallback(repo);
}

/** Many repos at once, de-duplicated. */
export async function getRepoStats(repos: (string | undefined)[]): Promise<Map<string, RepoStat>> {
  const unique = [...new Set(repos.filter((r): r is string => Boolean(r)))];
  const results = await Promise.all(unique.map((r) => getRepoStat(r)));
  const map = new Map<string, RepoStat>();
  results.forEach((r) => r && map.set(r.repo, r));
  return map;
}

/** Aggregate signals for the home page (e.g. total stars across featured repos). */
export async function getProfileTotals(repos: string[]): Promise<{ totalStars: number }> {
  const map = await getRepoStats(repos);
  let totalStars = 0;
  for (const r of repos) totalStars += map.get(r)?.stars ?? 0;
  return { totalStars };
}
