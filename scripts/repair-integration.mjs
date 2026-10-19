import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = (process.env.STOCKLENS_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
async function json(path, status = 200) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${path}: ${JSON.stringify(data).slice(0, 300)}`,
  );
  return data;
}
const startedAt = new Date().toISOString();
const catalog = await json("/api/catalog");
assert.ok(
  catalog.stocks.length >= 1900,
  "Full validated catalog must survive a cold deployment",
);
assert.equal(
  new Set(catalog.stocks.map((s) => s.id)).size,
  catalog.stocks.length,
);
const selected = ["NVDA", "AAPL", "TSLA"].map((t) =>
  catalog.stocks.find((s) => s.ticker === t),
);
const metrics = await json(
  "/api/market-details?" +
    new URLSearchParams({ ids: selected.map((s) => s.id).join(",") }),
);
for (const row of metrics.rows) {
  assert.ok(
    row.reference?.marketCap > 0,
    `${row.id}: real company cap required`,
  );
  assert.ok(row.reference?.pe > 0, `${row.id}: reported fiscal P/E required`);
  assert.match(row.reference.pePeriod, /Actual$/);
  assert.equal(
    typeof row.premium?.value,
    "number",
    `${row.id}: source-backed premium required`,
  );
  assert.equal(row.premium.budget, 1000);
  assert.ok(row.premium.source.startsWith("https://"));
  assert.ok(row.premium.conversionSource.startsWith("https://"));
  assert.ok(row.premium.expiresAt > Date.now());
}
const etfs = ["SPY", "QQQ", "NVDL"].map((t) =>
  catalog.stocks.find((s) => s.ticker === t),
);
assert.ok(etfs.every((s) => s.category === "ETF"));
const funds = await json(
  "/api/market-details?" +
    new URLSearchParams({ ids: etfs.map((s) => s.id).join(",") }),
);
for (const row of funds.rows) {
  if (row.reference) {
    assert.equal(row.reference.marketCap, null);
    assert.equal(row.reference.pe, null);
    assert.equal(row.reference.peStatus, "not-applicable");
  }
}
const apple = await json("/api/products?stock=cg:apple&chain=all");
assert.equal(
  apple.stock.ticker,
  "AAPL",
  "Legacy saved link must resolve Apple, not the default stock",
);
assert.ok(apple.rows.filter((r) => r.market?.price > 0).length >= 3);
const screener = await json("/api/screener?page=1");
assert.ok(screener.rows.filter((r) => r.market?.price > 0).length >= 200);
await json("/api/market-details?ids=not-a-real-stock", 400);
const html = await (await fetch(base + "/")).text();
assert.match(html, /\/src\/app\.mjs\?v=[a-f0-9]+/);
await mkdir("test-results", { recursive: true });
const result = {
  startedAt,
  checkedAt: new Date().toISOString(),
  base,
  assets: catalog.stocks.length,
  catalogMode: catalog.mode,
  catalogSources: catalog.sources,
  metrics: metrics.rows,
  etfs: funds.rows,
  applePrices: apple.rows.filter((r) => r.market?.price > 0).length,
  screenerPrices: screener.rows.filter((r) => r.market?.price > 0).length,
};
await writeFile(
  "test-results/repairs-integration.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: "passed",
      base,
      assets: result.assets,
      metrics: metrics.rows.map((r) => ({
        id: r.id,
        cap: r.reference.marketCap,
        pe: r.reference.pe,
        period: r.reference.pePeriod,
        premium: r.premium.value,
      })),
      applePrices: result.applePrices,
      screenerPrices: result.screenerPrices,
    },
    null,
    2,
  ),
);
