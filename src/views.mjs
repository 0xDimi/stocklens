import { issuerLogo, chainLogo, venueLogo } from "./brands.mjs";
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
const mark = (p) => issuerLogo(p);
export function termsDetails(p) {
  const info = provider(p);
  return `<div class="product-details"><div class="details-column"><h4>Structure & rights</h4><strong>${escape(info.structure)}</strong><p>${escape(info.rights)}</p>${external(info.source, info.sourceLabel)}<small class="review-note">${info.reviewStatus === "partial" ? "Partial public disclosure" : info.reviewStatus === "unreviewed" || !info.reviewedAt ? "Review pending" : "Source review"}${info.reviewedAt ? " · " + escape(info.reviewedAt) : ""}</small></div><div class="details-column"><h4>Dividends & corporate actions</h4><p>${escape(info.dividends)}</p>${info.dividendSource ? external(info.dividendSource, "Dividend source") : ""}</div><div class="details-column"><h4>Exit & eligibility</h4><p>${escape(info.exit)}</p>${external(info.eligibility, info.eligibilityLabel)}</div></div>`;
}
export function productsTable(rows, chains, chain) {
  return (
    `<div class="product-table-head"><span>Token / issuer</span><span>Price per token</span><span>24h volume</span><span>Structure</span><span>Networks / compare</span></div>` +
    rows
      .map((p) => {
        const m = p.market,
          info = provider(p),
          stale =
            m?.updatedAt &&
            Date.now() - new Date(m.updatedAt).getTime() > 300000;
        const networks = p.deployments.filter(
          (d) => chain === "all" || d.chain === chain,
        );
        return `<details class="product-row"><summary><span class="token-cell">${mark(p)}<span><strong>${escape(p.symbol)}</strong><small>${escape(info.name)}</small><small class="identity-proof" title="Identity mapping is separate from backing, rights, eligibility and investment quality.">${p.wrapped ? "Wrapped version" : p.source?.startsWith("https://api.xstocks.fi/") || p.source === "https://docs.ondo.finance/addresses#ondo-stocks" ? "Issuer contract" : p.mapping === "CoinGecko RWA grouping" ? "Verified asset grouping" : "Source-mapped identity"}</small></span></span><span data-label="Price per token"><strong>${usd(m?.price)}</strong><small>${m?.priceType === "indicative-buy" ? "$1,000 buy estimate" : stale ? "Older observation" : change(m?.change24h)}</small></span><span data-label="24h volume">${compact(m?.volume24h)}</span><span class="structure-cell" data-label="Structure">${escape(info.structure)}</span><span class="deployment-count"><span class="network-badges" title="${escape(networks.map((d) => chains.find((c) => c.id === d.chain)?.label || d.chain).join(", "))}">${networks
          .slice(0, 2)
          .map(
            (d) =>
              `<span>${chainLogo(d.chain)}${escape(chains.find((c) => c.id === d.chain)?.label || d.chain)}</span>`,
          )
          .join(
            "",
          )}${networks.length > 2 ? `<small>+${networks.length - 2} more</small>` : ""}</span><button class="compare-toggle" data-compare="${escape(p.coinId || `${p.issuer}:${p.symbol}`)}" aria-label="Compare ${escape(p.symbol)}" aria-pressed="false">Compare</button><i aria-hidden="true">⌄</i></span></summary><div class="product-summary"><p>${escape(p.name || p.symbol)} · ${escape(p.mapping || "Issuer security identifier")}<br>Price observed ${stamp(m?.updatedAt)} · Token market cap ${compact(m?.marketCap)}${m?.basis ? "<br>" + escape(m.basis) : ""}</p><div>${external(p.marketSource || p.source, "Product source")}</div></div>${termsDetails(p)}<div class="deployments"><h4>Contracts & markets</h4>${networks.map((d) => `<div class="deployment"><strong class="named-network">${chainLogo(d.chain)}${escape(chains.find((c) => c.id === d.chain)?.label || d.chain)}</strong>${external(chains.find((c) => c.id === d.chain)?.explorer + d.address, d.address, "contract-address")}<button data-markets-token="${escape(d.address)}" data-chain="${d.chain}">View liquidity ↗</button>${chains.find((c) => c.id === d.chain)?.quotable ? `<button data-quote-issuer="${escape(p.issuer)}" data-chain="${d.chain}">Compare quote →</button>` : `<span class="adapter-unavailable">Quotes not connected</span>`}</div>`).join("")}</div></details>`;
      })
      .join("")
  );
}
export function bestQuote(rows, now = Date.now()) {
  return rows
    .filter(
      (r) =>
        r.status === "quoted" &&
        r.rankable &&
        Number.isFinite(r.effectivePrice) &&
        Number.isFinite(r.equivalentShares) &&
        r.expiresAt > now,
    )
    .reduce(
      (best, r) => (!best || r.effectivePrice < best.effectivePrice ? r : best),
      null,
    );
}
export function purchaseSummary(rows) {
  const best = bestQuote(rows);
  if (!best)
    return `<div class="purchase-empty"><strong>No fresh share-normalized quote available.</strong><span>Refresh quotes. Routes with unverified share conversions stay unranked.</span></div>`;
  return `<div class="purchase-summary"><div class="purchase-choice"><span>Best quoted share exposure</span><strong>${escape(best.symbol)} <small>by ${escape(provider(best).name)}</small></strong><p>${escape(best.chainLabel)} · ${escape(best.venue || "")}</p></div><div><span>You receive</span><strong>${number(best.equivalentShares, 4)}</strong><small>equivalent shares for ${number(best.inputQuantity)} USDC</small></div><div><span>Cost per equivalent share</span><strong>${number(best.effectivePrice)} <small>USDC</small></strong><small>before network costs</small></div></div>`;
}
export function quoteTable(rows) {
  const best = bestQuote(rows);
  return (
    `<div class="table-header" aria-hidden="true"><span>Token / issuer</span><span>Chain / venue</span><span>USDC per equivalent share</span><span>Share exposure</span><span>Gas estimate</span><span></span></div>` +
    rows
      .map((r) => {
        const p = provider(r),
          quoted = r.status === "quoted",
          normalized = Number.isFinite(r.equivalentShares);
        return `<details class="quote-row ${best?.id === r.id ? "best" : ""} ${quoted ? "" : "unavailable-row"}" data-expires="${r.expiresAt || ""}"><summary aria-label="${escape(r.symbol)} on ${escape(r.chainLabel)}: ${quoted ? (normalized ? `${number(r.equivalentShares, 4)} equivalent shares, ${number(r.effectivePrice)} USDC per equivalent share, before network costs` : `${number(r.tokenQuantity, 4)} token units; share conversion unavailable`) : "quote unavailable"}"><span class="token-cell">${mark(r)}<span><strong>${escape(r.symbol)}</strong><small>${escape(p.name)}${best?.id === r.id ? '<span class="best-label">Most exposure</span>' : ""}</small></span></span><span class="chain-cell"><span class="named-network">${chainLogo(r.chain, r.chainLabel)}${escape(r.chainLabel)}</span><small class="named-venue">${venueLogo(r.venue)}${escape(r.venue)}</small></span><span class="price-cell"><span class="mobile-label">USDC / equivalent share</span><strong>${quoted ? number(r.effectivePrice) : "Unavailable"}</strong><small>${quoted ? (normalized ? "before network costs" : "ratio not verified") : "expand for details"}</small></span><span class="exposure-cell"><span class="mobile-label">Your exposure</span><strong>${quoted ? number(normalized ? r.equivalentShares : r.tokenQuantity, 4) : "—"}</strong><small>${quoted ? (normalized ? "equivalent shares" : "tokens · not normalized") : "no quote"}</small></span><span class="cost-cell"><span class="mobile-label">Swap gas estimate</span><strong>${quoted ? usd(r.networkFeeUsd) : "—"}</strong><small>paid separately</small></span><span class="expand-icon" aria-hidden="true">⌄</span></summary>${termsDetails(r)}<div class="quote-disclosure"><div><h4>Quoted units</h4><dl><dt>Input</dt><dd>${number(r.inputQuantity)} ${escape(r.inputSymbol || "USDC")}</dd><dt>Token units</dt><dd>${number(r.tokenQuantity, 6)}</dd><dt>Shares / quoted unit</dt><dd>${number(r.sharesPerToken, 8)}</dd><dt>Swap gas estimate (USD)</dt><dd>${Number.isFinite(r.networkFeeUsd) ? usd(r.networkFeeUsd) : "Not supplied"}</dd><dt>Fetched</dt><dd>${stamp(r.fetchedAt)}</dd><dt>Price impact</dt><dd>${r.priceImpactPct == null ? "Not supplied" : number(r.priceImpactPct) + "%"}</dd></dl></div><div><h4>${quoted ? "Sources & costs" : "Quote unavailable"}</h4><p>${escape(r.reason || r.conversionWarning || "Fees and price impact are reflected in output. Gas, funding, bridging, approvals and future exit costs are separate.")}</p>${r.conversionSource ? external(r.conversionSource, "Conversion source") : ""}${r.quoteSource ? external(r.quoteSource, "Raw quote response") : ""}</div></div><div class="contract-line"><span>Contract</span>${external(r.explorerUrl, r.address)}</div><div class="provider-handoff"><p>The venue re-quotes before purchase. Check its access rules.</p>${quoted ? `<a class="provider-link quote-link" href="${escape(r.buyUrl)}" data-expires="${r.expiresAt}" target="_blank" rel="noopener noreferrer">Open ${escape(r.venue)} ↗</a>` : external(r.source, "Product source", "provider-link")}</div></details>`;
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
          `<div class="market-row"><span><strong>${escape(r.pair)}</strong><small class="named-venue">${venueLogo(r.dex)}${escape(r.dex)}</small></span><span><strong>${escape(r.symbol)}</strong><small class="named-network">${chainLogo(r.chain, r.chainLabel)}${escape(r.chainLabel)} · ${escape(provider(r).name)}</small></span><span data-label="USD / token">${usd(r.price)}</span><span data-label="Pool liquidity">${compact(r.liquidity)}</span><span data-label="24h volume">${compact(r.volume24h)}</span><span class="market-actions"><button data-history="${escape(r.id)}" aria-label="Chart ${escape(r.pair)} on ${escape(r.chainLabel)}, ${escape(r.dex)}, ${escape(r.poolAddress.slice(0, 8))}">Chart</button>${external(r.source, "View pool")}</span></div>`,
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

export function venuesTable(rows) {
  return (
    '<div class="venue-head"><span>Exchange / pair</span><span>USD / token</span><span>24h volume</span><span>Spread</span><span>±2% depth ↑ / ↓</span><span>Market</span></div>' +
    rows
      .map(
        (r) =>
          `<div class="venue-row"><span class="token-cell">${venueLogo(r.exchange)}<span><strong>${escape(r.exchange)}</strong><small>${escape(r.pair)}</small></span></span><span>${usd(r.priceUsd)}<small>${r.isStale ? "Older / stale · " : ""}${r.isAnomaly ? "Anomaly · " : ""}${stamp(r.sourceAt)}</small></span><span>${compact(r.volumeUsd)}</span><span>${Number.isFinite(r.spreadPct) ? number(r.spreadPct) + "%" : "—"}</span><span>${compact(r.depthUpUsd)} / ${compact(r.depthDownUsd)}</span><span>${external(r.url, r.urlKind === "exchange-market" ? "Exchange" : "Source markets")}</span></div>`,
      )
      .join("")
  );
}

export function exportColumns(view, selected) {
  const common = [
    ["Underlying", () => selected.ticker],
    ["Security ID", () => selected.id],
  ];
  if (view === "venues")
    return [
      ...common,
      ["Token ID", (r) => r.coinId],
      ["Exchange", (r) => r.exchange],
      ["Pair", (r) => r.pair],
      ["USD per token", (r) => r.priceUsd],
      ["24h volume USD", (r) => r.volumeUsd],
      ["Spread percent", (r) => r.spreadPct],
      ["Reported +2% depth USD", (r) => r.depthUpUsd],
      ["Reported -2% depth USD", (r) => r.depthDownUsd],
      ["Stale", (r) => r.isStale],
      ["Anomaly", (r) => r.isAnomaly],
      ["Source timestamp", (r) => r.sourceAt],
      ["Market URL", (r) => r.url],
      ["Status", () => "CoinGecko venue observation; not an executable quote"],
    ];
  return [
    ...common,
    ["Issuer", (r) => provider(r).name],
    ["Token", (r) => r.symbol],
    ["Chain", (r) => r.chain || r.deployments?.map((d) => d.chain).join("; ")],
    ["USD per token", (r) => r.market?.price ?? r.price],
    ["24h volume USD", (r) => r.market?.volume24h ?? r.volume24h],
    ["Pool liquidity USD", (r) => r.liquidity],
    ["Order USDC", (r) => r.inputQuantity],
    [
      "Quote expires at",
      (r) => (r.expiresAt ? new Date(r.expiresAt).toISOString() : null),
    ],
    ["Equivalent shares", (r) => r.equivalentShares],
    ["USDC per equivalent share", (r) => r.effectivePrice],
    [
      "Status",
      (r) =>
        (r.status === "quoted" && r.expiresAt <= Date.now()
          ? "Expired quote"
          : r.status) ||
        (view === "terms"
          ? "Terms summary"
          : r.market || view === "markets"
            ? "Market observation"
            : "No market observation"),
    ],
    ["Structure", (r) => provider(r).structure],
    ["Holder rights", (r) => provider(r).rights],
    ["Dividend treatment", (r) => provider(r).dividends],
    ["Exit conditions", (r) => provider(r).exit],
    ["Terms source", (r) => provider(r).source],
    [
      "Source timestamp",
      (r) =>
        r.market?.updatedAt ||
        r.retrievedAt ||
        (r.fetchedAt ? new Date(r.fetchedAt).toISOString() : r.sourceAt),
    ],
    ["Source", (r) => r.market?.source || r.quoteSource || r.source],
  ];
}
