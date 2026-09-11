/**
 * dsh-feed — cross-ecosystem aggregation base ("聚合的聚合").
 *
 * Model-facing tools over the aggregated dsh plugin index:
 *   feed_sync   — fetch GitHub dsh-plugin topic + npm registry into one JSON index
 *   feed_search — query the index by natural language
 *   feed_stats  — index statistics
 * The index is an open JSON file (default .dsh/dsh-feed.json in the session
 * workspace) — any tool or UI can read it. A CLI (dsh-feed) and a minimal
 * stdio MCP server ship with the package.
 *
 * @module dsh-feed
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readIndex, writeIndex, indexAgeMs } from "./index-store.js";
import { searchIndex, statsIndex } from "./query.js";
import { sync } from "./sync.js";

/** Cordis plugin name (registered with the loader). */
const name = "feed";

/** Services this plugin must resolve before it applies. */
const inject = ["tools", "systemPrompt"];

/** Composition-row configuration. */
const Config = z.object({
  /** Index file, relative to the session workspace. */
  file: z.string().default(".dsh/dsh-feed.json"),
  /** Default result count for feed_search. */
  limit: z.number().default(5),
  /** GitHub token env var name read during feed_sync (optional). */
  githubTokenEnv: z.string().default("GITHUB_TOKEN"),
  /** Prompt section order (ascending; persona is 0). */
  sectionOrder: z.number().default(5),
});

const FEED_SECTION_TEXT = 'The `feed` tools read and maintain the cross-ecosystem dsh plugin index (`feed_search`/`feed_stats`/`feed_sync`): a normalized JSON index of the GitHub `dsh-plugin` topic plus the npm registry, stored at `.dsh/dsh-feed.json` in the session workspace. Use `feed_search` when the local curated directory is not enough and the user wants the whole ecosystem; run `feed_sync` first when the index is missing or stale.';

/**
 * Register the feed tools and the guidance section.
 * @param ctx - registrant context.
 * @param config - validated plugin configuration.
 */
function apply(ctx, config) {
  const cwdOf = (exec) => exec.agent?.session?.header?.cwd ?? process.cwd();

  ctx.tools.register(defineTool({
    name: "feed_sync",
    description: "Fetch the GitHub dsh-plugin topic and the npm registry into one normalized JSON index (default .dsh/dsh-feed.json in the session workspace). Call before feed_search when the index is missing or stale. Uses the network; may take a few seconds.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          updated: { type: "string", required: true },
          count: { type: "integer", required: true },
          sources: { additionalProperties: true, type: "object", required: true },
          path: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: "feed index synced: " + value.count + " plugins (github " + value.sources.github + " / npm " + value.sources.npm + ") -> " + value.path }],
    },
    execute: async (_args, exec) => {
      const cwd = cwdOf(exec);
      const token = config.githubTokenEnv ? process.env[config.githubTokenEnv] : undefined;
      const index = await sync({ githubToken: token, signal: exec.signal });
      const path = writeIndex(cwd, config.file, index);
      return { updated: index.updated, count: index.count, sources: index.sources, path };
    },
    presentCall: () => ({ card: "generic", title: "Sync dsh plugin index", kind: "other", rawInput: {} }),
  }));

  ctx.tools.register(defineTool({
    name: "feed_search",
    description: "Search the aggregated dsh plugin index (GitHub dsh-plugin topic + npm) by natural language. Returns ranked plugins with stars, topics, and npm package names when known. Run feed_sync first if the index does not exist.",
    parameters: {
      query: { type: "string", required: true, description: "Natural-language query (English or Chinese)." },
      limit: { type: "integer", description: "Max results (1-20, default from config)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer", required: true },
          stale: { type: "boolean", required: true },
          results: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: {
                name: { type: "string", required: true },
                url: { type: "string", required: true },
                description: { type: "string", required: true },
                stars: { type: "integer", required: true },
                topics: { type: "array", required: true, items: { type: "string" } },
                npmName: { type: "string" },
                score: { type: "integer", required: true },
                hits: { type: "array", required: true, items: { type: "string" } },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = [value.count + " result" + (value.count === 1 ? "" : "s") + (value.stale ? " (index stale — run feed_sync)" : "")];
        for (const r of value.results) {
          lines.push("## " + r.name + " (score " + r.score + ", " + r.stars + " stars)");
          if (r.description) lines.push(r.description);
          if (r.npmName) lines.push("npm: " + r.npmName);
          if (r.topics.length) lines.push("topics: " + r.topics.slice(0, 8).join(", "));
          lines.push(r.url);
          lines.push("");
        }
        if (value.count === 0) lines.push("No matches — try feed_sync for a fresh index or different terms.");
        return [{ type: "text", text: lines.join("\n").trimEnd() }];
      },
    },
    execute: async (args, exec) => {
      const cwd = cwdOf(exec);
      const index = readIndex(cwd, config.file);
      if (!index) {
        throw new Error("feed index not found at " + config.file + " — run feed_sync first");
      }
      const limit = Number.isInteger(args.limit) ? args.limit : config.limit;
      const results = searchIndex(index, String(args.query), limit);
      const age = indexAgeMs(cwd, config.file);
      return { count: results.length, stale: age !== null && age > 6 * 60 * 60 * 1000, results };
    },
    presentCall: (args) => ({ card: "generic", title: "Feed search: " + String(args.query).slice(0, 60), kind: "other", rawInput: args }),
  }));

  ctx.tools.register(defineTool({
    name: "feed_stats",
    description: "Statistics over the aggregated dsh plugin index: total plugins, sources, top topics, npm coverage, last update.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer", required: true },
          sources: { additionalProperties: true, type: "object", required: true },
          updated: { type: "string" },
          npmCount: { type: "integer", required: true },
          topTopics: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: { topic: { type: "string", required: true }, count: { type: "integer", required: true } },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ["feed index: " + value.count + " plugins" + (value.updated ? " (updated " + value.updated.slice(0, 10) + ")" : "")];
        lines.push("sources: " + JSON.stringify(value.sources));
        lines.push("npm packages: " + value.npmCount);
        lines.push("top topics: " + value.topTopics.slice(0, 10).map((t) => t.topic + "(" + t.count + ")").join(", "));
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (_args, exec) => {
      const cwd = cwdOf(exec);
      const index = readIndex(cwd, config.file);
      if (!index) {
        throw new Error("feed index not found at " + config.file + " — run feed_sync first");
      }
      return statsIndex(index);
    },
    presentCall: () => ({ card: "generic", title: "Feed index stats", kind: "other", rawInput: {} }),
  }));

  ctx.effect(() => ctx.systemPrompt.section({
    name: "feed:instructions",
    order: config.sectionOrder,
    text: FEED_SECTION_TEXT,
  }), "feed.section()");
}

export { Config, FEED_SECTION_TEXT, apply, inject, name };
