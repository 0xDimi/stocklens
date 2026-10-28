import { sourceClient } from "./source-client.mjs";
import { loadCatalog } from "./catalog.mjs";
import { mapLimit } from "./http.mjs";
import { join } from "node:path";
import { readRuntime } from "./runtime.mjs";
import { createReferenceRetention } from "./reference-retention.mjs";
const retainedPrices = createReferenceRetention({
  file: join(readRuntime().cacheDir, "listed-reference-prices.json"),
});
const nasdaq = sourceClient(
  "Nasdaq",
  () => "https://api.nasdaq.com/api",
  250,
  () => ({ "User-Agent": "Mozilla/5.0", Accept: "application/json" }),
  {
    validate: (body) =>
      body?.data != null && Number(body?.status?.rCode) === 200,
    cacheFile: join(readRuntime().cacheDir, "nasdaq-observations.json"),
    seedFile: new URL("./data/nasdaq-observations.json.gz", import.meta.url),
  },
);
const API = "https://api.nasdaq.com/api";
const amount = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/[$,%x\s]/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};
// Nasdaq uses BRK.B in quote info and BRK/B in the corresponding summary.
const sameSymbol = (actual, expected) =>
  typeof actual === "string" &&
  actual.toUpperCase().replace(/^([A-Z0-9]+)\/([A-Z])$/, "$1.$2") === expected;
const positive = (value) => {
  const number = amount(value);
  return number > 0 ? number : null;
};
function nameWords(value) {
  return String(value)
    .toLowerCase()
    .replace(
      /\b(class\s+[a-z]|common stock|ordinary shares|american depositary shares|incorporated|inc|corporation|corp|company|limited|ltd|plc)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+co$/, "");
}
// Exact catalog / Nasdaq names reviewed against the public endpoints on
// 2026-10-23. Keep aliases scoped to the same ticker and exact pair: generic
// stripping of "Daily", "Bear", a sponsor or leverage would merge funds.
// https://api.nasdaq.com/api/quote/{TICKER}/info?assetclass=etf
// SOXS underlying identity: https://api.xstocks.fi/api/v2/public/assets/SOXSx
// https://www.direxion.com/uploads/soxs-soxl.pdf
// IWM: https://www.ishares.com/us/products/239710/ishares-russell-2000-etf
// VTI: https://investor.vanguard.com/investment-products/etfs/profile/vti
const ETF_NAME_PAIRS = {
  // Tradr issuer CUSIP 46152A668 corroborates ISIN US46152A6689 (2026-10-28).
  // https://www.tradretfs.com/snxx
  SNXX: [["SNDK 2x Long ETF", "Tradr 2X Long SNDK Daily ETF"]],
  // Exact issuer underlying symbol/ISIN and Nasdaq ETF name checked 2026-10-28:
  // https://api.xstocks.fi/api/v2/public/assets/KORUx
  // https://api.nasdaq.com/api/quote/KORU/info?assetclass=etf
  KORU: [["Korea 3x Long ETF", "Direxion Daily South Korea Bull 3X ETF"]],
  SOXS: [
    ["3x Short Semiconductor ETF", "Direxion Daily Semiconductor Bear 3X ETF"],
    [
      "Direxion Daily Semi Bear 3X ETF",
      "Direxion Daily Semiconductor Bear 3X ETF",
    ],
  ],
  TMF: [
    [
      "Direxion Daily 20 Year Treasury Bull 3X ETF",
      "Direxion Daily 20-Yr Treasury Bull 3x Shrs",
    ],
  ],
  EWJ: [["iShares MSCI Japan ETF", "iShares MSCI Japan Index Fund"]],
  SOXX: [
    [
      "iShares Semiconductor",
      "iShares PHLX SOX Semiconductor Sector Index Fund",
    ],
    [
      "iShares Semiconductor ETF",
      "iShares PHLX SOX Semiconductor Sector Index Fund",
    ],
  ],
  IWM: [
    ["Russell 2000", "iShares Russell 2000 Index Fund"],
    ["iShares Russell 2000 ETF", "iShares Russell 2000 Index Fund"],
  ],
  VTI: [
    [
      "Vanguard Total Stock Market ETF",
      "Vanguard Morningstar Total Stock Market ETF",
    ],
  ],
  GLD: [["Gold", "SPDR Gold Shares"]],
  TSLL: [
    ["Direxion Daily TSLA Bull 2X Shares", "Direxion Daily TSLA Bull 2X ETF"],
    [
      "Direxion Shares ETF Trust Direxion Daily TSLA Bull 2X ETF",
      "Direxion Daily TSLA Bull 2X ETF",
    ],
  ],
  AVL: [
    ["Direxion Daily AVGO Bull 2X Shares", "Direxion Daily AVGO Bull 2X ETF"],
  ],
  MUU: [["Direxion Daily MU Bull 2X Shares", "Direxion Daily MU Bull 2X ETF"]],
  LABD: [
    [
      "Direxion Daily S&P Biotech Bear 3x Shares ETF",
      "Direxion Daily S&P Biotech Bear 3X ETF",
    ],
  ],
  LABU: [
    [
      "Direxion Daily S&P Biotech Bull 3x Shares ETF",
      "Direxion Daily S&P Biotech Bull 3X ETF",
    ],
  ],
  TZA: [
    [
      "Direxion Daily Small Cap Bear 3X Shares ETF",
      "Direxion Small Cap Bear 3X ETF",
    ],
  ],
  TNA: [
    ["Direxion Daily Small Cap Bull 3x ETF", "Direxion Small Cap Bull 3X ETF"],
  ],
  SIVR: [["abrdn Physical Silver ETF", "abrdn Physical Silver Shares ETF"]],
  ARKB: [["ARK 21 Bitcoin ETF", "ARK 21Shares Bitcoin ETF "]],
  PAVE: [
    [
      "Global X US Infrastructure Development ETF",
      "Global X Funds Global X U.S. Infrastructure Development ETF",
    ],
  ],
  NVD: [
    [
      "GraniteShares ETF Trust GraniteShares 2x Short NVDA Daily ETF",
      "GraniteShares 2x Short NVDA Daily ETF",
    ],
  ],
  PHO: [
    [
      "Invesco Exchange-Traded Fund Trust Invesco Water Resources ETF",
      "Invesco Water Resources ETF",
    ],
  ],
  TSLQ: [
    [
      "Investment Managers Series Trust II Tradr 2X Short TSLA Daily ETF",
      "Tradr 2X Short TSLA Daily ETF",
    ],
  ],
  IWF: [
    ["iShares Russell 1000 Growth ETF", "iShares Russell 1000 Growth Fund"],
  ],
  ITA: [
    [
      "iShares US Aerospace and Defense ETF",
      "iShares U.S. Aerospace & Defense ETF",
    ],
  ],
  HLAL: [
    [
      "Listed Funds Trust Wahed FTSE USA Shariah ETF",
      "Wahed FTSE USA Shariah ETF",
    ],
  ],
  UFO: [["Procure ETF Trust II Procure Space ETF", "Procure Space ETF"]],
  VGK: [["Vanguard FTSE Europe ETF", "Vanguard FTSEEuropean ETF"]],
  VUG: [["Vanguard Growth ETF", "Vanguard Morningstar Growth ETF"]],
  FEZ: [["SPDR EURO STOXX 50", "State Street SPDR EURO STOXX 50 ETF"]],
};
function listedExchange(value) {
  const exchange = String(value || "").toUpperCase();
  if (/^NASDAQ(?:-(?:GS|GM|CM))?$/.test(exchange)) return "NASDAQ";
  if (["ARCA", "NYSE ARCA", "PSE"].includes(exchange)) return "ARCA";
  if (["AMEX", "NYSE AMERICAN", "NYSE MKT"].includes(exchange)) return "AMEX";
  return ["NYSE", "BATS"].includes(exchange) ? exchange : null;
}
function corroboratesName(stock, companyName) {
  const target = nameWords(stock.name),
    actual = nameWords(companyName);
  if (!target || !actual) return false;
  // The company's disclosed rename retains Nasdaq ticker BNC. Never apply
  // this brand alias to another ticker or an unrelated security.
  // https://www.bnbstandard.com/investors/announcements (2026-09-29)
  if (
    stock.ticker === "BNC" &&
    stock.category === "Stock" &&
    target === nameWords("CEA Industries") &&
    actual === nameWords("BNB Standard Corporation Common Stock")
  )
    return true;
  if (
    stock.category === "ETF" &&
    ETF_NAME_PAIRS[stock.ticker]?.some(
      ([catalogName, listedName]) =>
        target === nameWords(catalogName) && actual === nameWords(listedName),
    )
  )
    return true;
  // Catalog / Nasdaq name pair observed 2026-10-21:
  // https://api.nasdaq.com/api/quote/SOXL/info?assetclass=etf
  // Keep this exact alias scoped to SOXL. Removing Daily or ETF from every fund
  // name would weaken checks for reset periods, exposure, and leverage.
  if (
    stock.category === "ETF" &&
    stock.ticker === "SOXL" &&
    target === "direxion semiconductor bull 3x"
  )
    return [
      "direxion semiconductor bull 3x",
      "direxion semiconductor bull 3x etf",
      "direxion daily semiconductor bull 3x etf",
    ].includes(actual);
  // Legal name changed on 2025-08-11; MSTR Class A and its CUSIP remained unchanged.
  // https://www.strategy.com/press/strategy-announces-legal-name-change-from-microstrategy-incorporated-to-strategy-inc_08-14-2025
  if (
    stock.ticker === "MSTR" &&
    target === "microstrategy" &&
    actual === "strategy"
  )
    return true;
  // The June 2026 10-Q names the SPCX registrant and its SpaceX brand together.
  // https://www.sec.gov/Archives/edgar/data/1181412/000162828026052535/spcx-20260630.htm
  if (
    stock.ticker === "SPCX" &&
    target === "spacex" &&
    actual === "space exploration technologies"
  )
    return true;
  if (
    target.replace(/ /g, "") === actual.replace(/ /g, "") ||
    actual.startsWith(target + " ") ||
    target.startsWith(actual + " ")
  )
    return true;
  // ETF sponsors can be prepended to the fund's disclosed name (e.g. State Street).
  if (
    stock.category === "ETF" &&
    target.length >= 8 &&
    actual.endsWith(" " + target)
  )
    return true;
  // AMD and UPS are catalog acronyms of their full listed company names. Require
  // both the exact requested symbol (checked separately) and all company initials.
  return (
    /^[A-Z]{2,5}$/.test(stock.name) &&
    stock.name === stock.ticker &&
    actual
      .split(" ")
      .map((word) => word[0])
      .join("") === stock.name.toLowerCase()
  );
}
function disclosedPe(ratios, ticker) {
  if (ratios?.data?.symbol && !sameSymbol(ratios.data.symbol, ticker))
    return null;
  const points = ratios?.data?.per?.peRatioChart;
  if (!Array.isArray(points)) return null;
  return (
    points
      .filter(
        (point) =>
          point && /^\d{4} Actual$/.test(point.x) && amount(point.y) !== null,
      )
      .sort((a, b) => Number(b.x.slice(0, 4)) - Number(a.x.slice(0, 4)))[0] ||
    null
  );
}
export function easternTime(value) {
  const match = String(value).match(
    /^(?:Closed at )?([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET$/,
  );
  if (!match) return null;
  const [, mon, day, year, hour, minute, period] = match;
  if (Number(hour) < 1 || Number(hour) > 12 || Number(minute) > 59) return null;
  const date = Date.parse(
    `${mon} ${day} ${year} ${(Number(hour) % 12) + (period === "PM" ? 12 : 0)}:${minute}:00 GMT`,
  );
  if (!Number.isFinite(date)) return null;
  if (
    new Date(date).getUTCDate() !== Number(day) ||
    new Date(date).getUTCFullYear() !== Number(year)
  )
    return null;
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(date))
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = zone?.match(/GMT([+-]\d+)(?::(\d+))?/);
  return offset
    ? date -
        (Number(offset[1]) * 60 +
          Math.sign(Number(offset[1])) * Number(offset[2] || 0)) *
          60000
    : null;
}
function priceTime(value, marketStatus, isRealTime) {
  const at = easternTime(value);
  if (at !== null) return { at, timePrecisionMs: 60000, priceDate: null };
  // Nasdaq's closed-session response sometimes supplies only the session date.
  // Store its date boundary for ordering, with explicit day precision; never
  // invent a 4pm close timestamp (early-close days also exist).
  // A date-only, non-real-time observation is also returned for some ETFs
  // during premarket. It is a dated price, with no evidence it is a close.
  if (
    marketStatus !== "Closed" &&
    !(
      isRealTime === false &&
      ["Pre-Market", "After-Hours"].includes(marketStatus)
    )
  )
    return null;
  const match = String(value).match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const date = Date.parse(`${month} ${day}, ${year} 00:00:00 GMT`);
  if (!Number.isFinite(date)) return null;
  const parsed = new Date(date);
  if (
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCFullYear() !== Number(year)
  )
    return null;
  return {
    at: date,
    timePrecisionMs: 86400000,
    priceDate: parsed.toISOString().slice(0, 10),
  };
}
export function parseFundamentals(
  info,
  summary,
  stock,
  retrievedAt,
  ratios = null,
) {
  const d = info?.data,
    s = summary?.data;
  const isEtf =
    stock.category === "ETF" ||
    (stock.category === "Listed security" &&
      d?.assetClass?.toUpperCase() === "ETF");
  if (
    !sameSymbol(d?.symbol, stock.ticker) ||
    !d.companyName ||
    (d.assetClass &&
      d.assetClass.toUpperCase() !== (isEtf ? "ETF" : "STOCKS")) ||
    (stock.exchange &&
      (!listedExchange(stock.exchange) ||
        listedExchange(stock.exchange) !== listedExchange(d.exchange)))
  )
    throw new Error("Listed-stock identity unavailable.");
  if (
    !corroboratesName(
      isEtf ? { ...stock, category: "ETF" } : stock,
      d.companyName,
    )
  )
    throw new Error(
      "Listed-stock name does not corroborate the catalog identity.",
    );
  const primary = d.primaryData || {},
    secondary = d.secondaryData || {};
  const usePrimary =
    positive(primary.lastSalePrice) !== null &&
    priceTime(
      primary.lastTradeTimestamp,
      d.marketStatus,
      primary.isRealTime,
    ) !== null;
  const quote = usePrimary ? primary : secondary;
  const price = positive(quote.lastSalePrice),
    time = priceTime(
      quote.lastTradeTimestamp,
      d.marketStatus,
      quote.isRealTime,
    );
  const quoteValid = price !== null && time !== null;
  const root = `/quote/${encodeURIComponent(stock.ticker)}`;
  const query = "?assetclass=" + (isEtf ? "etf" : "stocks");
  const pePoint = !isEtf ? disclosedPe(ratios, stock.ticker) : null;
  const marketCap =
    !isEtf && sameSymbol(s?.symbol, stock.ticker)
      ? positive(s.summaryData?.MarketCap?.value)
      : null;
  return {
    id: stock.id,
    ticker: stock.ticker,
    companyName: d.companyName,
    exchange: typeof d.exchange === "string" ? d.exchange : null,
    securityType: typeof d.stockType === "string" ? d.stockType : null,
    available: quoteValid,
    price: quoteValid ? price : null,
    at: quoteValid ? time.at : null,
    timePrecisionMs: quoteValid ? time.timePrecisionMs : null,
    priceDate: quoteValid ? time.priceDate : null,
    priceTimestamp: quoteValid ? quote.lastTradeTimestamp : null,
    priceTimeBasis: quoteValid
      ? time.priceDate
        ? "Source reports the session date only; no trade time is disclosed. The timestamp is the date boundary, not a live trade."
        : "Nasdaq-reported trade time, to minute precision."
      : null,
    currency: quoteValid
      ? typeof quote.currency === "string" && /^[A-Z]{3}$/.test(quote.currency)
        ? quote.currency
        : String(quote.lastSalePrice).startsWith("$")
          ? "USD"
          : null
      : null,
    changePct: quoteValid ? amount(quote.percentageChange) : null,
    marketStatus: d.marketStatus || null,
    priceSession: quoteValid
      ? /^Closed at /.test(quote.lastTradeTimestamp)
        ? "Closed"
        : time.priceDate && d.marketStatus !== "Closed"
          ? null
          : d.marketStatus || null
      : null,
    isRealTime:
      quoteValid && typeof quote.isRealTime === "boolean"
        ? quote.isRealTime
        : null,
    priceReason: quoteValid
      ? null
      : "Nasdaq did not report a dated listed-security price.",
    priceSource: API + root + "/info" + query,
    priceRetrievedAt: retrievedAt,
    marketCap,
    marketCapStatus:
      marketCap !== null
        ? "available"
        : isEtf
          ? "not-applicable"
          : "not-reported",
    marketCapAsOf: null,
    marketCapSource: API + root + "/summary" + query,
    marketCapReason:
      marketCap !== null
        ? null
        : isEtf
          ? "Company capitalization is not applicable to an ETF."
          : "Nasdaq did not report company capitalization.",
    pe: pePoint ? amount(pePoint.y) : null,
    peStatus: pePoint ? "available" : isEtf ? "not-applicable" : "not-reported",
    pePeriod: pePoint?.x || null,
    peBasis: pePoint ? "Nasdaq fiscal-year P/E (Zacks)" : null,
    peMethodology: pePoint ? ratios.data.per.text || null : null,
    peAsOf: null,
    peSource: isEtf
      ? null
      : `${API}/analyst/${encodeURIComponent(stock.ticker)}/peg-ratio`,
    peReason: pePoint
      ? null
      : isEtf
        ? "Company P/E is not applicable to an ETF."
        : "Nasdaq did not report a fiscal-year Actual P/E.",
    sector: sameSymbol(s?.symbol, stock.ticker)
      ? s.summaryData?.Sector?.value || null
      : null,
    source: `https://www.nasdaq.com/market-activity/${isEtf ? "etf" : "stocks"}/${encodeURIComponent(stock.ticker.toLowerCase())}`,
    retrievedAt,
    basis:
      "Nasdaq listed-security reference. Company capitalization and P/E are distinct from tokenized capitalization. P/E uses the provider's named fiscal Actual period, not trailing twelve months. Fundamental as-of times are not disclosed by these endpoints. Missing values are not estimated.",
  };
}
function fulfilledObservation(result) {
  const observation = result.status === "fulfilled" ? result.value : null;
  const code = observation?.data?.status?.rCode;
  return observation?.data && (code == null || Number(code) === 200)
    ? observation
    : null;
}
export async function getFundamentals(
  stock,
  {
    getSource = nasdaq,
    priceOnly = false,
    onPrice = () => {},
    retention = getSource === nasdaq ? retainedPrices : null,
  } = {},
) {
  if (!/^[A-Z0-9.\-]{1,12}$/.test(stock.ticker)) return null;
  const retainUnavailable = async () => {
    if (!retention) return null;
    const retained = await retention.merge({
      id: stock.id,
      ticker: stock.ticker,
      companyName: stock.name,
      price: null,
      at: null,
      currency: null,
      available: false,
      marketCap: null,
      pe: null,
      marketCapStatus:
        stock.category === "ETF" ? "not-applicable" : "unavailable",
      peStatus: stock.category === "ETF" ? "not-applicable" : "unavailable",
      marketCapReason:
        "Company capitalization source is currently unavailable.",
      peReason: "Fiscal-year P/E source is currently unavailable.",
      retrievedAt: new Date().toISOString(),
    });
    return retained.price > 0 ? retained : null;
  };
  try {
    const path = `/quote/${encodeURIComponent(stock.ticker)}`;
    const unclassified = stock.category === "Listed security";
    let isEtf =
      stock.category === "ETF" ||
      (unclassified && /ETF|iShares|Vanguard|SPDR|\b[23]x\b/i.test(stock.name));
    let query = "?assetclass=" + (isEtf ? "etf" : "stocks");
    let info;
    try {
      info = await getSource(path + "/info" + query, 60000);
    } catch (error) {
      if (!unclassified) throw error;
    }
    // The generic catalog category is not evidence of an equity. Try the
    // alternate class at the exact same symbol only when no identity was
    // returned. A conflicting name/symbol must still fail validation below.
    if (unclassified && !info?.data?.data) {
      isEtf = !isEtf;
      query = "?assetclass=" + (isEtf ? "etf" : "stocks");
      info = await getSource(path + "/info" + query, 60000);
    }
    const assetClass = info?.data?.data?.assetClass;
    if (
      (unclassified && typeof assetClass !== "string") ||
      (assetClass && assetClass.toUpperCase() !== (isEtf ? "ETF" : "STOCKS"))
    )
      throw new Error("Listed-stock endpoint identity unavailable.");
    // Validate before requesting optional company metrics. A source-confirmed
    // ETF has no company capitalization or equity analyst P/E.
    const price = {
      ...parseFundamentals(info?.data, null, stock, info?.retrievedAt),
      priceStale: info.stale === true,
      stale: info.stale === true,
    };
    const listed = retention ? await retention.merge(price) : price;
    onPrice(listed);
    if (priceOnly) return listed;
    const [summary, ratios] = await Promise.allSettled([
      getSource(path + "/summary" + query, 900000),
      isEtf
        ? Promise.resolve(null)
        : getSource(
            `/analyst/${encodeURIComponent(stock.ticker)}/peg-ratio`,
            900000,
          ),
    ]);
    const summaryObservation = fulfilledObservation(summary);
    const peObservation = fulfilledObservation(ratios);
    const result = parseFundamentals(
      info.data,
      summaryObservation?.data,
      stock,
      info.retrievedAt,
      peObservation?.data,
    );
    const priceStale = info.stale === true,
      marketCapStale =
        result.marketCap !== null && summaryObservation?.stale === true,
      peStale = result.pe !== null && peObservation?.stale === true;
    const reference = {
      ...result,
      marketCapRetrievedAt:
        result.marketCap !== null
          ? summaryObservation?.retrievedAt || null
          : null,
      peRetrievedAt:
        result.pe !== null ? peObservation?.retrievedAt || null : null,
      marketCapStatus:
        !isEtf && !summaryObservation ? "unavailable" : result.marketCapStatus,
      peStatus: !isEtf && !peObservation ? "unavailable" : result.peStatus,
      marketCapReason:
        !isEtf && !summaryObservation
          ? "Nasdaq company capitalization is currently unavailable."
          : result.marketCapReason,
      peReason:
        !isEtf && !peObservation
          ? "Nasdaq fiscal-year P/E is currently unavailable."
          : result.peReason,
      priceStale,
      marketCapStale,
      peStale,
      stale: priceStale || marketCapStale || peStale,
      staleReason:
        priceStale || marketCapStale || peStale
          ? "A previous successful Nasdaq observation is retained because its source refresh failed."
          : null,
    };
    return retention ? await retention.merge(reference) : reference;
  } catch {
    return retainUnavailable();
  }
}
export async function fundamentalsView(
  params,
  { getCatalog = loadCatalog, getReference = getFundamentals } = {},
) {
  const ids = (params.get("ids") || "").split(",");
  if (
    !ids.length ||
    ids.length > 25 ||
    ids.some((id) => !/^[A-Za-z0-9.:\-]{1,100}$/.test(id))
  )
    throw Object.assign(new Error("Choose 1–25 catalog asset identifiers."), {
      status: 400,
    });
  const catalog = await getCatalog();
  const stocks = ids.map((id) => catalog.stocks.find((s) => s.id === id));
  if (stocks.some((s) => !s))
    throw Object.assign(new Error("Choose exact catalog assets."), {
      status: 400,
    });
  const rows = await mapLimit(stocks, 4, async (stock) => ({
    id: stock.id,
    reference: await getReference(stock),
  }));
  return {
    rows,
    retrievedAt: new Date().toISOString(),
    coverage:
      "Requested page only. Nasdaq reference prices can be delayed or refer to an earlier session. No assumed P/E or premium.",
  };
}
