import { escape, quoteTable, provider, external } from "./views.mjs";
import { chainLogo } from "./brands.mjs";
const deploymentKey = (row) =>
  `${row.issuer}:${row.chain}:${row.chain === "Solana" ? row.address : String(row.address || "").toLowerCase()}`;
export function quoteCoverage(rows, now = Date.now()) {
  const quoted = rows.filter((r) => r.status === "quoted"),
    fresh = quoted.filter((r) => r.expiresAt > now);
  return {
    routes: quoted.length,
    fresh: fresh.length,
    normalized: fresh.filter(
      (r) => r.rankable && Number.isFinite(r.equivalentShares),
    ).length,
    deployments: new Set(rows.map(deploymentKey)).size,
    quotedDeployments: new Set(quoted.map(deploymentKey)).size,
    providers: [
      ...new Set(quoted.map((r) => r.quoteProvider || r.venue).filter(Boolean)),
    ],
  };
}
export function quoteComparison(rows) {
  const available = rows.filter((r) => r.status === "quoted"),
    missing = rows.filter((r) => r.status !== "quoted");
  const groups = new Map();
  for (const row of missing) {
    const key = `${row.issuer}:${row.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    const list = groups.get(key);
    if (!list.some((r) => deploymentKey(r) === deploymentKey(row)))
      list.push(row);
  }
  const coverage = quoteCoverage(rows);
  const result = available.length
    ? quoteTable(available)
    : '<div class="empty-results"><strong>No quote returned for these filters.</strong><p>Try another network or amount. The versions below show which routes were checked and where to explore their markets.</p></div>';
  return `<div class="quote-coverage"><strong>${coverage.fresh} current ${coverage.fresh === 1 ? "quote" : "quotes"}</strong><span>${coverage.quotedDeployments} of ${coverage.deployments} token/network combinations returned quotes · ${coverage.normalized} share-normalized</span></div>${result}${missing.length ? `<details class="quote-gaps"${!available.length ? " open" : ""}><summary>Other versions &amp; networks <span>${groups.size} ${groups.size === 1 ? "product" : "products"}</span></summary><p>A listed token does not guarantee a supported trade. These routes returned no quote; market links remain available.</p>${[...groups.values()].map((group) => `<article class="quote-gap"><h3>${escape(group[0].symbol)} <small>${escape(provider(group[0]).name)}</small></h3>${group.map((row) => `<div><span class="named-network">${chainLogo(row.chain, row.chainLabel)}${escape(row.chainLabel || row.chain)}</span><p>${escape(row.reason || "No supported route returned a quote.")}</p><button class="text-button" data-markets-token="${escape(row.address)}" data-chain="${escape(row.chain)}">Explore liquidity →</button></div>`).join("")}${group[0].source ? external(group[0].source, "Product source") : ""}</article>`).join("")}</details>` : ""}`;
}
