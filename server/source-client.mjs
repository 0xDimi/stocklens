import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { request, memo } from "./http.mjs";

const health = new Map();
export function sourceStatus() {
  return [...health.values()];
}
// Pace public APIs globally, coalesce identical requests, and retain failures briefly.
export function sourceClient(name, base, interval, headers = () => ({})) {
  let next = 0,
    cooldownUntil = 0;
  const failures = new Map();
  return (path, ttl = 60_000) =>
    memo(`${name}:${path}`, ttl, async () => {
      if (cooldownUntil > Date.now())
        throw new Error(
          `${name} rate limit reached. Retry after ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds.`,
        );
      const failed = failures.get(path);
      if (failed?.until > Date.now()) throw new Error(failed.message);
      const wait = Math.max(0, next - Date.now());
      if (wait > 18_000) throw new Error(`${name} is busy. Retry shortly.`);
      next = Math.max(next, Date.now()) + interval;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (cooldownUntil > Date.now())
        throw new Error(`${name} rate limit reached. Please retry shortly.`);
      try {
        const data = await request(base() + path, {
          headers: headers(),
          timeout: 10_000,
        });
        health.set(name, {
          name,
          status: "available",
          checkedAt: new Date().toISOString(),
        });
        return { data, retrievedAt: new Date().toISOString() };
      } catch (error) {
        if (error.status === 429) cooldownUntil = Date.now() + 30_000;
        failures.set(path, {
          until: Date.now() + 30_000,
          message: error.message,
        });
        if (failures.size > 100) failures.delete(failures.keys().next().value);
        health.set(name, {
          name,
          status: "unavailable",
          checkedAt: new Date().toISOString(),
          message: error.message,
        });
        throw error;
      }
    });
}
export async function persistentCatalog(name, load) {
  const file = new URL(`../.cache/${name}.json`, import.meta.url);
  let saved;
  try {
    saved = JSON.parse(await readFile(file, "utf8"));
  } catch {}
  if (saved && Date.now() - saved.savedAt < 12 * 3600_000)
    return { ...saved.value, cachedAt: saved.savedAt };
  try {
    const value = await load();
    await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
    const tmp = new URL(file.href + ".tmp");
    await writeFile(tmp, JSON.stringify({ savedAt: Date.now(), value }), {
      mode: 0o600,
    });
    await rename(tmp, file);
    return value;
  } catch (error) {
    if (saved && Date.now() - saved.savedAt < 72 * 3600_000)
      return {
        ...saved.value,
        warning: `Catalog snapshot from ${new Date(saved.savedAt).toISOString()}; ${error.message}`,
        cachedAt: saved.savedAt,
      };
    throw error;
  }
}
