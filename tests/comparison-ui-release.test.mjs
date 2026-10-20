import test from "node:test";
import assert from "node:assert/strict";
import { quoteCoverage, quoteComparison } from "../src/comparison-ui.mjs";
import { listedDate, priceComparison } from "../src/reference-view.mjs";
import { quoteTable } from "../src/views.mjs";

const now = Date.now();
const quoted = {
  issuer: "xstocks",
  symbol: "NVDAx",
  chain: "Solana",
  chainLabel: "Solana",
  address: "CaseSensitiveMint",
  status: "quoted",
  rankable: true,
  effectivePrice: 200,
  equivalentShares: 5,
  tokenQuantity: 5,
  inputQuantity: 1000,
  expiresAt: now + 30000,
  source: "https://xstocks.com",
  explorerUrl: "https://solscan.io/token/CaseSensitiveMint",
  buyUrl: "https://jup.ag",
  quoteProvider: "Jupiter",
  liquidityVenues: ["Orca Whirlpool"],
  id: "jup",
};
test("quote coverage counts deployments separately from provider routes and excludes expired rankings", () => {
  const rows = [
    quoted,
    { ...quoted, id: "ray", quoteProvider: "Raydium", expiresAt: now - 1 },
    {
      ...quoted,
      id: "unsupported",
      chain: "TON",
      address: "Other",
      status: "unavailable",
      reason: "Quotes not connected",
    },
  ];
  assert.deepEqual(quoteCoverage(rows, now), {
    routes: 2,
    fresh: 1,
    normalized: 1,
    deployments: 2,
    quotedDeployments: 1,
    providers: ["Jupiter", "Raydium"],
  });
});
test("quotes lead while failed networks stay inspectable with actionable reasons", () => {
  const html = quoteComparison([
    quoted,
    {
      ...quoted,
      id: "missing",
      issuer: "ondo",
      symbol: "NVDAon",
      chain: "Ethereum",
      address: "0xabc",
      status: "unavailable",
      reason: "No route for this amount",
    },
  ]);
  assert.ok(html.indexOf("quote-row") < html.indexOf("quote-gaps"));
  assert.match(html, /Other versions &amp; networks/);
  assert.match(html, /No route for this amount/);
  assert.match(html, /data-markets-token="0xabc"/);
});
test("quote rows distinguish the quote provider from exchanges supplying liquidity", () => {
  const html = quoteTable([quoted]);
  assert.match(html, /Quote via Jupiter/);
  assert.match(html, /Liquidity: Orca Whirlpool/);
  assert.match(
    quoteTable([
      { ...quoted, liquidityVenues: ["pancakeswapv3", "UniswapV3"] },
    ]),
    /Liquidity: PancakeSwap V3, Uniswap V3/,
  );
  assert.doesNotMatch(html, /Structure &amp; rights/);
  const raw = quoteTable([
    {
      ...quoted,
      equivalentShares: null,
      effectivePrice: null,
      rankable: false,
    },
  ]);
  assert.match(raw, /Token quote/);
  assert.doesNotMatch(raw, />Unavailable<\/strong>/);
});
test("closed references preserve date-only precision and both prices remain explicit", () => {
  const reference = {
    price: 217.09,
    at: Date.UTC(2026, 9, 19),
    priceDate: "2026-10-19",
    timePrecisionMs: 86400000,
    priceSession: "Closed",
    marketStatus: "Closed",
    exchange: "NASDAQ",
    source: "https://www.nasdaq.com/market-activity/stocks/nvda",
  };
  const label = listedDate(reference);
  assert.match(label, /19/);
  assert.doesNotMatch(label, /00:00/);
  const html = priceComparison({
    market: { price: 216.49, updatedAt: now },
    reference,
    spotPremium: {
      value: -0.28,
      referenceBasis: "last-close",
      basis: "Representative pool",
      priceAt: now,
      expiresAt: now + 300000,
    },
  });
  assert.match(html, /Listed stock/);
  assert.match(html, /Tokenized market/);
  assert.match(html, /217.09/);
  assert.match(html, /216.49/);
  assert.match(html, /vs last close/);
});
