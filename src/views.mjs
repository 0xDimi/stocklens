import { issuers } from "./data.mjs";
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const number = (value, digits = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
export const usd = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value < 1 ? 4 : 2,
      }).format(value)
    : "—";
export const compact = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value)
    : "—";
export const stamp = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Not supplied";
export const provider = (p) =>
  issuers[p.issuer] || {
    name: p.issuerName || p.issuer,
    short: (p.issuerName || p.issuer || "?")[0],
    structure: "Not reviewed",
    rights:
      "Holder rights have not been independently reviewed. Read the product’s issuer documents.",
    dividends: "Dividend and corporate-action treatment not reviewed.",
    exit: "Redemption, onboarding, minimums and eligibility not reviewed.",
    url: p.source,
    source: p.source,
    sourceLabel: "CoinGecko product record",
    eligibility: p.source,
    eligibilityLabel: "Product links & issuer website",
  };
export const external = (url, label, classes = "") =>
  `<a class="${classes}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const change = (value) =>
  Number.isFinite(value)
    ? `<span class="${value < 0 ? "negative" : "positive"}">${value > 0 ? "+" : ""}${number(value)}%</span>`
    : "—";
const mark = (p) =>
  `<span class="issuer-mark ${escape(p.issuer)}" aria-hidden="true">${escape(provider(p).short)}</span>`;
export function termsDetails(p) {
  const info = provider(p);
  return `<div class="product-details"><div class="details-column"><h4>Structure & rights</h4><strong>${escape(info.structure)}</strong><p>${escape(info.rights)}</p>${external(info.source, info.sourceLabel)}</div><div class="details-column"><h4>Dividends & corporate actions</h4><p>${escape(info.dividends)}</p></div><div class="details-column"><h4>Exit & eligibility</h4><p>${escape(info.exit)}</p>${external(info.eligibility, info.eligibilityLabel)}</div></div>`;
}
export function productsTable(rows, chains, chain) {
  return (
    `<div class="product-table-head"><span>Token / issuer</span><span>USD / token</span><span>24h</span><span>24h volume</span><span>Market cap</span><span>Chains</span></div>` +
    rows
      .map((p) => {
        const m = p.market,
          info = provider(p);
        const stale =
          m?.updatedAt &&
          Date.now() - new Date(m.updatedAt).getTime() > 300_000;
        return `<details class="product-row"><summary><span class="token-cell">${mark(p)}<span><strong>${escape(p.symbol)}</strong><small>${escape(info.name)}</small></span></span><span data-label="USD / token"><strong>${usd(m?.price)}</strong>${stale ? "<small>older observation</small>" : ""}</span><span data-label="24h">${change(m?.change24h)}</span><span data-label="24h volume">${compact(m?.volume24h)}</span><span data-label="Market cap">${compact(m?.marketCap)}</span><span class="deployment-count">${p.deployments.length}<small>chains</small><i aria-hidden="true">⌄</i></span></summary><div class="product-summary"><p>${escape(p.name || p.symbol)} · ${escape(p.mapping || "Issuer security identifier")}<br>Market observation: ${stamp(m?.updatedAt)} · Catalog: ${stamp(p.sourceAt)}</p>${external(p.marketSource || p.source, "Product source")}</div>${termsDetails(p)}<div class="deployments"><h4>Contracts & markets</h4>${p.deployments
          .filter((d) => chain === "all" || d.chain === chain)
          .map(
            (d) =>
              `<div class="deployment"><strong>${escape(chains.find((c) => c.id === d.chain)?.label || d.chain)}</strong>${external(chains.find((c) => c.id === d.chain)?.explorer + d.address, d.address, "contract-address")}<button data-markets-token="${escape(d.address)}" data-chain="${d.chain}">Markets ↗</button><button data-quote-issuer="${escape(p.issuer)}" data-chain="${d.chain}">Get quote ↗</button></div>`,
          )
          .join("")}</div></details>`;
      })
      .join("")
  );
}
export function quoteTable(rows) {
  const best = rows
    .filter((r) => r.rankable && r.expiresAt > Date.now())
    .reduce(
      (best, r) => (!best || r.effectivePrice < best.effectivePrice ? r : best),
      null,
    );
  return (
    `<div class="table-header" aria-hidden="true"><span>Token / issuer</span><span>Chain / venue</span><span>USDC / eq. share</span><span>Your exposure</span><span>Swap gas est.</span><span></span></div>` +
    rows
      .map((r) => {
        const p = provider(r),
          quoted = r.status === "quoted",
          normalized = Number.isFinite(r.equivalentShares);
        return `<details class="quote-row ${best?.id === r.id ? "best" : ""} ${quoted ? "" : "unavailable-row"}" data-expires="${r.expiresAt || ""}"><summary aria-label="${escape(r.symbol)} on ${escape(r.chainLabel)}: ${quoted ? (normalized ? `${number(r.equivalentShares, 4)} equivalent shares, ${number(r.effectivePrice)} USDC per equivalent share, before network costs` : `${number(r.tokenQuantity, 4)} token units; share conversion unavailable`) : "quote unavailable"}"><span class="token-cell">${mark(r)}<span><strong>${escape(r.symbol)}</strong><small>${escape(p.name)}${best?.id === r.id ? '<span class="best-label">Most exposure</span>' : ""}</small></span></span><span class="chain-cell"><span>${escape(r.chainLabel)}</span><small>${escape(r.venue)}</small></span><span class="price-cell"><span class="mobile-label">USDC / equivalent share</span><strong>${quoted ? number(r.effectivePrice) : "Unavailable"}</strong><small>${quoted ? (normalized ? "before network costs" : "ratio not verified") : "expand for details"}</small></span><span class="exposure-cell"><span class="mobile-label">Your exposure</span><strong>${quoted ? number(normalized ? r.equivalentShares : r.tokenQuantity, 4) : "—"}</strong><small>${quoted ? (normalized ? "equivalent shares" : "tokens · not normalized") : "no quote"}</small></span><span class="cost-cell"><span class="mobile-label">Swap gas estimate</span><strong>${quoted ? usd(r.networkFeeUsd) : "—"}</strong><small>paid separately</small></span><span class="expand-icon" aria-hidden="true">⌄</span></summary>${termsDetails(r)}<div class="quote-disclosure"><div><h4>Quoted units</h4><dl><dt>Input</dt><dd>${number(r.inputQuantity)} ${escape(r.inputSymbol || "USDC")}</dd><dt>Token units</dt><dd>${number(r.tokenQuantity, 6)}</dd><dt>Shares / quoted unit</dt><dd>${number(r.sharesPerToken, 8)}</dd><dt>Swap gas estimate (USD)</dt><dd>${Number.isFinite(r.networkFeeUsd) ? usd(r.networkFeeUsd) : "Not supplied"}</dd><dt>Fetched</dt><dd>${stamp(r.fetchedAt)}</dd><dt>Price impact</dt><dd>${r.priceImpactPct == null ? "Not supplied" : number(r.priceImpactPct) + "%"}</dd></dl></div><div><h4>${quoted ? "Sources & costs" : "Quote unavailable"}</h4><p>${escape(r.reason || r.conversionWarning || "Fees and price impact are reflected in output. Gas, funding, bridging, approvals and future exit costs are separate.")}</p>${r.conversionSource ? external(r.conversionSource, "Conversion source") : ""}${r.quoteSource ? external(r.quoteSource, "Raw quote response") : ""}</div></div><div class="contract-line"><span>Contract</span>${external(r.explorerUrl, r.address)}</div><div class="provider-handoff"><p>The venue re-quotes before purchase. Check its access rules.</p>${quoted ? `<a class="provider-link quote-link" href="${escape(r.buyUrl)}" data-expires="${r.expiresAt}" target="_blank" rel="noopener noreferrer">Open ${escape(r.venue)} ↗</a>` : external(r.source, "Product source", "provider-link")}</div></details>`;
      })
      .join("")
  );
}
export function marketsTable(rows) {
  return (
    `<div class="market-head"><span>Pool / venue</span><span>Token / chain</span><span>USD / token</span><span>Pool liquidity</span><span>24h volume</span><span></span></div>` +
    rows
      .map(
        (r) =>
          `<div class="market-row"><span><strong>${escape(r.pair)}</strong><small>${escape(r.dex)}</small></span><span><strong>${escape(r.symbol)}</strong><small>${escape(r.chainLabel)} · ${escape(provider(r).name)}</small></span><span data-label="USD / token">${usd(r.price)}</span><span data-label="Pool liquidity">${compact(r.liquidity)}</span><span data-label="24h volume">${compact(r.volume24h)}</span><span class="market-actions"><button data-history="${escape(r.id)}" aria-label="Chart ${escape(r.pair)} on ${escape(r.chainLabel)}, ${escape(r.dex)}, ${escape(r.poolAddress.slice(0, 8))}">Chart</button>${external(r.source, "View pool")}</span></div>`,
      )
      .join("")
  );
}
export function termsTable(rows) {
  return `<div class="terms-table">${rows
    .map((p) => {
      const info = provider(p);
      return `<article class="terms-row"><div class="token-cell">${mark(p)}<div><h3>${escape(info.name)}</h3><small>${escape(p.symbol)}</small></div></div><div><h4>${escape(info.structure)}</h4><p>${escape(info.rights)}</p>${external(info.source, info.sourceLabel)}</div><div><h4>Dividends</h4><p>${escape(info.dividends)}</p></div><div><h4>Exit & eligibility</h4><p>${escape(info.exit)}</p>${external(info.eligibility, info.eligibilityLabel)}</div></article>`;
    })
    .join("")}</div>`;
}
export function chartMarkup(data) {
  const points = data.points;
  if (points.length < 2)
    return '<p class="empty-results">Not enough historical observations for this pool.</p>';
  const width = 800,
    height = 180,
    pad = 16,
    min = Math.min(...points.map((p) => p.price)),
    max = Math.max(...points.map((p) => p.price)),
    span = max - min || max * 0.01 || 1;
  const first = points[0],
    last = points.at(-1),
    duration = last.time - first.time || 1;
  const path = points
    .map(
      (p) =>
        `${pad + ((p.time - first.time) / duration) * (width - pad * 2)},${height - pad - ((p.price - min) / span) * (height - pad * 2)}`,
    )
    .join(" ");
  return `<div class="chart-values"><strong>${usd(last.price)}</strong><span>Observed range ${usd(min)}–${usd(max)}</span><span>${points.length} hourly observations</span></div><svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(data.pool.symbol)} hourly closing USD price per token unit; ${points.length} observations"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-baseline"/><polyline points="${path}"/>${points.map((p) => `<circle cx="${pad + ((p.time - first.time) / duration) * (width - pad * 2)}" cy="${height - pad - ((p.price - min) / span) * (height - pad * 2)}" r="4"><title>${escape(stamp(p.time))}: ${usd(p.price)}</title></circle>`).join("")}</svg><div class="chart-axis"><span>${stamp(first.time)}</span><span>${stamp(last.time)}</span></div><p class="chart-source">Hourly pool closes · USD per token unit · ${external(data.source, "GeckoTerminal")} · Retrieved ${stamp(data.retrievedAt)}</p>`;
}
export function csvText(rows, columns) {
  const cell = (value) => {
    const text = String(value ?? "");
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  return [
    columns.map((c) => cell(c[0])).join(","),
    ...rows.map((row) => columns.map((c) => cell(c[1](row))).join(",")),
  ].join("\r\n");
}
