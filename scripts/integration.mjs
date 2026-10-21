// Live integration checks: no fixtures, fake responses, or test-only data feeds.
import assert from "node:assert/strict";
import { CHAINS } from "../server/config.mjs";
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
const products = await fetchJson("/api/products?stock=NVDA&chain=all");
assert.ok(products.rows.length >= 8, "Expected broad multi-issuer discovery");
assert.ok(
  products.rows.filter((p) => p.market?.price > 0).length >= 5,
  "Expected actual CoinGecko prices",
);
const enriched = await fetchJson(
  "/api/products?stock=NVDA&chain=all&enrich=true",
);
assert.ok(
  enriched.rows
    .filter((p) => /^wrapped[ -]/i.test(p.name || p.coinId || ""))
    .every((p) => p.wrapped === true),
  "Source-native wrappers must stay explicitly marked and unnormalized",
);
const nativeGrouped = enriched.rows.filter(
  (p) => p.mapping === "CoinGecko RWA grouping",
).length;
const market = await fetchJson("/api/markets?stock=NVDA&chain=all");
assert.ok(
  market.rows.length > 0,
  "Expected actual exact-contract GeckoTerminal pools",
);
for (const pool of market.rows)
  assert.ok(
    products.stock.products.some((p) =>
      p.deployments.some(
        (d) =>
          d.chain === pool.chain &&
          d.address.toLowerCase() === pool.address.toLowerCase(),
      ),
    ),
    "Pool must contain catalog token",
  );
const history = await fetchJson(
  "/api/history?" +
    new URLSearchParams({
      stock: "NVDA",
      pool: market.rows[0].id,
      range: "1d",
    }),
);
assert.ok(history.points.length >= 2, "Expected real hourly price history");
assert.ok(history.points.every((p) => p.price > 0));
const broad = {
  products: products.rows.length,
  nativeGrouped,
  priced: products.rows.filter((p) => p.market?.price > 0).length,
  issuers: [...new Set(products.rows.map((p) => p.issuer))],
  pools: market.rows.length,
  historyPoints: history.points.length,
};
console.log("Broader sources", JSON.stringify(broad));
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
    new Set(quotes.map((q) => q.providerId)).size >= 2,
    `${ticker}: real quotes from multiple providers required`,
  );
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
    assert.ok(q.quoteProvider && Array.isArray(q.liquidityVenues));
    assert.ok(q.tokenQuantity > 0);
    assert.ok(q.explorerUrl.includes(q.address));
    assert.ok(q.buyUrl.includes(q.address));
    const handoff = new URL(q.buyUrl),
      chain = CHAINS[q.chain];
    if (q.providerId === "velora") {
      assert.equal(handoff.hostname, "app.velora.xyz");
      assert.equal(handoff.pathname, `/app/swap/${q.inputAsset}-${q.address}`);
      assert.equal(handoff.searchParams.get("network"), chain.kyber);
      assert.equal(handoff.hash, "");
    } else if (q.providerId === "jupiter") {
      assert.equal(handoff.hostname, "jup.ag");
      assert.equal(handoff.pathname, "/swap");
      assert.equal(handoff.searchParams.get("buy"), q.address);
      assert.equal(handoff.searchParams.get("sell"), q.inputAsset);
    } else if (q.chain === "Solana") {
      assert.equal(handoff.hostname, "raydium.io");
      assert.equal(handoff.searchParams.get("inputMint"), q.inputAsset);
      assert.equal(handoff.searchParams.get("outputMint"), q.address);
    } else {
      assert.equal(handoff.hostname, "kyberswap.com");
      assert.equal(
        handoff.pathname,
        `/swap/${chain.websiteChain}/${q.inputAsset}-to-${q.address}`,
      );
      assert.equal(handoff.search, "");
    }
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
      broad,
      results,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: CoinGecko broad issuer catalog/prices, GeckoTerminal pools/history, real quotes for three stocks, normalized ranking, handoffs and HTTP validation (${Date.now() - start}ms).`,
);
