import { findStocks } from "./model.mjs";
export function selectMarketRows(
  rows,
  {
    query = "",
    type = "all",
    chain = "all",
    issuer = "all",
    sort = "volume",
    savedOnly = false,
    saved = new Set(),
  } = {},
) {
  return findStocks(rows, query)
    .filter(
      (row) =>
        (type === "all" || row.category === type) &&
        (!savedOnly || saved.has(row.id)) &&
        (chain === "all" ||
          row.products.some((p) =>
            p.deployments.some((d) => d.chain === chain),
          )) &&
        (issuer === "all" || row.products.some((p) => p.issuer === issuer)),
    )
    .sort((a, b) => {
      if (sort === "name") return a.ticker.localeCompare(b.ticker);
      const value = (r) =>
        sort === "versions"
          ? r.products.length
          : sort === "chains"
            ? new Set(
                r.products.flatMap((p) => p.deployments.map((d) => d.chain)),
              ).size
            : r.market?.[
                {
                  volume: "volume24h",
                  cap: "marketCap",
                  price: "price",
                  gainers: "change24h",
                  losers: "change24h",
                }[sort] || "volume24h"
              ];
      const av = value(a),
        bv = value(b);
      if (!Number.isFinite(av))
        return Number.isFinite(bv) ? 1 : a.ticker.localeCompare(b.ticker);
      if (!Number.isFinite(bv)) return -1;
      return (
        (sort === "losers" ? av - bv : bv - av) ||
        a.ticker.localeCompare(b.ticker)
      );
    });
}
// Never derive a premium from a nominal token price with assumed 1:1 units.
export function premium(observation, benchmark, now = Date.now()) {
  if (
    !observation?.conversionVerified ||
    observation.currency !== "USD" ||
    benchmark?.currency !== "USD"
  )
    return null;
  if (
    ![observation.price, observation.sharesPerToken, benchmark.price].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    return null;
  if (
    ![observation.at, benchmark.at].every(
      (t) => Number.isFinite(t) && t <= now && now - t <= 300000,
    ) ||
    Math.abs(observation.at - benchmark.at) > 120000
  )
    return null;
  return (
    (observation.price / observation.sharesPerToken / benchmark.price - 1) * 100
  );
}
export function needsReference(reference, now = Date.now()) {
  const retrieved = Date.parse(reference?.retrievedAt);
  return (
    !reference ||
    reference.stale === true ||
    !Number.isFinite(retrieved) ||
    retrieved > now ||
    now - retrieved > 300000
  );
}
