import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createCatalogLoader } from "../server/catalog.mjs";
import { ONDO_CSV, ONDO_SOURCE, XSTOCKS_API } from "../server/config.mjs";
import { REALITY_API } from "../server/issuer-catalog.mjs";
import { readSnapshot } from "../server/catalog-snapshot.mjs";

// Captures real public observations; a failed source must never replace the shipping seed.
const fromSnapshot =
  process.argv[2] === "--from-snapshot" ? process.argv[3] : null;
if (process.argv[2] === "--from-snapshot" && !fromSnapshot)
  throw new Error("--from-snapshot requires a snapshot file.");
const outputArgument = fromSnapshot ? process.argv[4] : process.argv[2];
const output = outputArgument
  ? resolve(outputArgument)
  : fileURLToPath(
      new URL("../server/data/catalog-seed.json.gz", import.meta.url),
    );
const capture = await mkdtemp(join(tmpdir(), "stocklens-catalog-capture-"));
const temporary = output + ".tmp";
try {
  const prior = fromSnapshot
    ? await readSnapshot(resolve(fromSnapshot), {
        seed: fromSnapshot.endsWith(".gz"),
      })
    : null;
  if (fromSnapshot && !prior)
    throw new Error("The source snapshot is invalid or its checksum failed.");
  const input = prior
    ? {
        now: () => Date.parse(prior.savedAt),
        sourceRetrievedAt: {
          xstocks: prior.sources.xstocks.retrievedAt,
          ondo: prior.sources.ondo.retrievedAt,
          reality: prior.sources.reality?.retrievedAt,
        },
        getXstocks: async () => prior.sources.xstocks.value,
        getOndo: async () => prior.sources.ondo.value,
        getDiscovery: async () => prior.sources.coingecko.value,
        getReality: async () => {
          if (!prior.sources.reality)
            throw new Error(
              "Snapshot has no Reality observation; capture all live sources first.",
            );
          return prior.sources.reality.value;
        },
      }
    : {};
  const result = await createCatalogLoader({
    cacheDir: capture,
    seedPath: null,
    ...input,
  })();
  if (result.sources.some((source) => !source.available || source.stale))
    throw new Error(
      "Seed refresh requires successful observations from every catalog source.",
    );
  const snapshot = JSON.parse(
    await readFile(join(capture, "canonical-catalog-v1.json"), "utf8"),
  );
  const sha256 = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  const provenance = {
    createdAt: new Date().toISOString(),
    ...(prior
      ? {
          rebuild:
            "Canonical model rebuilt from previously captured public source observations; original source timestamps preserved.",
          originalSnapshotAt: prior.savedAt,
        }
      : {}),
    identityReferences: "server/data/catalog-identity-references.json",
    purpose:
      "Last successful identity observations for cold starts; runtime refreshes determine source availability. Identity data is not a live quote or guarantee of complete market coverage.",
    sources: [
      {
        name: "Reality public catalog",
        url: REALITY_API,
        retrievedAt: snapshot.sources.reality.retrievedAt,
        records: snapshot.sources.reality.value.data.length,
      },
      {
        name: "xStocks public API",
        url: `${XSTOCKS_API}/assets`,
        query: "pageSize=100&page=0..terminal",
        retrievedAt: snapshot.sources.xstocks.retrievedAt,
        records: snapshot.sources.xstocks.value.length,
      },
      {
        name: "Ondo official contract list",
        url: ONDO_SOURCE,
        downloadUrl: ONDO_CSV,
        retrievedAt: snapshot.sources.ondo.retrievedAt,
        records: snapshot.sources.ondo.value.length,
      },
      {
        name: "CoinGecko underlying registry",
        urls: [
          "https://api.coingecko.com/api/v3/rwas/list",
          "https://api.coingecko.com/api/v3/coins/list?include_platform=true",
          "https://api.coingecko.com/api/v3/rwas/issuers/list",
          "https://api.coingecko.com/api/v3/rwas/issuers/{id}",
          "https://api.coingecko.com/api/v3/rwas/{id}?tokens=true&tokenized_market_data=true",
        ],
        retrievedAt: snapshot.sources.coingecko.retrievedAt,
        universe: snapshot.sources.coingecko.value.universe,
        discovery: snapshot.sources.coingecko.value.discoveryCoverage || null,
      },
    ],
    coverage: result.coverage,
    warnings: result.warnings,
    snapshotSha256: sha256,
  };
  const bytes = gzipSync(JSON.stringify({ sha256, provenance, snapshot }), {
    level: 9,
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(temporary, bytes);
  await rename(temporary, output);
  await writeFile(
    output.replace(/\.json\.gz$/, "") + ".manifest.json",
    JSON.stringify(
      {
        ...provenance,
        compressedSha256: createHash("sha256").update(bytes).digest("hex"),
        compressedBytes: bytes.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      output,
      assets: result.stocks.length,
      versions: result.coverage.versions,
      bytes: bytes.length,
      warnings: result.warnings,
    }),
  );
} finally {
  await rm(capture, { recursive: true, force: true });
  await rm(temporary, { force: true });
}
