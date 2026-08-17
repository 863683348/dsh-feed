/**
 * dsh-feed — cross-ecosystem aggregation: sync the GitHub `dsh-plugin`
 * topic and the npm registry into one normalized JSON index. Zero Cordis
 * imports; the pure helpers are unit-testable, the fetchers need network.
 * @module dsh-feed/sync
 */

/** Normalize one GitHub repository search item. */
export function normalizeGithubItem(item) {
  return {
    name: item.full_name,
    url: item.html_url,
    description: item.description ?? "",
    stars: item.stargazers_count ?? 0,
    updatedAt: item.updated_at ?? "",
    topics: item.topics ?? [],
  };
}

/** Fetch the dsh-plugin topic from the GitHub search API. */
export async function fetchGithubTopic({ token, pages = 2, perPage = 100, signal } = {}) {
  const headers = { "User-Agent": "dsh-feed", "Accept": "application/vnd.github+json" };
  if (token) headers.Authorization = "Bearer " + token;
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const url = "https://api.github.com/search/repositories?q=topic:dsh-plugin&sort=updated&order=desc&per_page=" + perPage + "&page=" + page;
    const res = await fetch(url, { headers, signal });
    if (!res.ok) {
      if (page === 1) throw new Error("dsh-feed: GitHub search failed with " + res.status);
      break;
    }
    const body = await res.json();
    items.push(...(body.items ?? []));
    if ((body.items ?? []).length < perPage) break;
  }
  return items.map(normalizeGithubItem);
}

/** Fetch npm packages tagged with a dsh keyword. */
export async function fetchNpm({ keyword = "dsh-plugin", size = 100, signal } = {}) {
  const url = "https://registry.npmjs.org/-/v1/search?text=" + encodeURIComponent("keywords:" + keyword) + "&size=" + size;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("dsh-feed: npm search failed with " + res.status);
  const body = await res.json();
  return (body.objects ?? []).map((o) => {
    const p = o.package;
    return {
      name: p.name,
      url: p.links?.repository ?? "https://www.npmjs.com/package/" + p.name,
      description: p.description ?? "",
      stars: p.links?.repository ? 0 : 0,
      updatedAt: p.date ?? "",
      topics: (p.keywords ?? []).slice(0, 10),
      npmName: p.name,
    };
  });
}

/**
 * Run a full sync: GitHub topic + npm, merged by repo/npm identity.
 * @returns { updated, sources, plugins }
 */
export async function sync({ githubToken, githubPages = 2, npmKeyword = "dsh-plugin", signal } = {}) {
  const [gh, npm] = await Promise.all([
    fetchGithubTopic({ token: githubToken, pages: githubPages, signal }).catch((e) => {
      throw new Error("dsh-feed: github sync failed: " + e.message);
    }),
    fetchNpm({ keyword: npmKeyword, signal }).catch(() => []),
  ]);
  const byKey = new Map();
  for (const p of gh) byKey.set(p.name.toLowerCase(), { ...p, source: "github" });
  for (const p of npm) {
    const key = p.name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.npmName = p.npmName;
    else byKey.set(key, { ...p, source: "npm" });
  }
  return {
    updated: new Date().toISOString(),
    sources: { github: gh.length, npm: npm.length },
    count: byKey.size,
    plugins: [...byKey.values()].sort((a, b) => b.stars - a.stars),
  };
}
