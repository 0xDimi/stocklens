import test from "node:test";
import assert from "node:assert/strict";
import { restoreComparison, saveComparison, readComparison, comparisonStorage } from "../src/comparison-state.mjs";
import {
  quoteCoverage,
  quoteCoverageMarkup,
  quoteComparison,
} from "../src/comparison-ui.mjs";
import { priceComparison } from "../src/reference-view.mjs";
import { quoteTable } from "../src/views.mjs";
const stocks = [{ id: "NVDA" }, { id: "AAPL" }, { id: "MSFT" }];
test("basket survives routes without stocks, reload, explicit clear and invalid stored values", () => {
  assert.deepEqual(
    restoreComparison(
      new URLSearchParams("page=markets"),
      ["NVDA", "AAPL"],
      stocks,
    ),
    ["NVDA", "AAPL"],
  );
  assert.deepEqual(
    restoreComparison(
      new URLSearchParams("stocks=AAPL,MSFT,invalid,AAPL"),
      [],
      stocks,
    ),
    ["AAPL", "MSFT"],
  );
  assert.deepEqual(
    restoreComparison(new URLSearchParams("stocks="), ["NVDA"], stocks),
    [],
  );
  assert.deepEqual(
    restoreComparison(new URLSearchParams(), "not-an-array", stocks),
    [],
  );
  const storage = new Map();
  saveComparison({ setItem: (key, value) => storage.set(key, value) }, [
    "NVDA",
    "AAPL",
  ]);
  assert.deepEqual(JSON.parse(storage.get("stocklens:comparison")), [
    "NVDA",
    "AAPL",
  ]);
  assert.doesNotThrow(() =>
    saveComparison(
      {
        setItem() {
          throw new Error("blocked");
        },
      },
      [],
    ),
  );
});
const now = Date.now();
const row = {
  id: "jup",
  issuer: "xstocks",
  symbol: "NVDAx",
  chain: "Solana",
  chainLabel: "Solana",
  address: "Mint",
  status: "quoted",
  rankable: true,
  effectivePrice: 200,
  equivalentShares: 5,
  tokenQuantity: 5,
  inputQuantity: 1000,
  expiresAt: now + 30000,
  quoteProvider: "Jupiter",
  buyUrl: "https://jup.ag",
  explorerUrl: "https://solscan.io/token/Mint",
};
test("expired quotes leave no current provider or deployment counts", () => {
  const rows = [{ ...row, expiresAt: now - 1 }];
  const coverage = quoteCoverage(rows, now);
  assert.equal(coverage.fresh, 0);
  assert.equal(coverage.quotedDeployments, 0);
  assert.deepEqual(coverage.providers, []);
  assert.match(quoteCoverageMarkup(rows, now), /0 current quotes/);
});
test("comparable pool price and reference are visible, aggregate is secondary", () => {
  const html = priceComparison({
    market: { price: 219.77, updatedAt: now },
    reference: { price: 220.23 },
    spotPremium: {
      price: 217.82,
      referencePrice: 220.23,
      value: -1.09,
      symbol: "NVDAon",
      issuer: "ondo",
      chain: "BinanceSmartChain",
      venue: "PancakeSwap",
      priceAt: now,
      expiresAt: now + 300000,
    },
  });
  assert.match(html, /217.82/);
  assert.match(html, /220.23/);
  assert.match(html, /219.77/);
  assert.match(html, /NVDAon/);
  assert.match(html, /PancakeSwap/);
  assert.ok(html.indexOf("217.82") < html.indexOf("219.77"));
});
test("best deployment routes lead; alternatives and unverified conversions remain inspectable", () => {
  const html = quoteComparison([
    row,
    { ...row, id: "ray", quoteProvider: "Raydium", effectivePrice: 210 },
    {
      ...row,
      id: "raw",
      issuer: "ondo",
      symbol: "NVDAon",
      rankable: false,
      equivalentShares: null,
      effectivePrice: null,
    },
  ]);
  assert.equal((html.match(/class="best-label"/g) || []).length, 1);
  assert.match(html, /Alternative providers/);
  assert.match(html, /conversion unverified/);
  assert.ok(
    html.indexOf('data-quote-provider="Jupiter"') <
      html.indexOf("Alternative providers"),
  );
});
test("quote rows expose adverse price deviation and unknown fees explicitly", () => {
  const html = quoteTable(
    [{ ...row, effectivePrice: 3361, networkFeeUsd: null }],
    {
      reference: {
        price: 220.23,
        priceSession: "Closed",
        priceDate: "2026-10-20",
      },
    },
  );
  assert.match(html, /Large price difference/);
  assert.match(html, /Not supplied/);
  assert.match(html, /vs listed last close/);
  const expired = quoteTable([{ ...row, expiresAt: now - 1 }]);
  assert.doesNotMatch(expired, /class="provider-link quote-link" href=/);
  assert.match(expired, /Refresh quote to continue/);
});

test("comparison remains usable when the browser denies storage access", () => {
  const host = Object.defineProperty({}, "localStorage", {
    get() {
      throw new Error("Storage denied");
    },
  });
  const store = comparisonStorage(host);
  assert.equal(store, null);
  assert.deepEqual(readComparison(store), []);
  assert.doesNotThrow(() => saveComparison(store, ["NVDA"]));
});
