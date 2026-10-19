import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { loadCatalog, resolveStock } from "../server/catalog.mjs";
import { cgRequest } from "../server/coingecko.mjs";
import { readRuntime } from "../server/runtime.mjs";
const tickers = [
  "NVDA",
  "AAPL",
  "TSLA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "COIN",
  "AMD",
  "SPY",
  "QQQ",
  "PLTR",
];
const catalog = await loadCatalog();
async function retry(work) {
  for (let i = 0; i < 4; i++) {
    try {
      return await work();
    } catch (error) {
      if (
        i === 3 ||
        (error.status && ![429, 500, 502, 503, 504].includes(error.status))
      )
        throw error;
      console.log(
        "Source cooling down; preserving the previous seed:",
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 45000));
    }
  }
}
const coins = new Set();
for (const ticker of tickers) {
  const match = catalog.stocks.find((s) => s.ticker === ticker);
  if (!match?.rwaId) {
    console.log("No native RWA ID, retaining issuer mapping", ticker);
    continue;
  }
  await retry(() =>
    cgRequest(
      `/rwas/${encodeURIComponent(match.rwaId)}?tokens=true&tokenized_market_data=true`,
      12 * 3600000,
    ),
  );
  const { stock } = await resolveStock(match.id, true);
  if (!stock.nativeCheckedAt)
    throw new Error("Native identity was not observed for " + ticker);
  stock.products.forEach((p) => {
    if (p.coinId) coins.add(p.coinId);
  });
  console.log("Observed native grouping", ticker, stock.products.length);
}
await retry(() =>
  cgRequest(
    "/coins/markets?" +
      new URLSearchParams({
        vs_currency: "usd",
        ids: [...coins].sort().join(","),
        per_page: "250",
        page: "1",
        sparkline: "false",
      }),
    300000,
  ),
);
for (const page of [1, 2, 3, 4, 5]) {
  const result = await retry(() =>
    cgRequest(
      "/rwas/markets?" +
        new URLSearchParams({
          per_page: "250",
          page: String(page),
          order: "volume_desc",
          sparkline: "true",
        }),
      600000,
    ),
  );
  console.log("Observed market page", page, result.data.length);
  if (result.data.length < 250) break;
}
const bytes = await readFile(
  join(readRuntime().cacheDir, "coingecko-observations.json"),
);
const data = JSON.parse(bytes);
const createdAt = new Date().toISOString();
const output = new URL(
  "../server/data/coingecko-observations.json.gz",
  import.meta.url,
);
const seed = gzipSync(JSON.stringify({ ...data, createdAt }), { level: 9 });
await mkdir(new URL("../server/data/", import.meta.url), { recursive: true });
await writeFile(output, seed);
await writeFile(
  new URL(
    "../server/data/coingecko-observations.manifest.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      createdAt,
      source: "https://api.coingecko.com/api/v3",
      purpose:
        "Real last-successful public observations. Original retrieval/source dates retained; runtime refreshes or marks stale. Not synthetic live data.",
      observations: data.observations.map(([path, v]) => ({
        path,
        retrievedAt: v.retrievedAt,
      })),
      sha256: createHash("sha256").update(seed).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Saved",
  data.observations.length,
  "real observations",
  seed.length,
  "bytes",
);
