import test from "node:test";
import assert from "node:assert/strict";
import {
  routePage,
  searchAssets,
  lensProducts,
  assetLink,
} from "../src/discover.mjs";

const stocks = [
  {
    id: "US67066G1040",
    ticker: "NVDA",
    name: "NVIDIA",
    products: [
      {
        symbol: "NVDAx",
        issuer: "xstocks",
        deployments: [{ chain: "Solana" }],
      },
      {
        symbol: "NVDAon",
        issuer: "ondo",
        deployments: [{ chain: "Ethereum" }],
      },
      {
        symbol: "wNVDAx",
        issuer: "xstocks",
        wrapped: true,
        deployments: [{ chain: "Base" }],
      },
    ],
  },
  { id: "US0378331005", ticker: "AAPL", name: "Apple", products: [] },
  { id: "cg:fund", ticker: "NVDAX", name: "Other fund", products: [] },
];
test("entry route preserves stock, legacy ticker, view and Markets deep links", () => {
  assert.equal(routePage(new URLSearchParams()), "discover");
  for (const query of [
    "stock=US67066G1040",
    "ticker=NVDA",
    "view=quotes",
    "page=home&stock=US67066G1040",
  ])
    assert.equal(routePage(new URLSearchParams(query)), "home");
  for (const page of ["markets", "stock", "compare"])
    assert.equal(routePage(new URLSearchParams({ page })), page);
});
test("entry search matches company, ticker, ISIN and product symbol; exact ticker leads", () => {
  assert.equal(searchAssets(stocks, "nvda")[0].id, stocks[0].id);
  assert.equal(searchAssets(stocks, "Apple")[0].ticker, "AAPL");
  assert.equal(searchAssets(stocks, "US67066G1040")[0].ticker, "NVDA");
  assert.equal(searchAssets(stocks, "NVDAon")[0].ticker, "NVDA");
  assert.deepEqual(searchAssets(stocks, "not-a-security"), []);
});
test("lens graph uses distinct native issuers with actual deployments only", () => {
  const products = lensProducts(stocks[0]);
  assert.equal(products.length, 2);
  assert.ok(products.every((p) => !p.wrapped && p.deployments.length));
  assert.deepEqual(lensProducts(undefined), []);
});
test("entry links encode the canonical identity and open the existing comparison", () => {
  const url = new URL(assetLink(stocks[0]), "https://stocklens.example");
  assert.equal(url.searchParams.get("stock"), stocks[0].id);
  assert.equal(url.searchParams.get("view"), "products");
  assert.equal(routePage(url.searchParams), "home");
});
