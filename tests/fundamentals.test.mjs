import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFundamentals,
  getFundamentals,
  easternTime,
} from "../server/fundamentals.mjs";

// Public Nasdaq response shapes observed on 2026-10-19. Values are observations,
// not promises about future quotes. Only the HTTP boundary is replaced in unit tests.
const stock = {
  id: "US0378331005",
  ticker: "AAPL",
  name: "Apple",
  category: "Stock",
};
const retrievedAt = "2026-10-19T12:02:00.000Z";
const info = {
  data: {
    symbol: "AAPL",
    companyName: "Apple Inc. Common Stock",
    stockType: "Common Stock",
    exchange: "NASDAQ-GS",
    isNasdaqListed: true,
    isNasdaq100: true,
    isHeld: false,
    primaryData: {
      lastSalePrice: "$341.876",
      netChange: "-1.584",
      percentageChange: "-0.46%",
      deltaIndicator: "down",
      lastTradeTimestamp: "Oct 19, 2026 8:02 AM ET",
      isRealTime: true,
      bidPrice: "$341.85",
      askPrice: "$341.94",
      bidSize: "80",
      askSize: "12",
      volume: "361,640.386226",
      currency: null,
    },
    secondaryData: {
      lastSalePrice: "$343.46",
      percentageChange: "+0.43%",
      lastTradeTimestamp: "Closed at Oct 16, 2026 4:00 PM ET",
      isRealTime: false,
    },
    marketStatus: "Pre-Market",
    assetClass: "STOCKS",
    keyStats: {
      fiftyTwoWeekHighLow: {
        label: "52 Week Range:",
        value: "243.42 - 348.15",
      },
      dayrange: { label: "High/Low:", value: "NA" },
    },
    notifications: [],
  },
  message: null,
  status: { rCode: 200, bCodeMessage: null, developerMessage: null },
};
const summary = {
  data: {
    symbol: "AAPL",
    assetClass: "STOCKS",
    summaryData: {
      MarketCap: { label: "Market Cap", value: "4,989,750,142,000" },
      Sector: { label: "Sector", value: "Technology" },
    },
    additionalData: null,
    bidAsk: null,
  },
  message: null,
  status: { rCode: 200 },
};
const ratios = {
  data: {
    pegr: { label: "Forecast 12 Month Forward PEG Ratio", pegValue: 2.98 },
    per: {
      peRatioChart: [
        { x: "2025 Actual", y: 46.04 },
        { x: "2026 Estimates", y: 39.25 },
        { x: "2027 Estimates", y: 35.81 },
        { x: "2028 Estimates", y: 31.34 },
      ],
      label: "Price/Earnings Ratio",
      text: "For a security, the Price/Earnings Ratio is given by dividing the Last Sale Price by the Average EPS (Earnings Per Share) Estimate for the specified fiscal time period.",
      dataProvider: "Data Provider: Zacks Investment Research",
    },
    gr: { peGrowthChart: [], title: "Forecast P/E Growth Rates" },
  },
  message: null,
  status: { rCode: 200 },
};

function listedInfo(ticker, companyName, assetClass = "STOCKS") {
  return {
    ...info,
    data: { ...info.data, symbol: ticker, companyName, assetClass },
  };
}

test("reads the disclosed fiscal Actual P/E from Nasdaq analyst data with its period and methodology", () => {
  const result = parseFundamentals(info, summary, stock, retrievedAt, ratios);
  assert.equal(result.marketCap, 4989750142000);
  assert.equal(result.pe, 46.04);
  assert.equal(result.pePeriod, "2025 Actual");
  assert.equal(result.peAsOf, null);
  assert.equal(result.peMethodology, ratios.data.per.text);
  assert.match(result.peSource, /\/analyst\/AAPL\/peg-ratio$/);
  assert.equal(result.at, Date.parse("2026-10-19T12:02:00Z"));
  assert.equal(result.priceSession, "Pre-Market");
  assert.equal(result.isRealTime, true);
});

test("corroborates reported company acronyms, short names, and prepended ETF manager names", () => {
  for (const [ticker, name, companyName, category] of [
    ["AMD", "AMD", "Advanced Micro Devices, Inc. Common Stock", "Stock"],
    ["MMM", "3M", "3M Company Common Stock", "Stock"],
    [
      "SPY",
      "SPDR S&P 500 ETF Trust",
      "State Street SPDR S&P 500 ETF Trust",
      "ETF",
    ],
  ]) {
    const result = parseFundamentals(
      listedInfo(ticker, companyName, category === "ETF" ? "ETF" : "STOCKS"),
      null,
      { ...stock, ticker, name, category },
      retrievedAt,
    );
    assert.equal(result.ticker, ticker);
    assert.equal(result.price, 341.876);
  }
});

test("keeps identity checks for unrelated names, symbols, and asset classes", () => {
  assert.throws(() =>
    parseFundamentals(
      info,
      summary,
      { ...stock, name: "Unrelated Company" },
      retrievedAt,
    ),
  );
  assert.throws(() =>
    parseFundamentals(
      listedInfo("MSFT", "Apple Inc."),
      summary,
      stock,
      retrievedAt,
    ),
  );
  assert.throws(() =>
    parseFundamentals(
      listedInfo("AAPL", "Apple Inc.", "ETF"),
      summary,
      stock,
      retrievedAt,
    ),
  );
});

test("does not substitute forecast P/E, missing values, or another symbol's market cap", () => {
  const forecastOnly = {
    ...ratios,
    data: {
      ...ratios.data,
      per: {
        ...ratios.data.per,
        peRatioChart: [{ x: "2026 Estimates", y: 39.25 }],
      },
    },
  };
  const result = parseFundamentals(
    info,
    { data: { ...summary.data, symbol: "MSFT" } },
    stock,
    retrievedAt,
    forecastOnly,
  );
  assert.equal(result.pe, null);
  assert.equal(result.pePeriod, null);
  assert.equal(result.marketCap, null);
  for (const value of ["N/A", "", null, "Infinity"]) {
    const missing = {
      data: { per: { peRatioChart: [{ x: "2025 Actual", y: value }] } },
    };
    assert.equal(
      parseFundamentals(info, summary, stock, retrievedAt, missing).pe,
      null,
    );
  }
});

test("invalid quote values do not become zero, NaN, or a mismatched session", () => {
  const missing = structuredClone(info);
  missing.data.primaryData.lastSalePrice = "N/A";
  missing.data.primaryData.percentageChange = "N/A";
  const result = parseFundamentals(missing, summary, stock, retrievedAt);
  assert.equal(result.price, 343.46);
  assert.equal(result.at, Date.parse("2026-10-16T20:00:00Z"));
  assert.equal(result.priceSession, "Closed");
  assert.equal(result.changePct, 0.43);
  assert.equal(result.isRealTime, false);
});

test("fetches real endpoint shapes and preserves independent observation provenance when a source is stale", async () => {
  const source = async (path) => {
    if (path === "/quote/AAPL/info?assetclass=stocks")
      return { data: info, retrievedAt, stale: false };
    if (path === "/quote/AAPL/summary?assetclass=stocks")
      return {
        data: summary,
        retrievedAt: "2026-10-19T12:00:00.000Z",
        stale: true,
      };
    if (path === "/analyst/AAPL/peg-ratio")
      return {
        data: ratios,
        retrievedAt: "2026-10-19T11:00:00.000Z",
        stale: false,
      };
    throw new Error("Unexpected path: " + path);
  };
  const result = await getFundamentals(stock, { getSource: source });
  assert.equal(result.pe, 46.04);
  assert.equal(result.marketCapRetrievedAt, "2026-10-19T12:00:00.000Z");
  assert.equal(result.peRetrievedAt, "2026-10-19T11:00:00.000Z");
  assert.equal(result.priceStale, false);
  assert.equal(result.marketCapStale, true);
  assert.equal(result.stale, true);
});

test("keeps a corroborated quote when optional fundamentals fail and skips equity P/E for ETFs", async () => {
  const result = await getFundamentals(stock, {
    getSource: async (path) => {
      if (path.endsWith("/info?assetclass=stocks"))
        return { data: info, retrievedAt };
      throw new Error("Provider unavailable");
    },
  });
  assert.equal(result?.price, 341.876);
  assert.equal(result?.marketCap, null);
  assert.equal(result?.pe, null);
  const etf = {
    id: "SPY",
    ticker: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    category: "ETF",
  };
  const etfResult = await getFundamentals(etf, {
    getSource: async (path) => {
      if (path === "/quote/SPY/info?assetclass=etf")
        return {
          data: listedInfo("SPY", "State Street SPDR S&P 500 ETF Trust", "ETF"),
          retrievedAt,
        };
      if (path === "/quote/SPY/summary?assetclass=etf")
        return {
          data: {
            data: {
              symbol: "SPY",
              summaryData: { TotalAssets: { value: "$10,000" } },
            },
          },
          retrievedAt,
        };
      throw new Error("Must not fetch equity analyst P/E for ETF");
    },
  });
  assert.equal(etfResult?.price, 341.876);
  assert.equal(etfResult?.marketCap, null);
  assert.equal(etfResult?.pe, null);
});

test("Eastern timestamps preserve standard and daylight offsets", () => {
  assert.equal(
    easternTime("Jan 16, 2026 4:00 PM ET"),
    Date.parse("2026-01-16T21:00:00Z"),
  );
  assert.equal(
    easternTime("Closed at Oct 16, 2026 4:00 PM ET"),
    Date.parse("2026-10-16T20:00:00Z"),
  );
});

test("malformed optional ratio rows do not hide a corroborated quote or use another symbol's ratios", () => {
  const malformed = {
    data: {
      per: {
        peRatioChart: [
          null,
          {},
          { x: "2024 Actual", y: 25 },
          { x: "2025 Actual", y: -2.5 },
        ],
      },
    },
  };
  const result = parseFundamentals(
    info,
    summary,
    stock,
    retrievedAt,
    malformed,
  );
  assert.equal(result.price, 341.876);
  assert.equal(result.pe, -2.5);
  assert.equal(result.pePeriod, "2025 Actual");
  const mismatched = { data: { ...ratios.data, symbol: "MSFT" } };
  assert.equal(
    parseFundamentals(info, summary, stock, retrievedAt, mismatched).pe,
    null,
  );
});

test("Nasdaq slash notation for the same share class retains cap while a different class stays excluded", () => {
  const berkshire = {
    id: "US0846707026",
    ticker: "BRK.B",
    name: "Berkshire Hathaway",
    category: "Stock",
  };
  const listed = listedInfo("BRK.B", "Berkshire Hathaway Inc.");
  const sameClass = {
    data: {
      symbol: "BRK/B",
      summaryData: { MarketCap: { value: "1,168,034,477,676" } },
    },
  };
  assert.equal(
    parseFundamentals(listed, sameClass, berkshire, retrievedAt).marketCap,
    1168034477676,
  );
  const otherClass = { data: { ...sameClass.data, symbol: "BRK/A" } };
  assert.equal(
    parseFundamentals(listed, otherClass, berkshire, retrievedAt).marketCap,
    null,
  );
});

test("fundamental statuses distinguish provider failures, unreported values, and ETF inapplicability", async () => {
  const available = parseFundamentals(
    info,
    summary,
    stock,
    retrievedAt,
    ratios,
  );
  assert.equal(available.marketCapStatus, "available");
  assert.equal(available.peStatus, "available");
  const unreported = parseFundamentals(
    info,
    { data: { symbol: "AAPL", summaryData: {} } },
    stock,
    retrievedAt,
    { data: { per: { peRatioChart: [] } } },
  );
  assert.equal(unreported.marketCapStatus, "not-reported");
  assert.equal(unreported.peStatus, "not-reported");
  const unavailable = await getFundamentals(stock, {
    getSource: async (path) => {
      if (path.endsWith("/info?assetclass=stocks"))
        return { data: info, retrievedAt };
      throw new Error("Provider unavailable");
    },
  });
  assert.equal(unavailable.marketCapStatus, "unavailable");
  assert.equal(unavailable.peStatus, "unavailable");
  const etf = parseFundamentals(
    listedInfo("SPY", "State Street SPDR S&P 500 ETF Trust", "ETF"),
    null,
    {
      id: "SPY",
      ticker: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      category: "ETF",
    },
    retrievedAt,
  );
  assert.equal(etf.marketCapStatus, "not-applicable");
  assert.equal(etf.peStatus, "not-applicable");
});

test("corroborates punctuation and word-spacing differences in the same listed company name", () => {
  const jpm = {
    id: "US46625H1005",
    ticker: "JPM",
    name: "JPMorgan Chase",
    category: "Stock",
  };
  const result = parseFundamentals(
    listedInfo("JPM", "JP Morgan Chase & Co. Common Stock"),
    null,
    jpm,
    retrievedAt,
  );
  assert.equal(result.price, 341.876);
});

test("application-level provider errors are unavailable rather than unreported fundamentals", async () => {
  const result = await getFundamentals(stock, {
    getSource: async (path) => {
      if (path.endsWith("/info?assetclass=stocks"))
        return { data: info, retrievedAt };
      return {
        data: { data: null, status: { rCode: 500 }, message: "Internal error" },
        retrievedAt,
      };
    },
  });
  assert.equal(result?.price, 341.876);
  assert.equal(result?.marketCapStatus, "unavailable");
  assert.equal(result?.peStatus, "unavailable");
});

test("default Nasdaq observations survive a process restart with original times and stale provenance", async () => {
  const { mkdtemp, readFile, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-nasdaq-"));
  const moduleUrl = new URL("../server/fundamentals.mjs", import.meta.url).href;
  const responses = {
    "/api/quote/AAPL/info": info,
    "/api/quote/AAPL/summary": summary,
    "/api/analyst/AAPL/peg-ratio": ratios,
  };
  const script = (offline) => `
    globalThis.fetch = async (url) => {
      if (${offline}) throw new Error("Upstream unavailable");
      const fixtures = ${JSON.stringify(responses)};
      const payload = fixtures[new URL(url).pathname];
      if (!payload) throw new Error("Unexpected source path");
      return new Response(JSON.stringify(payload), {headers:{"Content-Type":"application/json"}});
    };
    const { getFundamentals } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(await getFundamentals(${JSON.stringify(stock)})));
  `;
  const options = {
    env: { ...process.env, CACHE_DIR: cacheDir, NODE_ENV: "test" },
  };
  try {
    const first = JSON.parse(
      (
        await run(
          process.execPath,
          ["--input-type=module", "-e", script(false)],
          options,
        )
      ).stdout,
    );
    assert.equal(first.marketCap, 4989750142000);
    const file = join(cacheDir, "nasdaq-observations.json");
    const cache = JSON.parse(await readFile(file, "utf8"));
    const apple = cache.observations.filter(
      ([path]) =>
        path.startsWith("/quote/AAPL/") || path === "/analyst/AAPL/peg-ratio",
    );
    assert.equal(apple.length, 3);
    cache.observations.forEach(([, observation]) => {
      observation.expires = 0;
    });
    await writeFile(file, JSON.stringify(cache));
    const second = JSON.parse(
      (
        await run(
          process.execPath,
          ["--input-type=module", "-e", script(true)],
          options,
        )
      ).stdout,
    );
    assert.equal(second.marketCap, first.marketCap);
    assert.equal(second.pe, first.pe);
    assert.equal(second.priceRetrievedAt, first.priceRetrievedAt);
    assert.equal(second.marketCapRetrievedAt, first.marketCapRetrievedAt);
    assert.equal(second.peRetrievedAt, first.peRetrievedAt);
    assert.equal(second.stale, true);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("manual seed packaging retains source observations as expired cache and rejects unrelated endpoints", async () => {
  const { buildFundamentalsSeed } = await import(
    "../scripts/refresh-fundamentals-seed.mjs"
  );
  const { gunzipSync } = await import("node:zlib");
  const entries = [
    [
      "/quote/AAPL/info?assetclass=stocks",
      { data: info, retrievedAt, expires: 9999999999999 },
    ],
  ];
  const { compressed, manifest } = buildFundamentalsSeed(
    entries,
    "2026-10-19T12:03:00.000Z",
  );
  const body = JSON.parse(gunzipSync(compressed));
  assert.equal(body.observations[0][1].retrievedAt, retrievedAt);
  assert.equal(body.observations[0][1].expires, 0);
  assert.equal(
    manifest.observations[0].source,
    "https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks",
  );
  assert.equal(manifest.observations[0].retrievedAt, retrievedAt);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.purpose, /cached/i);
  assert.throws(() =>
    buildFundamentalsSeed(
      [["/private?token=secret", entries[0][1]]],
      "2026-10-19T12:03:00.000Z",
    ),
  );
  assert.throws(() =>
    buildFundamentalsSeed(
      [
        [
          entries[0][0],
          { ...entries[0][1], retrievedAt: "2026-10-20T00:00:00.000Z" },
        ],
      ],
      "2026-10-19T12:03:00.000Z",
    ),
  );
});

test("MSTR's documented legal name change corroborates only MicroStrategy and Strategy", () => {
  const former = {
    id: "MSTR",
    ticker: "MSTR",
    name: "MicroStrategy",
    category: "Stock",
  };
  const current = listedInfo("MSTR", "Strategy Inc Common Stock Class A");
  const result = parseFundamentals(current, null, former, retrievedAt);
  assert.equal(result.ticker, "MSTR");
  assert.equal(result.companyName, "Strategy Inc Common Stock Class A");
  assert.throws(() =>
    parseFundamentals(
      current,
      null,
      { ...former, name: "MicroStrategy Holdings" },
      retrievedAt,
    ),
  );
  assert.throws(() =>
    parseFundamentals(
      listedInfo("MSTR", "Strategy Asset Management Common Stock"),
      null,
      former,
      retrievedAt,
    ),
  );
  assert.throws(() =>
    parseFundamentals(
      listedInfo("MU", "Strategy Inc Common Stock Class A"),
      null,
      { ...former, ticker: "MU" },
      retrievedAt,
    ),
  );
});
