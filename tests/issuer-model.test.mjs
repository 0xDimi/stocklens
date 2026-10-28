import test from "node:test";
import assert from "node:assert/strict";
import {
  issuerLink,
  selectIssuers,
  issuerPercent,
  issuerExportColumns,
} from "../src/issuer-model.mjs";
import { routePage } from "../src/discover.mjs";
import { csvText } from "../src/views.mjs";
import { issuerLogo } from "../src/brands.mjs";
test("unconfirmed issuer records use readable marks without requesting a nonexistent logo", () => {
  assert.ok(
    !issuerLogo({
      issuer: "rstock",
      issuerName: "Issuer unconfirmed",
    }).includes("<img"),
  );
  assert.ok(issuerLogo({ issuer: "ondo" }).includes("issuer-ondo.png"));
});

test("issuer routes are distinct, canonical and preserve exact issuer identity", () => {
  const url = new URL(issuerLink("xstocks"), "https://stocklens.example");
  assert.equal(routePage(url.searchParams), "issuers");
  assert.equal(url.searchParams.get("issuer"), "xstocks");
  assert.equal(issuerLink(), "/?page=issuers");
});
test("issuer filters do not recalculate market shares and unknown metrics sort last", () => {
  const rows = [
    {
      id: "unknown",
      name: "No report",
      market: null,
      assetCount: 50,
      networks: [{ id: "Solana" }],
    },
    {
      id: "ondo",
      name: "Ondo",
      sourceName: "Ondo Finance",
      market: { marketCap: 100, share: 25 },
      assetCount: 2,
      networks: [{ id: "Ethereum" }],
    },
    {
      id: "xstocks",
      name: "xStocks",
      market: { marketCap: 300, share: 75 },
      assetCount: 3,
      networks: [{ id: "Solana" }],
    },
  ];
  assert.deepEqual(
    selectIssuers(rows).map((r) => r.id),
    ["xstocks", "ondo", "unknown"],
  );
  assert.equal(selectIssuers(rows, { query: "Finance" })[0].market.share, 25);
  assert.deepEqual(
    selectIssuers(rows, { chain: "Solana", sort: "assets" }).map((r) => r.id),
    ["unknown", "xstocks"],
  );
  assert.equal(issuerPercent(null), "—");
  assert.equal(issuerPercent(0), "0.00%");
});
test("issuer exports include denominator context, source dates and formula-safe issuer names", () => {
  const csv = csvText(
    [
      {
        name: "=bad",
        id: "id",
        assetCount: 2,
        nativeProducts: 2,
        wrappedProducts: 0,
        networks: [],
        market: {
          marketCap: 100,
          share: 25,
          sourceAt: "2026-10-28T10:00:00Z",
          apiSource: "https://api.coingecko.com/api/v3/rwas/issuers/id",
        },
      },
    ],
    issuerExportColumns((r) => r.name),
  );
  assert.ok(csv.includes("Share of reported cap percent"));
  assert.ok(csv.includes("2026-10-28T10:00:00Z"));
  assert.ok(csv.includes("'=bad"));
});
