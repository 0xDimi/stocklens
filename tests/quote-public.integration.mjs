// Explicit integration: node tests/quote-public.integration.mjs
// Uses only documented public endpoints and the dated, checksummed issuer seed.
import assert from "node:assert/strict";
import { readSnapshot, defaultSeedPath } from "../server/catalog-snapshot.mjs";
import { collectQuoteOptions } from "../server/quotes.mjs";
import { rankQuotes, toBaseUnits } from "../src/model.mjs";
import { CHAINS } from "../server/config.mjs";

const snapshot = await readSnapshot(defaultSeedPath, { seed: true });
assert.ok(
  snapshot?.catalog?.stocks?.length,
  "Issuer identity seed is required.",
);
const providers = new Set();
for (const ticker of ["NVDA", "AAPL", "TSLA"]) {
  const stock = snapshot.catalog.stocks.find((s) => s.ticker === ticker);
  assert.ok(stock, `${ticker} issuer identity required`);
  const jobs = stock.products
    .filter((p) => ["xstocks", "ondo"].includes(p.issuer))
    .flatMap((product) =>
      product.deployments
        .filter((d) =>
          ["Solana", "Ethereum", "BinanceSmartChain"].includes(d.chain),
        )
        .map((deployment) => ({ product, deployment })),
    );
  const started = Date.now();
  const rows = rankQuotes(await collectQuoteOptions(jobs, "1000"));
  const quoted = rows.filter((row) => row.status === "quoted");
  assert.ok(
    quoted.length,
    `${ticker}: at least one genuine public quote required`,
  );
  assert.ok(
    rows.some((row) => row.rankable),
    `${ticker}: fresh, independently converted exposure required`,
  );
  assert.equal(
    new Set(rows.map((row) => row.id)).size,
    rows.length,
    "Provider rows must have distinct IDs",
  );
  for (const row of quoted) {
    providers.add(row.providerId);
    assert.equal(
      row.inputAmount,
      toBaseUnits("1000", CHAINS[row.chain].decimals),
    );
    assert.ok(
      jobs.some(
        ({ product, deployment }) =>
          product.issuer === row.issuer &&
          deployment.chain === row.chain &&
          deployment.address === row.address,
      ),
      "Exact output contract required",
    );
    assert.ok(BigInt(row.outputAmount) > 0n);
    assert.ok(Array.isArray(row.liquidityVenues));
    assert.ok(row.quoteSource.startsWith("https://"));
    if (row.equivalentShares == null)
      assert.equal(row.rankable, false, "Unverified conversion must not rank");
  }
  const solanaOndo = quoted.find(
    (row) =>
      row.issuer === "ondo" &&
      row.chain === "Solana" &&
      row.providerId === "jupiter",
  );
  assert.ok(
    solanaOndo,
    `${ticker}: previously missing Solana Ondo quote must be recovered through Jupiter`,
  );
  console.log(
    JSON.stringify({
      ticker,
      elapsedMs: Date.now() - started,
      quoteCount: quoted.length,
      freshNormalizedCount: rows.filter((row) => row.rankable).length,
      providers: [...new Set(quoted.map((row) => row.quoteProvider))],
      routes: quoted.map((row) => ({
        symbol: row.symbol,
        chain: row.chain,
        provider: row.quoteProvider,
        liquidityVenues: row.liquidityVenues,
      })),
    }),
  );
}
assert.ok(providers.has("jupiter"), "Live Jupiter coverage required");
assert.ok(providers.has("velora"), "Live Velora coverage required");
console.log(
  "PASS: genuine keyless Jupiter and Velora quotes, restored Solana Ondo coverage, exact contracts/amounts, fee-adjusted output, and fresh normalized comparisons.",
);
