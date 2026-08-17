/**
 * dsh-feed — pure query logic over the aggregated index.
 * @module dsh-feed/query
 */

/** Tokenize a query (English words + Chinese 2-grams). */
export function tokenize(query) {
  const out = new Set();
  const lower = String(query).toLowerCase();
  for (const w of lower.split(/[^a-z0-9]+/)) {
    if (w.length >= 3) out.add(w);
  }
  const runs = lower.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i++) out.add(run.slice(i, i + 2));
    if (run.length >= 3) out.add(run);
  }
  return [...out];
}

/** Score one plugin against query tokens. */
export function scorePlugin(plugin, terms) {
  let score = 0;
  const hits = [];
  const name = (plugin.name ?? "").toLowerCase();
  const text = ((plugin.description ?? "") + " " + (plugin.topics ?? []).join(" ")).toLowerCase();
  for (const t of terms) {
    if (name.includes(t)) {
      score += 3;
      hits.push(t);
    } else if (text.includes(t)) {
      score += 1;
      hits.push(t);
    }
  }
  return { score, hits: [...new Set(hits)].slice(0, 5) };
}

/** Search the index; returns ranked results. */
export function searchIndex(index, query, limit = 5) {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error('dsh-feed: "query" must be a non-empty string');
  }
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return (index.plugins ?? [])
    .map((plugin) => ({ plugin, ...scorePlugin(plugin, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.plugin.stars - a.plugin.stars || a.plugin.name.localeCompare(b.plugin.name))
    .slice(0, Math.min(Math.max(1, limit), 20))
    .map(({ plugin, score, hits }) => ({
      name: plugin.name,
      url: plugin.url,
      description: plugin.description ?? "",
      stars: plugin.stars ?? 0,
      topics: plugin.topics ?? [],
      npmName: plugin.npmName ?? null,
      score,
      hits,
    }));
}

/** Aggregate stats over the index. */
export function statsIndex(index) {
  const plugins = index.plugins ?? [];
  const topicCount = {};
  for (const p of plugins) {
    for (const t of p.topics ?? []) topicCount[t] = (topicCount[t] ?? 0) + 1;
  }
  const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([topic, n]) => ({ topic, count: n }));
  return {
    count: plugins.length,
    sources: index.sources ?? {},
    updated: index.updated ?? null,
    topTopics,
    npmCount: plugins.filter((p) => p.npmName).length,
  };
}
