import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

// Public provider observations only. Original source times survive restarts.
export function observationStore(file, seed, maxAge = 3 * 86400000) {
  let writing = Promise.resolve();
  async function load() {
    const records = new Map();
    for (const path of [seed, file].filter(Boolean)) {
      try {
        const bytes = await readFile(path);
        const body = JSON.parse(
          bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes,
        );
        if (body.version !== 1 || !Array.isArray(body.observations)) continue;
        for (const [key, value] of body.observations) {
          const at = Date.parse(value?.retrievedAt);
          if (
            typeof key !== "string" ||
            !key.startsWith("/") ||
            !value?.data ||
            !Number.isFinite(at) ||
            at > Date.now() ||
            Date.now() - at > maxAge
          )
            continue;
          if (at > Date.parse(records.get(key)?.retrievedAt || "1970-01-01"))
            records.set(key, value);
        }
      } catch {
        /* A missing or invalid cache cannot authorize a response. */
      }
    }
    return [...records].slice(-500);
  }
  function save(records) {
    if (!file) return Promise.resolve();
    const body = JSON.stringify({ version: 1, observations: [...records] });
    writing = writing
      .catch(() => {})
      .then(async () => {
        const tmp = file + "." + randomUUID() + ".tmp";
        try {
          await mkdir(dirname(file), { recursive: true, mode: 0o700 });
          await writeFile(tmp, body, { mode: 0o600 });
          await rename(tmp, file);
        } catch {
          await unlink(tmp).catch(() => {});
        }
      });
    return writing;
  }
  return { load, save };
}
