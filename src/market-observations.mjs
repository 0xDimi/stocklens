// Shared by the server feed and its browser fallback. Identity joins use RWA IDs only.
const numeric = (value, minimum = 0) =>
  value != null &&
  value !== "" &&
  typeof value !== "boolean" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= minimum
    ? Number(value)
    : null;
const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;

export function marketObservation(row) {
  const data = row?.tokenized_market_data;
  if (!data || typeof data !== "object") return null;
  const samples = data.sparkline_in_7d?.price;
  return {
    price: numeric(data.current_price),
    change24h: numeric(data.price_change_percentage_24h, -Infinity),
    volume24h: numeric(data.total_volume),
    marketCap: numeric(data.market_cap),
    high24h: numeric(data.high_24h),
    low24h: numeric(data.low_24h),
    updatedAt: timestamp(data.last_updated),
    sparkline:
      Array.isArray(samples) && samples.every((value) => numeric(value) > 0)
        ? samples.map(Number)
        : [],
    image: typeof row.image === "string" ? row.image : row.image?.small || null,
  };
}

export function indexMarketObservations(data) {
  if (!Array.isArray(data) || data.length > 250)
    throw new Error("Invalid CoinGecko market response.");
  const index = new Map();
  for (const row of data) {
    if (!/^[a-z0-9-]+$/.test(row?.id || "")) continue;
    index.set(row.id, index.has(row.id) ? null : marketObservation(row));
  }
  return index;
}
