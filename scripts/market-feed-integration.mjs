import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createMarketFeed } from "../src/market-feed.mjs";

const base = (process.env.STOCKLENS_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const requests = [];
const feed = createMarketFeed({
  fetcher: (path, options) => {
    const url = path.startsWith("/") ? base + path : path;
    requests.push(url);
    return fetch(url, { signal: AbortSignal.timeout(35000), ...options });
  },
});
const data = await feed(1);
assert.equal(
  data.stale,
  false,
  data.marketWarning || "Fresh market data required",
);
assert.ok(data.rows.filter((row) => row.market?.price > 0).length >= 200);
const nvda = data.rows.find(
  (row) => row.ticker === "NVDA" && row.rwaId === "nvidia",
);
assert.ok(nvda?.market?.price > 0);
assert.ok(Number.isFinite(Date.parse(nvda.market.updatedAt)));
const calls = requests.filter((url) =>
  url.startsWith("https://api.coingecko.com/"),
).length;
const reused = await feed(1);
assert.equal(
  requests.filter((url) => url.startsWith("https://api.coingecko.com/")).length,
  calls,
);
assert.ok(
  Date.parse(reused.retrievedAt) >= Date.parse(data.retrievedAt),
  "A refresh cannot move observation time backwards",
);
const result = {
  status: "passed",
  base,
  delivery: data.delivery || "server",
  retrievedAt: data.retrievedAt,
  priceCount: data.rows.filter((row) => row.market?.price > 0).length,
  nvda: { price: nvda.market.price, sourceAt: nvda.market.updatedAt },
  publicRequests: calls,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/market-feed-integration.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
