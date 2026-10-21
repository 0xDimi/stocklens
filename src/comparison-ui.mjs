import { escape, quoteTable, bestQuote, provider, external } from "./views.mjs";
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
    quotedDeployments: new Set(fresh.map(deploymentKey)).size,
    providers: [
      ...new Set(fresh.map((r) => r.quoteProvider || r.venue).filter(Boolean)),
    ],
  };
}
export function quoteCoverageMarkup(rows, now = Date.now()) {
  const c = quoteCoverage(rows, now);
  return `<strong>${c.fresh} current ${c.fresh === 1 ? "quote" : "quotes"}</strong><span>${c.normalized} share-normalized · ${c.quotedDeployments} of ${c.deployments} token/network combinations quoted</span>`;
}
export function quoteComparison(rows, options = {}) {
  options = { ...options, bestId: bestQuote(rows)?.id || null };
  const available = rows.filter((r) => r.status === "quoted"),
    missing = rows.filter((r) => r.status !== "quoted");
  const verified = available
    .filter(
      (r) => r.rankable && r.equivalentShares > 0 && r.expiresAt > Date.now(),
    )
    .sort((a, b) => a.effectivePrice - b.effectivePrice);
  const leading = [],
    alternatives = [],
    seen = new Set();
  for (const row of verified) {
    const key = deploymentKey(row);
    if (seen.has(key)) alternatives.push(row);
    else {
      seen.add(key);
      leading.push(row);
    }
  }
  const raw = available.filter((r) => !r.rankable && r.expiresAt > Date.now());
  const expired = available.filter((r) => r.expiresAt <= Date.now());
  const groups = new Map();
  for (const row of missing) {
    const key = `${row.issuer}:${row.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    const list = groups.get(key);
    if (!list.some((r) => deploymentKey(r) === deploymentKey(row)))
      list.push(row);
  }
  const result = leading.length
    ? `<p class="quote-section-label">Best share-normalized route per token &amp; network</p>${quoteTable(leading, options)}`
    : `<div class="empty-results"><strong>${available.length ? "No current share-normalized quote." : "No quote returned for these filters."}</strong><p>${raw.length ? "Token quotes below show output units; a verified share conversion is required to compare them." : "Try another network or amount, or explore this token’s markets below."}</p></div>`;
  const disclosure = (title, values, className) =>
    values.length
      ? `<details class="quote-route-group ${className}"><summary>${title} <span>${values.length} ${values.length === 1 ? "route" : "routes"}</span></summary>${quoteTable(values, options)}</details>`
      : "";
  return `<div class="quote-coverage">${quoteCoverageMarkup(rows)}</div>${result}${disclosure("Alternative providers", alternatives, "quote-alternatives")}${disclosure("Token quotes · share conversion unverified", raw, "quote-unverified")}${disclosure("Expired quotes · refresh to trade", expired, "quote-expired")}${missing.length ? `<details class="quote-gaps"${!available.length ? " open" : ""}><summary>Other versions &amp; networks <span>${groups.size} ${groups.size === 1 ? "product" : "products"}</span></summary><p>No supported quote returned for these deployments. Their market links remain available.</p>${[...groups.values()].map((group) => `<article class="quote-gap"><h3>${escape(group[0].symbol)} <small>${escape(provider(group[0]).name)}</small></h3>${group.map((row) => `<div><span class="named-network">${chainLogo(row.chain, row.chainLabel)}${escape(row.chainLabel || row.chain)}</span><p>${escape(row.reason || "No supported route returned a quote.")}${row.quoteFailures?.length ? `<br>${row.quoteFailures.map((f) => `${escape(f.provider)}: ${escape(f.reason)}`).join("<br>")}` : ""}</p><button class="text-button" data-markets-token="${escape(row.address)}" data-chain="${escape(row.chain)}">Explore liquidity →</button></div>`).join("")}${group[0].source ? external(group[0].source, "Product source") : ""}</article>`).join("")}</details>` : ""}`;
}
