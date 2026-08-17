/**
 * dsh-feed — index file store. The index lives at <cwd>/<file> (default
 * .dsh/dsh-feed.json). Relative path only; traversal is rejected.
 * @module dsh-feed/index-store
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/** Resolve and validate the index path for a cwd. */
export function indexTarget(cwd, file) {
  if (typeof file !== "string" || file.length === 0) throw new Error("dsh-feed: invalid index file path");
  if (isAbsolute(file)) throw new Error("dsh-feed: index file must be relative to the workspace");
  const parts = file.split(/[\\/]+/);
  if (parts.some((p) => p === "..")) throw new Error("dsh-feed: index file must not traverse upwards");
  return join(resolve(cwd), ...parts);
}

/** Read the index; returns null when missing. */
export function readIndex(cwd, file) {
  const target = indexTarget(cwd, file);
  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

/** Write the index, creating parent directories. */
export function writeIndex(cwd, file, index) {
  const target = indexTarget(cwd, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(index, null, 2) + "\n", "utf8");
  return target;
}

/** Index file mtime, for staleness hints. */
export function indexAgeMs(cwd, file, now = Date.now()) {
  const target = indexTarget(cwd, file);
  try {
    return now - statSync(target).mtimeMs;
  } catch {
    return null;
  }
}
