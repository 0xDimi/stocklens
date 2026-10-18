// Live integration checks: no fixtures, fake responses, or test-only data feeds.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.STOCKLENS_URL || "http://127.0.0.1:4173";
const start = Date.now();
const fetchJson = async (path) => {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(90_000),
  });
  assert.equal(response.status, 200, `${path} HTTP ${response.status}`);
  return response.json();
};
const catalog = await fetchJson("/api/catalog");
assert.ok(catalog.stocks.length > 0);
assert.ok(catalog.stocks.some((s) => s.ticker === "NVDA"));
const results = [];
for (const ticker of ["NVDA", "AAPL", "TSLA"]) {
  const stock = catalog.stocks.find((s) => s.ticker === ticker);
  const data = await fetchJson(
    `/api/compare?stock=${stock.id}&amount=1000&chain=all`,
  );
  assert.equal(data.stock.id, stock.id);
  assert.ok(data.rows.length > 0);
  const quotes = data.rows.filter((r) => r.status === "quoted");
  assert.ok(
    quotes.length > 0,
    `${ticker}: expected at least one real stock-token quote`,
  );
  const normalized = quotes.filter((r) => r.rankable);
  assert.ok(
    normalized.length > 0,
    `${ticker}: expected verified normalized exposure`,
  );
  for (const q of quotes) {
    assert.ok(q.tokenQuantity > 0);
    assert.ok(q.explorerUrl.includes(q.address));
    assert.ok(q.buyUrl.includes(q.address));
    assert.ok(q.expiresAt > q.fetchedAt);
    if (q.equivalentShares != null)
      assert.ok(
        Math.abs(q.effectivePrice * q.equivalentShares - 1000) < 0.0001,
      );
  }
  for (let i = 1; i < normalized.length; i++)
    assert.ok(normalized[i - 1].effectivePrice <= normalized[i].effectivePrice);
  const summary = {
    ticker,
    deployments: data.rows.length,
    quotes: quotes.length,
    normalized: normalized.length,
    rows: data.rows.map((r) => ({
      symbol: r.symbol,
      chain: r.chain,
      status: r.status,
      price: r.effectivePrice ?? null,
      shares: r.equivalentShares ?? null,
      reason: r.reason ?? r.conversionWarning ?? null,
    })),
  };
  results.push(summary);
  console.log(JSON.stringify(summary));
}
const bad = await fetch(base + "/api/compare?amount=not-a-number");
assert.equal(bad.status, 400);
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/live-integration.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      catalogSize: catalog.stocks.length,
      warnings: catalog.warnings,
      results,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: live catalog, real quotes for all three stocks, normalized ranking, exact handoff links, and HTTP validation (${Date.now() - start}ms).`,
);
