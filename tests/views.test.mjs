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
