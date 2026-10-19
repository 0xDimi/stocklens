import { sourceClient } from "./source-client.mjs";
import { loadCatalog } from "./catalog.mjs";
import { mapLimit } from "./http.mjs";
import { join } from "node:path";
import { readRuntime } from "./runtime.mjs";
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
function corroboratesName(stock, companyName) {
  const target = nameWords(stock.name),
    actual = nameWords(companyName);
  if (!target || !actual) return false;
  // Legal name changed on 2025-08-11; MSTR Class A and its CUSIP remained unchanged.
  // https://www.strategy.com/press/strategy-announces-legal-name-change-from-microstrategy-incorporated-to-strategy-inc_08-14-2025
  if (stock.ticker === "MSTR" && target === "microstrategy" && actual === "strategy")
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
    /(?:Closed at )?([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET/,
  );
  if (!match) return null;
  const [, mon, day, year, hour, minute, period] = match;
  const date = Date.parse(
    `${mon} ${day} ${year} ${(Number(hour) % 12) + (period === "PM" ? 12 : 0)}:${minute}:00 GMT`,
  );
  if (!Number.isFinite(date)) return null;
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
export function parseFundamentals(
  info,
  summary,
  stock,
  retrievedAt,
  ratios = null,
) {
  const d = info?.data,
    s = summary?.data;
  const isEtf = stock.category === "ETF";
  if (
    !sameSymbol(d?.symbol, stock.ticker) ||
    !d.companyName ||
    (d.assetClass && d.assetClass.toUpperCase() !== (isEtf ? "ETF" : "STOCKS"))
  )
    throw new Error("Listed-stock identity unavailable.");
  if (!corroboratesName(stock, d.companyName))
    throw new Error(
      "Listed-stock name does not corroborate the catalog identity.",
    );
  const primary = d.primaryData || {},
    secondary = d.secondaryData || {};
  const usePrimary =
    positive(primary.lastSalePrice) !== null &&
    easternTime(primary.lastTradeTimestamp) !== null;
  const quote = usePrimary ? primary : secondary;
  const price = positive(quote.lastSalePrice),
    at = easternTime(quote.lastTradeTimestamp);
  const quoteValid = price !== null && at !== null;
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
    available: quoteValid,
    price: quoteValid ? price : null,
    at: quoteValid ? at : null,
    timePrecisionMs: 60000,
    currency: quoteValid && quote.lastSalePrice?.startsWith("$") ? "USD" : null,
    changePct: quoteValid ? amount(quote.percentageChange) : null,
    marketStatus: d.marketStatus || null,
    priceSession: quoteValid
      ? /^Closed at /.test(quote.lastTradeTimestamp)
        ? "Closed"
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
export async function getFundamentals(stock, { getSource = nasdaq } = {}) {
  if (!/^[A-Z0-9.\-]{1,12}$/.test(stock.ticker)) return null;
  try {
    const path = `/quote/${encodeURIComponent(stock.ticker)}`,
      isEtf = stock.category === "ETF",
      query = "?assetclass=" + (isEtf ? "etf" : "stocks");
    const [info, summary, ratios] = await Promise.allSettled([
      getSource(path + "/info" + query, 60000),
      getSource(path + "/summary" + query, 900000),
      isEtf
        ? Promise.resolve(null)
        : getSource(
            `/analyst/${encodeURIComponent(stock.ticker)}/peg-ratio`,
            900000,
          ),
    ]);
    if (info.status !== "fulfilled") return null;
    const summaryObservation = fulfilledObservation(summary);
    const peObservation = fulfilledObservation(ratios);
    const result = parseFundamentals(
      info.value.data,
      summaryObservation?.data,
      stock,
      info.value.retrievedAt,
      peObservation?.data,
    );
    const priceStale = info.value.stale === true,
      marketCapStale =
        result.marketCap !== null && summaryObservation?.stale === true,
      peStale = result.pe !== null && peObservation?.stale === true;
    return {
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
  } catch {
    return null;
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
