import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { sourceClient } from "../server/source-client.mjs";
import { getFundamentals } from "../server/fundamentals.mjs";
import { mapLimit } from "../server/http.mjs";

const BASE = "https://api.nasdaq.com/api";
const publicPath =
  /^(?:\/quote\/[A-Z0-9.\-]{1,12}\/(?:info|summary)\?assetclass=(?:stocks|etf)|\/analyst\/[A-Z0-9.\-]{1,12}\/peg-ratio)$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const securities = [
  ["NVDA", "NVIDIA"],
  ["AAPL", "Apple"],
  ["TSLA", "Tesla"],
  ["MSFT", "Microsoft"],
  ["AMZN", "Amazon.com"],
  ["GOOGL", "Alphabet"],
  ["META", "Meta"],
  ["COIN", "Coinbase"],
  ["AMD", "AMD"],
  ["MMM", "3M"],
  ["BRK.B", "Berkshire Hathaway"],
  ["SPY", "SPDR S&P 500 ETF Trust", "ETF"],
  ["QQQ", "Invesco QQQ Trust", "ETF"],
  ["PLUG", "Plug Power"],
  ["BABA", "Alibaba"],
  ["ARM", "ARM"],
  ["ABT", "Abbott"],
  ["ABBV", "AbbVie"],
  ["ADBE", "Adobe"],
  ["NFLX", "Netflix"],
  ["UNH", "UnitedHealth"],
  ["V", "Visa"],
  ["MA", "Mastercard"],
  ["JPM", "JPMorgan Chase"],
  ["UPS", "UPS"],
];

export function buildFundamentalsSeed(
  records,
  capturedAt = new Date().toISOString(),
) {
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured) || !Array.isArray(records) || !records.length)
    throw new Error("A seed requires dated public Nasdaq observations.");
  const seen = new Set();
  const observations = records.map(([path, observation]) => {
    const at = Date.parse(observation?.retrievedAt);
    if (
      !publicPath.test(path) ||
      seen.has(path) ||
      !observation?.data?.data ||
      observation.data.status?.rCode !== 200 ||
      !Number.isFinite(at) ||
      at > captured
    )
      throw new Error(
        "Refusing an invalid, duplicate, future-dated, or non-public Nasdaq observation.",
      );
    seen.add(path);
    // Expire the bundled cache so every deployment tries the live source first.
    return [
      path,
      {
        data: observation.data,
        retrievedAt: observation.retrievedAt,
        expires: 0,
      },
    ];
  });
  observations.sort(([a], [b]) => a.localeCompare(b));
  const body = Buffer.from(JSON.stringify({ version: 1, observations }));
  const compressed = gzipSync(body, { level: 9 });
  const times = observations
    .map(([, observation]) => observation.retrievedAt)
    .sort();
  return {
    compressed,
    manifest: {
      version: 1,
      file: "nasdaq-observations.json.gz",
      capturedAt,
      purpose:
        "Cached public Nasdaq observations for source outages; not live data. Original retrieval times are preserved.",
      expirationPolicy:
        "Bundled observations have expires=0 and require a live refresh. Runtime SOURCE_STALE_MS limits stale fallback; expired observations are never renewed by packaging.",
      refreshCommand: "node scripts/refresh-fundamentals-seed.mjs",
      sha256: sha256(compressed),
      uncompressedSha256: sha256(body),
      observationCount: observations.length,
      earliestRetrievedAt: times[0],
      latestRetrievedAt: times.at(-1),
      observations: observations.map(([path, observation]) => ({
        source: BASE + path,
        retrievedAt: observation.retrievedAt,
        payloadSha256: sha256(JSON.stringify(observation.data)),
      })),
    },
  };
}

async function refresh() {
  const captureDir = await mkdtemp(join(tmpdir(), "stocklens-nasdaq-capture-"));
  const cacheFile = join(captureDir, "observations.json");
  const started = Date.now();
  try {
    // No seed is loaded here: this manual command captures fresh public requests.
    const getSource = sourceClient(
      "Nasdaq seed refresh",
      () => BASE,
      250,
      () => ({ "User-Agent": "Mozilla/5.0", Accept: "application/json" }),
      { cacheFile },
    );
    const rows = await mapLimit(
      securities,
      4,
      async ([ticker, name, category = "Stock"]) => ({
        ticker,
        category,
        reference: await getFundamentals(
          { id: ticker, ticker, name, category },
          { getSource },
        ),
      }),
    );
    const missing = rows.filter(
      (row) =>
        !row.reference?.available ||
        (row.category === "Stock" &&
          row.reference.marketCapStatus !== "available"),
    );
    if (missing.length)
      throw new Error(
        "Seed refresh incomplete for: " +
          missing.map((row) => row.ticker).join(", "),
      );
    const cache = JSON.parse(await readFile(cacheFile, "utf8"));
    if (cache.observations.length !== 73)
      throw new Error(
        "Seed refresh did not capture all 73 requested public responses.",
      );
    const { compressed, manifest } = buildFundamentalsSeed(cache.observations);
    const directory = new URL("../server/data/", import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(
      new URL("nasdaq-observations.json.gz", directory),
      compressed,
    );
    await writeFile(
      new URL("nasdaq-observations.manifest.json", directory),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          elapsedMs: Date.now() - started,
          securities: rows.length,
          companyCaps: rows.filter(
            (row) => row.reference.marketCapStatus === "available",
          ).length,
          reportedFiscalPe: rows.filter(
            (row) => row.reference.peStatus === "available",
          ).length,
          observations: manifest.observationCount,
          bytes: compressed.length,
          sha256: manifest.sha256,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  refresh().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
