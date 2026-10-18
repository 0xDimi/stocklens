import test from "node:test";
import assert from "node:assert/strict";
import { quoteTable, csvText, productsTable } from "../src/views.mjs";
test("quote winner is based on exposure regardless of issuer-name display order", () => {
  const now = Date.now(),
    base = {
      status: "quoted",
      rankable: true,
      expiresAt: now + 30000,
      chainLabel: "Solana",
      chain: "Solana",
      address: "mint",
      source: "https://example.test",
      explorerUrl: "https://example.test",
      sourceAt: now,
    };
  const html = quoteTable([
    {
      ...base,
      id: "o",
      issuer: "ondo",
      symbol: "ONDO",
      equivalentShares: 5,
      effectivePrice: 200,
    },
    {
      ...base,
      id: "x",
      issuer: "xstocks",
      symbol: "XSTOCK",
      equivalentShares: 10,
      effectivePrice: 100,
    },
  ]);
  const winner = html
    .split("<details")
    .find((s) => s.includes("Most exposure"));
  assert.ok(winner.includes("<strong>XSTOCK</strong>"));
  assert.ok(!winner.includes("<strong>ONDO</strong>"));
});
test("CSV escapes spreadsheet formulas, delimiters and quotes", () => {
  const text = csvText(
    [{ value: "=SUM(1,2)" }, { value: 'a,"b"' }],
    [["Value", (r) => r.value]],
  );
  assert.equal(text, '"Value"\r\n"\'=SUM(1,2)"\r\n"a,""b"""');
});
test("untrusted product labels remain escaped markup", () => {
  const html = productsTable(
    [
      {
        issuer: "unreviewed",
        symbol: "<script>alert(1)</script>",
        name: "<img src=x>",
        source: "https://www.coingecko.com/",
        deployments: [],
      },
    ],
    [],
    "all",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("quote accessibility names expose price, share exposure, units and status; disclosure repeats gas on mobile", () => {
  const r = {
    id: "x",
    issuer: "xstocks",
    symbol: "NVDAx",
    chainLabel: "Solana",
    status: "quoted",
    rankable: true,
    expiresAt: Date.now() + 30000,
    effectivePrice: 200,
    equivalentShares: 5,
    networkFeeUsd: 1.23,
  };
  const html = quoteTable([r]);
  assert.match(
    html,
    /aria-label="[^"]*5.0000 equivalent shares[^"]*200.00 USDC per equivalent share/,
  );
  assert.match(html, /<dt>Swap gas estimate \(USD\)<\/dt><dd>\$1.23<\/dd>/);
  assert.match(
    quoteTable([{ ...r, status: "unavailable" }]),
    /aria-label="[^"]*quote unavailable/,
  );
});

test("venue CSV exports displayed market fields with observation status", async () => {
  const { exportColumns, csvText } = await import("../src/views.mjs");
  const csv = csvText(
    [
      {
        coinId: "nvidia-xstock",
        exchange: "Kraken",
        pair: "NVDAx / USD",
        priceUsd: 212.33,
        volumeUsd: 1152233,
        spreadPct: 0.12,
        depthUpUsd: 30000,
        depthDownUsd: 25000,
        sourceAt: "2026-10-18T21:00:00Z",
        url: "https://www.kraken.com",
      },
    ],
    exportColumns("venues", { ticker: "NVDA", id: "NVDA" }),
  );
  assert.match(csv, /212.33/);
  assert.match(csv, /1152233/);
  assert.match(csv, /Kraken/);
  assert.match(csv, /30000/);
  assert.match(csv, /CoinGecko venue observation/);
  assert.doesNotMatch(csv, /No market observation/);
});

test("purchase summary highlights only fresh verified share exposure and names the cost boundary", async () => {
  const { purchaseSummary } = await import("../src/views.mjs");
  const now = Date.now(),
    base = {
      status: "quoted",
      rankable: true,
      expiresAt: now + 30000,
      inputQuantity: 1000,
      issuer: "xstocks",
      symbol: "NVDAx",
      chainLabel: "Solana",
      equivalentShares: 5,
      effectivePrice: 200,
    };
  const html = purchaseSummary([
    base,
    {
      ...base,
      issuer: "ondo",
      symbol: "NVDAon",
      equivalentShares: 4,
      effectivePrice: 250,
    },
    { ...base, symbol: "UNVERIFIED", rankable: false, effectivePrice: 1 },
    { ...base, symbol: "EXPIRED", expiresAt: now - 1, effectivePrice: 1 },
  ]);
  assert.match(html, /NVDAx/);
  assert.match(html, /5.0000/);
  assert.match(html, /200.00/);
  assert.match(html, /before network costs/i);
  assert.doesNotMatch(html, /UNVERIFIED|EXPIRED/);
  assert.match(purchaseSummary([{ ...base, expiresAt: now - 1 }]), /Refresh/);
});
test("product overview exposes issuer structure next to market data before expansion", () => {
  const html = productsTable(
    [
      {
        issuer: "xstocks",
        symbol: "NVDAx",
        source: "https://xstocks.com",
        deployments: [],
        market: { price: 200, volume24h: 1000 },
      },
    ],
    [],
    "all",
  );
  const summary = html.match(/<summary>(.*?)<\/summary>/s)?.[1];
  assert.match(summary, /Tracker certificate/);
  assert.match(summary, /200.00/);
  assert.match(summary, /Compare/);
});
