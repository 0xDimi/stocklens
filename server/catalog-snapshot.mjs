import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

export const catalogSchema = 1;
export const defaultSeedPath = new URL(
  "./data/catalog-seed.json.gz",
  import.meta.url,
);
export function validSnapshot(value) {
  return (
    value?.schemaVersion === catalogSchema &&
    value.sources &&
    typeof value.sources === "object" &&
    (!value.catalog || Array.isArray(value.catalog.stocks))
  );
}
export async function readSnapshot(path, { seed = false } = {}) {
  if (!path) return null;
  try {
    const bytes = await readFile(path);
    const value = JSON.parse(
      seed ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8"),
    );
    if (seed) {
      const checksum = createHash("sha256")
        .update(JSON.stringify(value.snapshot))
        .digest("hex");
      if (value.sha256 !== checksum || !validSnapshot(value.snapshot))
        return null;
      return value.snapshot;
    }
    return validSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}
export async function writeSnapshot(path, value) {
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, path);
    return null;
  } catch {
    await unlink(tmp).catch(() => {});
    return "Catalog cache persistence is unavailable; fresh data remains available.";
  }
}
