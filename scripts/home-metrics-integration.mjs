// Real public feeds and the same price renderer as Home. No fixture fallback.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { priceComparison } from "../src/reference-view.mjs";
const base = process.env.STOCKLENS_URL || "http://127.0.0.1:4173";
const json = async (path) => {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200, path);
  return response.json();
};
const catalog = await json("/api/catalog");
const soxl = catalog.stocks.filter((s) => s.ticker === "SOXL");
assert.equal(
  soxl.length,
  1,
  "SOXL must not split its reference and issuer versions across duplicate identities",
);
assert.equal(soxl[0].id, "US25459W4583");
const alias = await json(
  "/api/products?stock=cg:direxion-daily-semi-bull-3x-etf&chain=all",
);
assert.equal(
  alias.stock.id,
  soxl[0].id,
  "Existing CoinGecko links must resolve the consolidated stock",
);
assert.ok(alias.stock.products.some((p) => p.issuer === "xstocks"));
assert.ok(alias.stock.products.some((p) => p.issuer === "ondo"));
const results = [];
for (const group of [
  ["NVDA", "MSFT", "SOXL"],
  ["AAPL", "SPY", "CRCL"],
  ["TSLA"],
]) {
  const stocks = group.map((t) => catalog.stocks.find((s) => s.ticker === t));
  assert.ok(stocks.every(Boolean));
  const data = await json(
    "/api/market-details?" +
      new URLSearchParams({ ids: stocks.map((s) => s.id).join(",") }),
  );
  for (const stock of stocks) {
    const detail = data.rows.find((row) => row.id === stock.id);
    assert.ok(
      detail?.reference?.price > 0,
      stock.ticker + ": dated listed price required",
    );
    const html = priceComparison(detail);
    const onchain =
      detail.spotPremium ||
      detail.premium ||
      detail.spot ||
      detail.buyObservation;
    assert.ok(
      onchain?.price > 0,
      stock.ticker + ": real share-normalized onchain price required",
    );
    assert.ok(
      Number.isFinite(detail.spotPremium?.value ?? detail.premium?.value),
      stock.ticker + ": comparable premium required",
    );
    assert.doesNotMatch(
      html,
      /No verified share price available|Prices not time-aligned/,
    );
    if (onchain) {
      const clock = onchain.priceAt ?? onchain.at;
      assert.ok(clock <= Date.now() && Date.now() - clock < 300000);
      assert.ok(onchain.conversionSource?.startsWith("https://"));
    }
    if (!detail.spotPremium && detail.premium)
      assert.match(html, /\$1,000 buy/);
    results.push({
      ticker: stock.ticker,
      reference: detail.reference.price,
      poolPrice: detail.spot?.price ?? null,
      buyPrice: detail.buyObservation?.price ?? null,
      poolPremium: detail.spotPremium?.value ?? null,
      buyPremium: detail.premium?.value ?? null,
      html,
    });
  }
}
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/home-metrics-live.json",
  JSON.stringify(
    { checkedAt: new Date().toISOString(), base, results },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { status: "passed", base, results: results.map(({ html, ...row }) => row) },
    null,
    2,
  ),
);
