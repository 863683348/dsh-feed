import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, searchIndex, statsIndex } from "../lib/query.js";
import { normalizeGithubItem } from "../lib/sync.js";
import { indexTarget } from "../lib/index-store.js";

test("tokenize handles English and Chinese", () => {
  const t = tokenize("notify me when task done 通知提醒");
  assert.ok(t.includes("notify"));
  assert.ok(t.includes("done"));
  assert.ok(t.includes("通知"));
  assert.ok(t.includes("提醒"));
});

test("searchIndex finds by english", () => {
  const index = { plugins: [
    { name: "owner/dsh-notify", description: "completion notifications", topics: ["notify"], stars: 5 },
    { name: "owner/dsh-memory", description: "context memory", topics: ["memory"], stars: 10 },
  ] };
  const res = searchIndex(index, "notification when done", 5);
  assert.ok(res.length >= 1);
  assert.ok(res[0].name.includes("notify"));
  assert.ok(res[0].score > 0 && res[0].hits.length > 0);
});

test("searchIndex ranks stars as tiebreaker", () => {
  const index = { plugins: [
    { name: "a/dsh-notify-a", description: "notify", topics: [], stars: 1 },
    { name: "b/dsh-notify-b", description: "notify", topics: [], stars: 99 },
  ] };
  const res = searchIndex(index, "notify", 5);
  assert.equal(res[0].name, "b/dsh-notify-b");
});

test("searchIndex rejects empty query", () => {
  assert.throws(() => searchIndex({ plugins: [] }, "  "), /non-empty/);
});

test("statsIndex aggregates counts and topics", () => {
  const index = { updated: "2026-08-16", sources: { github: 2, npm: 1 }, plugins: [
    { name: "a", topics: ["dsh-plugin", "notify"] },
    { name: "b", topics: ["dsh-plugin", "memory"], npmName: "b" },
  ] };
  const s = statsIndex(index);
  assert.equal(s.count, 2);
  assert.equal(s.npmCount, 1);
  assert.equal(s.topTopics[0].topic, "dsh-plugin");
  assert.equal(s.sources.github, 2);
});

test("normalizeGithubItem extracts fields", () => {
  const n = normalizeGithubItem({ full_name: "o/r", html_url: "https://github.com/o/r", description: "d", stargazers_count: 7, updated_at: "t", topics: ["a", "b"] });
  assert.deepEqual(n, { name: "o/r", url: "https://github.com/o/r", description: "d", stars: 7, updatedAt: "t", topics: ["a", "b"] });
});

test("indexTarget rejects absolute and traversal paths", () => {
  assert.throws(() => indexTarget("C:/w", "/abs/path.json"), /relative/);
  assert.throws(() => indexTarget("C:/w", "../evil.json"), /traverse/);
  const ok = indexTarget("C:/w", ".dsh/feed.json");
  assert.ok(ok.endsWith(".dsh" + "\\" + "feed.json") || ok.endsWith(".dsh/feed.json"));
});
