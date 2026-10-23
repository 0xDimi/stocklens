import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { getFundamentals, parseFundamentals } from "../server/fundamentals.mjs";
import { premium } from "../src/market-model.mjs";
// Actual public Nasdaq /info responses captured on 2026-10-23. Only the external
// network boundary is replaced. Prices and times are preserved as observations.
const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/listed-coverage-nasdaq-info.json", import.meta.url),
    "utf8",
  ),
);
const stock = (ticker, name, category = "ETF", extra = {}) => ({
  id: ticker,
  ticker,
  name,
  category,
  ...extra,
});
const parse = (s) =>
  parseFundamentals(
    fixtures[s.ticker].body,
    null,
    s,
    fixtures[s.ticker].retrievedAt,
  );

test("generic listed securities use Nasdaq's corroborated ETF classification and correct endpoint", async () => {
  for (const [ticker, name] of [
    ["IWM", "Russell 2000"],
    ["EWQ", "iShares MSCI France"],
    ["EWG", "iShares MSCI Germany"],
    ["EWU", "iShares MSCI United Kingdom"],
    ["SKUU", "GraniteShares 2x Long SK Hynix Daily ETF"],
    ["SPCH", "Leverage Shares 2X Long SPCX Daily ETF"],
    ["VOO", "Vanguard S&P 500"],
  ]) {
    const reference = await getFundamentals(
      stock(ticker, name, "Listed security"),
      {
        getSource: async (path) => {
          if (path === `/quote/${ticker}/info?assetclass=stocks`)
            return {
              data: { data: null, status: { rCode: 400 } },
              retrievedAt: fixtures[ticker].retrievedAt,
            };
          if (path === `/quote/${ticker}/info?assetclass=etf`)
            return {
              data: fixtures[ticker].body,
              retrievedAt: fixtures[ticker].retrievedAt,
            };
          if (path === `/quote/${ticker}/summary?assetclass=etf`)
            return {
              data: {
                data: { symbol: ticker, summaryData: {} },
                status: { rCode: 200 },
              },
              retrievedAt: fixtures[ticker].retrievedAt,
            };
          throw new Error("No corroborated equity metrics: " + path);
        },
      },
    );
    assert.ok(reference?.price > 0, ticker);
    assert.match(reference.priceSource, /assetclass=etf$/);
    assert.equal(reference.marketCapStatus, "not-applicable");
    assert.equal(reference.peStatus, "not-applicable");
  }
});

test("reviewed exact ETF aliases restore references while preserving sponsor, leverage, direction and ticker", () => {
  for (const [ticker, name] of [
    ["SOXS", "3x Short Semiconductor ETF"],
    ["SOXS", "Direxion Daily Semi Bear 3X ETF"],
    ["TMF", "Direxion Daily 20 Year Treasury Bull 3X ETF"],
    ["EWJ", "iShares MSCI Japan ETF"],
    ["SOXX", "iShares Semiconductor"],
    ["SOXX", "iShares Semiconductor ETF"],
    ["IWM", "Russell 2000"],
    ["IWM", "iShares Russell 2000 ETF"],
    ["VTI", "Vanguard Total Stock Market ETF"],
    ["GLD", "Gold"],
  ]) {
    const s = stock(ticker, name);
    assert.ok(parse(s).price > 0, ticker + " " + name);
    for (const wrong of [
      name + " Monthly",
      name + " Other",
      name.replace(/3[xX]/, "2X"),
      name.replace(/Bear/, "Bull"),
    ].filter((n) => n !== name))
      assert.throws(
        () => parse({ ...s, name: wrong }),
        /name does not corroborate/,
      );
  }
});

test("generic classification never overrides an explicit stock type or a conflicting catalog identity", () => {
  assert.throws(
    () => parse(stock("EWQ", "iShares MSCI France", "Stock")),
    /identity unavailable/,
  );
  assert.throws(
    () => parse(stock("EWQ", "Unrelated France ETF", "Listed security")),
    /name does not corroborate/,
  );
  assert.throws(
    () =>
      parse(
        stock("EWQ", "iShares MSCI France", "Listed security", {
          exchange: "LSE",
          currency: "GBP",
        }),
      ),
    /identity unavailable/,
  );
});

test("date-only non-real-time premarket observations remain dated prices without inventing a close or live premium", () => {
  for (const [ticker, name, want, date] of [
    ["BRLN", "iShares Floating Rate Loan Active ETF", 50.405, "2026-10-22"],
    ["BRHY", "iShares High Yield Active ETF", 49.165, "2026-10-22"],
    ["BTCO", "Invesco Galaxy Bitcoin ETF", 80.89, "2026-10-23"],
  ]) {
    const result = parse(stock(ticker, name));
    assert.equal(result.price, want);
    assert.equal(result.priceDate, date);
    assert.equal(result.timePrecisionMs, 86400000);
    assert.equal(result.priceSession, null);
    assert.equal(result.isRealTime, false);
    const now = Date.parse(fixtures[ticker].retrievedAt);
    assert.equal(
      premium(
        {
          price: want * 1.01,
          sharesPerToken: 1,
          conversionVerified: true,
          currency: "USD",
          at: now,
        },
        result,
        now,
      ),
      null,
    );
    const claimedLive = structuredClone(fixtures[ticker].body);
    claimedLive.data.primaryData.isRealTime = true;
    assert.equal(
      parseFundamentals(
        claimedLive,
        null,
        stock(ticker, name),
        fixtures[ticker].retrievedAt,
      ).price,
      null,
    );
  }
});

test("an explicit source currency takes precedence over the dollar glyph", () => {
  const info = structuredClone(fixtures.EWQ.body);
  info.data.primaryData.currency = "CAD";
  const result = parseFundamentals(
    info,
    null,
    stock("EWQ", "iShares MSCI France"),
    fixtures.EWQ.retrievedAt,
  );
  assert.equal(result.currency, "CAD");
});

test("reviewed sponsor wrappers and ETF suffixes preserve the exact underlying fund name", () => {
  for (const [ticker, name] of [
    ["TSLL", "Direxion Daily TSLA Bull 2X Shares"],
    ["TSLL", "Direxion Shares ETF Trust Direxion Daily TSLA Bull 2X ETF"],
    ["AVL", "Direxion Daily AVGO Bull 2X Shares"],
    ["MUU", "Direxion Daily MU Bull 2X Shares"],
    ["LABD", "Direxion Daily S&P Biotech Bear 3x Shares ETF"],
    ["LABU", "Direxion Daily S&P Biotech Bull 3x Shares ETF"],
    ["TZA", "Direxion Daily Small Cap Bear 3X Shares ETF"],
    ["TNA", "Direxion Daily Small Cap Bull 3x ETF"],
    ["SIVR", "abrdn Physical Silver ETF"],
    ["ARKB", "ARK 21 Bitcoin ETF"],
    ["PAVE", "Global X US Infrastructure Development ETF"],
    ["NVD", "GraniteShares ETF Trust GraniteShares 2x Short NVDA Daily ETF"],
    ["PHO", "Invesco Exchange-Traded Fund Trust Invesco Water Resources ETF"],
    [
      "TSLQ",
      "Investment Managers Series Trust II Tradr 2X Short TSLA Daily ETF",
    ],
    ["IWF", "iShares Russell 1000 Growth ETF"],
    ["ITA", "iShares US Aerospace and Defense ETF"],
    ["HLAL", "Listed Funds Trust Wahed FTSE USA Shariah ETF"],
    ["UFO", "Procure ETF Trust II Procure Space ETF"],
    ["VGK", "Vanguard FTSE Europe ETF"],
    ["VUG", "Vanguard Growth ETF"],
    ["FEZ", "SPDR EURO STOXX 50"],
  ]) {
    assert.ok(parse(stock(ticker, name)).price > 0, ticker);
    assert.throws(
      () => parse(stock(ticker, name + " Monthly")),
      /name does not corroborate/,
    );
  }
});

test("an endpoint's missing or conflicting asset class cannot authorize a generic listed reference", async () => {
  for (const assetClass of [null, "STOCKS"]) {
    const conflicting = structuredClone(fixtures.EWQ.body);
    conflicting.data.assetClass = assetClass;
    const reference = await getFundamentals(
      stock("EWQ", "iShares MSCI France", "Listed security"),
      {
        getSource: async (path) => {
          if (path === "/quote/EWQ/info?assetclass=etf") {
            return { data: conflicting, retrievedAt: fixtures.EWQ.retrievedAt };
          }
          throw new Error("Not a corroborated ETF endpoint.");
        },
      },
    );
    assert.equal(reference, null);
  }
});
