// Actual HTTP integration against the running app and live provider responses.
// No fixtures or provider mocks. An unavailable provider fails the integration.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = (process.env.STOCKLENS_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const startedAt = Date.now();
async function json(path, expectedStatus = 200) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `${path}: ${JSON.stringify(body).slice(0, 500)}`,
  );
  return body;
}
function noMissingSource(result, label) {
  assert.ok(
    result.retrievedAt,
    `${label}: expected successful provider retrieval`,
  );
  assert.notEqual(
    result.stale,
    true,
    `${label}: stale fallback cannot establish current integration success`,
  );
}
const catalog = await json("/api/catalog");
assert.ok(catalog.stocks.length > 0, "Expected actual catalog");
const nvidia = catalog.stocks.find((stock) => stock.rwaId === "nvidia");
assert.ok(nvidia, "Expected exact NVIDIA RWA mapping");

const screener = await json("/api/screener?page=1");
noMissingSource(screener, "screener");
assert.equal(
  screener.rows.length,
  catalog.stocks.length,
  "Unknown markets remain catalog rows",
);
assert.ok(screener.scope.returned > 0);
assert.ok(screener.scope.matched > 0);
assert.ok(
  screener.rows.some((row) => row.market?.sparkline.length > 2),
  "Expected actual provider sparkline",
);
assert.ok(
  screener.rows
    .filter((row) => row.market)
    .every((row) =>
      catalog.stocks.some(
        (stock) => stock.id === row.id && stock.rwaId === row.rwaId,
      ),
    ),
);
const selected = await json(
  "/api/screener?" + new URLSearchParams({ ids: nvidia.id }),
);
assert.equal(selected.rows.length, 1);
assert.equal(selected.rows[0].id, nvidia.id);
assert.ok(selected.rows[0].market?.price > 0);
assert.ok(selected.rows[0].market?.updatedAt);

const coinId = nvidia.products.find(
  (product) => product.coinId === "nvidia-xstock",
)?.coinId;
assert.ok(coinId, "Expected exact NVIDIA xStock token mapping");
const venues = await json(
  "/api/venues?" +
    new URLSearchParams({ stock: nvidia.id, coin: coinId, chain: "all" }),
);
noMissingSource(venues, "venues");
assert.ok(venues.rows.length > 0, "Expected actual market venues");
assert.ok(venues.rows.some((row) => row.priceUsd > 0 && row.volumeUsd > 0));
for (const row of venues.rows) {
  assert.equal(row.coinId, coinId);
  assert.ok(row.exchange && row.pair);
  const url = new URL(row.url);
  assert.equal(url.protocol, "https:");
  assert.ok(["exchange-market", "market-directory"].includes(row.urlKind));
  if (row.urlKind === "market-directory")
    assert.equal(url.hostname, "www.coingecko.com");
}

const pools = await json(
  "/api/markets?" + new URLSearchParams({ stock: nvidia.id, chain: "all" }),
);
assert.ok(
  pools.rows.length > 0,
  "Expected real exact-contract pools for candle history",
);
const history = await json(
  "/api/history?" +
    new URLSearchParams({
      stock: nvidia.id,
      pool: pools.rows[0].id,
      range: "1d",
    }),
);
noMissingSource(history, "history");
assert.ok(history.points.length >= 2, "Expected observed candles");
let previous = 0;
for (const point of history.points) {
  assert.ok(point.time > previous, "Observed candle times must increase");
  previous = point.time;
  assert.ok(
    point.open > 0 && point.close > 0 && point.low > 0 && point.high > 0,
  );
  assert.equal(point.price, point.close);
  assert.ok(point.high >= Math.max(point.open, point.close, point.low));
  assert.ok(point.low <= Math.min(point.open, point.close));
  assert.ok(point.time >= startedAt - 86_400_000 && point.time <= Date.now());
}
await json("/api/screener?page=0", 400);
await json("/api/screener?ids=nonexistent-stock", 400);
await json(
  "/api/venues?" +
    new URLSearchParams({ stock: nvidia.id, coin: "tesla-xstock" }),
  400,
);
await json(
  "/api/venues?" +
    new URLSearchParams({ stock: nvidia.id, coin: coinId, page: "11" }),
  400,
);

const summary = {
  checkedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  base,
  catalog: catalog.stocks.length,
  screener: {
    observed: screener.scope.returned,
    matched: screener.scope.matched,
    unknown: screener.rows.filter((row) => !row.market).length,
    nextPage: screener.scope.nextPage,
    retrievedAt: screener.retrievedAt,
  },
  selected: {
    id: nvidia.id,
    price: selected.rows[0].market.price,
    updatedAt: selected.rows[0].market.updatedAt,
  },
  venues: {
    coinId,
    rows: venues.rows.length,
    exchanges: [...new Set(venues.rows.map((row) => row.exchange))],
    retrievedAt: venues.retrievedAt,
  },
  history: {
    points: history.points.length,
    pool: history.pool.id,
    retrievedAt: history.retrievedAt,
  },
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/terminal-integration.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
console.log(
  "PASS: actual screener, selected-ID retrieval, token venues, OHLC candles, and HTTP validation.",
);
