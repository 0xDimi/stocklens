import { sourceClient } from "./source-client.mjs";
import { cleanName } from "./coingecko.mjs";
import { loadCatalog } from "./catalog.mjs";
import { mapLimit } from "./http.mjs";
const nasdaq = sourceClient(
  "Nasdaq",
  () => "https://api.nasdaq.com/api",
  500,
  () => ({ "User-Agent": "Mozilla/5.0", Accept: "application/json" }),
);
const amount = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/[$,%x\s]/g, "");
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};
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
export function parseFundamentals(info, summary, stock, retrievedAt) {
  const d = info?.data,
    s = summary?.data;
  if (d?.symbol !== stock.ticker || !d.companyName)
    throw new Error("Listed-stock identity unavailable.");
  const target = cleanName(stock.name),
    actual = cleanName(d.companyName);
  if (
    target.length < 3 ||
    !(actual.startsWith(target) || target.startsWith(actual))
  )
    throw new Error(
      "Listed-stock name does not corroborate the catalog identity.",
    );
  const primary = d.primaryData || {},
    at = easternTime(primary.lastTradeTimestamp),
    price = amount(primary.lastSalePrice);
  return {
    id: stock.id,
    ticker: stock.ticker,
    companyName: d.companyName,
    price,
    at,
    currency: primary.lastSalePrice?.startsWith("$") ? "USD" : null,
    changePct:
      typeof primary.percentageChange === "string"
        ? Number(primary.percentageChange.replace("%", ""))
        : null,
    marketStatus: d.marketStatus || null,
    marketCap:
      s?.symbol === stock.ticker
        ? amount(s.summaryData?.MarketCap?.value)
        : null,
    pe:
      s?.symbol === stock.ticker ? amount(s.summaryData?.PERatio?.value) : null,
    sector:
      s?.symbol === stock.ticker ? s.summaryData?.Sector?.value || null : null,
    source: `https://www.nasdaq.com/market-activity/${stock.category === "ETF" ? "etf" : "stocks"}/${encodeURIComponent(stock.ticker.toLowerCase())}`,
    retrievedAt,
    basis:
      "Nasdaq listed-security reference. Company capitalization and P/E are distinct from tokenized capitalization. A missing value is not estimated.",
  };
}
export async function getFundamentals(stock) {
  if (!/^[A-Z0-9.\-]{1,12}$/.test(stock.ticker)) return null;
  try {
    const path = `/quote/${encodeURIComponent(stock.ticker)}`,
      query = "?assetclass=" + (stock.category === "ETF" ? "etf" : "stocks");
    const [info, summary] = await Promise.allSettled([
      nasdaq(path + "/info" + query, 60000),
      nasdaq(path + "/summary" + query, 900000),
    ]);
    if (info.status !== "fulfilled") return null;
    const result = parseFundamentals(
      info.value.data,
      summary.status === "fulfilled" ? summary.value.data : null,
      stock,
      info.value.retrievedAt,
    );
    return {
      ...result,
      stale:
        info.value.stale === true ||
        (summary.status === "fulfilled" && summary.value.stale === true),
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
