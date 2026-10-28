export const issuerLink = (id = "") =>
  "/?" +
  new URLSearchParams({ page: "issuers", ...(id ? { issuer: id } : {}) });

export function selectIssuers(
  rows,
  { query = "", chain = "all", sort = "cap" } = {},
) {
  const q = query.trim().toLowerCase();
  const value = (r) =>
    ({
      cap: r.market?.marketCap,
      volume: r.market?.volume24h,
      assets: r.assetCount,
      networks: r.networks.length,
      change: r.market?.capChangePercent24h,
    })[sort];
  return rows
    .filter(
      (r) =>
        (!q ||
          [r.name, r.sourceName, r.id].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q),
          )) &&
        (chain === "all" || r.networks.some((n) => n.id === chain)),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const av = value(a),
        bv = value(b);
      return (
        (Number.isFinite(bv) ? bv : -Infinity) -
          (Number.isFinite(av) ? av : -Infinity) || a.name.localeCompare(b.name)
      );
    });
}
export function issuerPercent(value, digits = 2) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }) + "%"
    : "—";
}
export function issuerExportColumns(name) {
  return [
    ["Issuer", (r) => name(r)],
    ["Reported token market cap USD", (r) => r.market?.marketCap],
    ["Share of reported cap percent", (r) => r.market?.share],
    ["Reported 24h volume USD", (r) => r.market?.volume24h],
    ["Market cap change 24h USD", (r) => r.market?.capChange24h],
    ["Market cap change 24h percent", (r) => r.market?.capChangePercent24h],
    ["Mapped underlying assets", (r) => r.assetCount],
    ["Stocks", (r) => r.stocks],
    ["ETFs", (r) => r.etfs],
    ["Unclassified securities", (r) => r.unclassified],
    ["Native products", (r) => r.nativeProducts],
    ["Wrapped products", (r) => r.wrappedProducts],
    ["Networks", (r) => r.networks.map((n) => n.id).join(" | ")],
    ["Source-reported tokens", (r) => r.market?.reportedTokens],
    ["Market source time", (r) => r.market?.sourceAt],
    ["Market source URL", (r) => r.market?.apiSource],
  ];
}
