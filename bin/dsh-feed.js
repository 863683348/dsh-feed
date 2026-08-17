#!/usr/bin/env node
/**
 * dsh-feed CLI — the aggregation base outside the DSH runtime.
 *
 *   dsh-feed sync [--cwd DIR] [--file REL]            fetch GitHub topic + npm -> index JSON
 *   dsh-feed search <query> [--cwd DIR] [--file REL] [--limit N]
 *   dsh-feed stats [--cwd DIR] [--file REL]
 *   dsh-feed mcp                                     minimal stdio MCP server (experimental)
 *
 * Token: GITHUB_TOKEN env (optional, raises GitHub rate limits).
 * @module dsh-feed/bin
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import readline from "node:readline";
import { readIndex, writeIndex } from "../lib/index-store.js";
import { searchIndex, statsIndex } from "../lib/query.js";
import { sync } from "../lib/sync.js";

const FILE = ".dsh/dsh-feed.json";

function argValue(args, flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

async function cmdSync(args) {
  const cwd = argValue(args, "--cwd", process.cwd());
  const file = argValue(args, "--file", FILE);
  const index = await sync({ githubToken: process.env.GITHUB_TOKEN });
  const path = writeIndex(cwd, file, index);
  console.log("synced " + index.count + " plugins (github " + index.sources.github + " / npm " + index.sources.npm + ") -> " + path);
}

function cmdSearch(args) {
  const cwd = argValue(args, "--cwd", process.cwd());
  const file = argValue(args, "--file", FILE);
  const query = args.find((a) => !a.startsWith("-"));
  if (!query) {
    console.error("usage: dsh-feed search <query> [--cwd DIR] [--limit N]");
    process.exit(2);
  }
  const index = readIndex(cwd, file);
  if (!index) {
    console.error("index not found at " + file + " — run: dsh-feed sync");
    process.exit(3);
  }
  const limit = Number(argValue(args, "--limit", "5"));
  for (const r of searchIndex(index, query, limit)) {
    console.log("# " + r.name + " (" + r.stars + " stars, score " + r.score + ")");
    if (r.description) console.log(r.description);
    if (r.npmName) console.log("npm: " + r.npmName);
    console.log(r.url);
    console.log("");
  }
}

function cmdStats(args) {
  const cwd = argValue(args, "--cwd", process.cwd());
  const file = argValue(args, "--file", FILE);
  const index = readIndex(cwd, file);
  if (!index) {
    console.error("index not found at " + file + " — run: dsh-feed sync");
    process.exit(3);
  }
  const s = statsIndex(index);
  console.log(JSON.stringify(s, null, 2));
}

/** Minimal stdio MCP server: tools = feed_search, feed_stats, feed_sync. */
function cmdMcp() {
  const cwd = process.env.DSH_FEED_CWD ?? process.cwd();
  const file = process.env.DSH_FEED_FILE ?? FILE;
  const tools = [
    {
      name: "feed_search",
      description: "Search the aggregated dsh plugin index by natural language.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "number" } },
        required: ["query"],
      },
    },
    { name: "feed_stats", description: "Statistics over the dsh plugin index.", inputSchema: { type: "object" } },
    { name: "feed_sync", description: "Rebuild the index from GitHub + npm (network).", inputSchema: { type: "object" } },
  ];
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", async (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    let result = { jsonrpc: "2.0", id: msg.id ?? null };
    try {
      const method = msg.method ?? "";
      const params = msg.params ?? {};
      if (method === "initialize") {
        result.result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "dsh-feed", version: "0.1.0" } };
      } else if (method === "tools/list") {
        result.result = { tools };
      } else if (method === "tools/call") {
        const name = params.name;
        const args = params.arguments ?? {};
        if (name === "feed_search") {
          const index = readIndex(cwd, file);
          if (!index) throw new Error("index not found — call feed_sync first");
          result.result = { content: [{ type: "text", text: JSON.stringify(searchIndex(index, String(args.query ?? ""), Number(args.limit ?? 5))) }] };
        } else if (name === "feed_stats") {
          const index = readIndex(cwd, file);
          if (!index) throw new Error("index not found — call feed_sync first");
          result.result = { content: [{ type: "text", text: JSON.stringify(statsIndex(index)) }] };
        } else if (name === "feed_sync") {
          const index = await sync({ githubToken: process.env.GITHUB_TOKEN });
          const path = writeIndex(cwd, file, index);
          result.result = { content: [{ type: "text", text: JSON.stringify({ count: index.count, sources: index.sources, path }) }] };
        } else {
          throw new Error("unknown tool " + name);
        }
      } else {
        result.error = { code: -32601, message: "method not found: " + method };
      }
    } catch (e) {
      result.error = { code: -32603, message: String(e.message ?? e) };
    }
    process.stdout.write(JSON.stringify(result) + "\n");
  });
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "sync": await cmdSync(rest); break;
  case "search": cmdSearch(rest); break;
  case "stats": cmdStats(rest); break;
  case "mcp": cmdMcp(); break;
  default:
    console.log("dsh-feed — cross-ecosystem dsh plugin index\n\nusage: dsh-feed <sync|search|stats|mcp> [options]\n\n  sync     fetch GitHub dsh-plugin topic + npm into an index JSON\n  search   query the index (natural language)\n  stats    index statistics\n  mcp      minimal stdio MCP server (experimental)");
    process.exit(1);
}
