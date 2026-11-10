import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Keep the research journal separate from the expiring serving cache.
export function createMarketArchive(directory, now = Date.now) {
  let pending = 0,
    writing = Promise.resolve();
  const seen = new Set();
  function record(series, id, at, data) {
    const time = now();
    const sourceTime = typeof at === "number" ? at : Date.parse(at);
    if (
      !directory ||
      !Number.isFinite(sourceTime) ||
      sourceTime > time + 1000 ||
      time - sourceTime > 24 * 3600000 ||
      pending >= 512
    )
      return;
    const bucket = Math.floor(sourceTime / 3600000);
    const key = JSON.stringify([series, id, bucket]);
    if (seen.has(key)) return;
    if (seen.size >= 10000) seen.delete(seen.values().next().value);
    seen.add(key);
    pending++;
    const timestamp = new Date(sourceTime).toISOString();
    const line = JSON.stringify({ series, id, at: timestamp, ...data }) + "\n";
    writing = writing
      .then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await appendFile(
          join(directory, timestamp.slice(0, 10) + ".jsonl"),
          line,
          { mode: 0o600 },
        );
      })
      .catch((error) => {
        seen.delete(key);
        console.error(
          "Market archive write failed:",
          error.code || "write error",
        );
      })
      .finally(() => {
        pending--;
      });
  }
  return { record, flush: () => writing };
}
