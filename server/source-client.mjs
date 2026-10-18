import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { request } from "./http.mjs";
import { readRuntime } from "./runtime.mjs";
const health = new Map();
const catalogWork = new Map();
export function sourceStatus() {
  return [...health.values()].map((value) => ({ ...value }));
}
// A source owns a bounded queue, pacing clock, in-flight coalescing and last-good observations.
export function sourceClient(
  name,
  base,
  interval,
  headers = () => ({}),
  options = {},
) {
  const config = readRuntime();
  const concurrency = options.concurrency ?? config.sourceConcurrency;
  const maxQueue = options.maxQueue ?? config.sourceMaxQueue;
  const queueTimeoutMs = options.queueTimeoutMs ?? 18000;
  const observations = new Map(),
    inflight = new Map(),
    failures = new Map(),
    queue = [];
  let active = 0,
    next = 0,
    cooldownUntil = 0;
  const unavailable = (path, error) => {
    const at = new Date().toISOString(),
      saved = observations.get(path);
    const usable =
      saved &&
      Date.now() - Date.parse(saved.retrievedAt) <= config.sourceStaleMs;
    health.set(name, {
      name,
      status: usable ? "stale" : "unavailable",
      checkedAt: at,
      lastSuccessAt: saved?.retrievedAt ?? null,
      message: error.message,
    });
    if (usable)
      return {
        ...saved,
        stale: true,
        warning: `Last successful observation retained; ${error.message}`,
        lastAttemptAt: at,
      };
    throw error;
  };
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      clearTimeout(job.timer);
      active++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  };
  const schedule = (run) =>
    new Promise((resolve, reject) => {
      if (active >= concurrency && queue.length >= maxQueue) {
        reject(new Error(`${name} is busy. Retry shortly.`));
        return;
      }
      const job = { run, resolve, reject, timer: null };
      job.timer = setTimeout(() => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        reject(new Error(`${name} queue timed out. Retry shortly.`));
      }, queueTimeoutMs);
      queue.push(job);
      pump();
    });
  return (path, ttl = 60000) => {
    const saved = observations.get(path);
    if (saved && saved.expires > Date.now())
      return Promise.resolve({ ...saved, stale: false });
    if (inflight.has(path)) return inflight.get(path);
    const waitDeadline = Date.now() + queueTimeoutMs;
    const work = schedule(async () => {
      if (cooldownUntil > Date.now())
        throw new Error(`${name} rate limit reached. Please retry shortly.`);
      const failed = failures.get(path);
      if (failed?.until > Date.now()) throw new Error(failed.message);
      const wait = Math.max(0, next - Date.now());
      if (Date.now() + wait > waitDeadline)
        throw new Error(`${name} is busy. Retry shortly.`);
      next = Math.max(next, Date.now()) + interval;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (cooldownUntil > Date.now())
        throw new Error(`${name} rate limit reached. Please retry shortly.`);
      try {
        const data = await request(base() + path, {
          headers: headers(),
          timeout: config.sourceTimeoutMs,
        });
        const value = {
          data,
          retrievedAt: new Date().toISOString(),
          expires: Date.now() + ttl,
        };
        if (observations.size >= 500 && !observations.has(path))
          observations.delete(observations.keys().next().value);
        observations.set(path, value);
        failures.delete(path);
        health.set(name, {
          name,
          status: "available",
          checkedAt: value.retrievedAt,
          lastSuccessAt: value.retrievedAt,
        });
        return { ...value, stale: false };
      } catch (error) {
        if (error.status === 429) cooldownUntil = Date.now() + 30000;
        failures.set(path, {
          until: Date.now() + 30000,
          message: error.message,
        });
        if (failures.size > 100) failures.delete(failures.keys().next().value);
        throw error;
      }
    })
      .catch((error) => unavailable(path, error))
      .finally(() => inflight.delete(path));
    inflight.set(path, work);
    return work;
  };
}
export function persistentCatalog(name, load, options = {}) {
  if (!/^[a-z0-9_-]{1,80}$/i.test(name))
    return Promise.reject(new Error("Invalid catalog cache name."));
  const cacheDir = options.cacheDir ?? readRuntime().cacheDir;
  const key = join(cacheDir, name + ".json");
  if (catalogWork.has(key)) return catalogWork.get(key);
  const work = (async () => {
    let saved;
    try {
      saved = JSON.parse(await readFile(key, "utf8"));
    } catch {}
    if (
      !saved ||
      !Number.isFinite(saved.savedAt) ||
      saved.savedAt > Date.now() ||
      typeof saved.value !== "object" ||
      !saved.value
    )
      saved = null;
    if (saved && Date.now() - saved.savedAt < 12 * 3600000)
      return { ...saved.value, cachedAt: saved.savedAt };
    let value;
    try {
      value = await load();
    } catch (error) {
      if (saved && Date.now() - saved.savedAt < 72 * 3600000)
        return {
          ...saved.value,
          stale: true,
          warning: `Catalog snapshot from ${new Date(saved.savedAt).toISOString()}; ${error.message}`,
          cachedAt: saved.savedAt,
        };
      throw error;
    }
    const tmp = key + "." + randomUUID() + ".tmp";
    try {
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      await writeFile(tmp, JSON.stringify({ savedAt: Date.now(), value }), {
        mode: 0o600,
      });
      await rename(tmp, key);
    } catch {
      await unlink(tmp).catch(() => {});
      return {
        ...value,
        persistenceWarning:
          "Cache persistence is unavailable; fresh data remains available.",
      };
    }
    return value;
  })().finally(() => catalogWork.delete(key));
  catalogWork.set(key, work);
  return work;
}
