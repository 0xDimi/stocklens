import { quoteFeeView } from "./quote-support.mjs";
import { renderProductTerms } from "./product-terms.mjs";
import { issuerLogo, chainLogo, venueLogo } from "./brands.mjs";
import { issuers } from "./data.mjs";
import { premium as comparablePremium } from "./market-model.mjs";
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
  return renderProductTerms(p);
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
            Date.now() - new Date(m.updatedAt).getTime() > 600000;
        const networks = p.deployments.filter(
          (d) => chain === "all" || d.chain === chain,
        );
        return `<details class="product-row"><summary><span class="token-cell">${mark(p)}<span><strong>${escape(p.symbol)}</strong><small>${escape(info.name)}</small><small class="identity-proof" title="Identity mapping is separate from backing, rights, eligibility and investment quality.">${p.wrapped ? "Wrapped version" : p.source?.startsWith("https://api.xstocks.fi/") || p.source === "https://docs.ondo.finance/addresses#ondo-stocks" || p.source === "https://api.realityfinance.xyz/api/v1/rwa/assets/tickers" ? "Issuer contract" : p.mapping === "CoinGecko RWA grouping" ? "Verified asset grouping" : "Source-mapped identity"}</small></span></span><span data-label="Price per token"><strong>${usd(m?.price)}</strong><small>${m?.priceType === "indicative-buy" ? "$1,000 buy estimate" : m?.priceType === "pool-snapshot" ? "Pool observation" : stale ? "Older observation" : change(m?.change24h)}</small></span><span data-label="24h volume">${compact(m?.volume24h)}</span><span class="structure-cell" data-label="Structure">${escape(info.structure)}</span><span class="deployment-count"><span class="network-badges" title="${escape(networks.map((d) => chains.find((c) => c.id === d.chain)?.label || d.chain).join(", "))}">${networks
          .slice(0, 2)
          .map(
            (d) =>
              `<span>${chainLogo(d.chain)}${escape(chains.find((c) => c.id === d.chain)?.label || d.chain)}</span>`,
          )
          .join(
            "",
          )}${networks.length > 2 ? `<small>+${networks.length - 2} more</small>` : ""}</span><button class="compare-toggle" data-compare="${escape(p.coinId || `${p.issuer}:${p.symbol}`)}" aria-label="Select ${escape(p.symbol)} for terms comparison" aria-pressed="false">Select for terms</button><i aria-hidden="true">⌄</i></span></summary><div class="product-summary"><p>${escape(p.name || p.symbol)} · ${escape(p.mapping || "Issuer security identifier")}<br>Price observed ${stamp(m?.updatedAt)} · Token market cap ${compact(m?.marketCap)}${m?.basis ? "<br>" + escape(m.basis) : ""}</p><div>${external(p.marketSource || p.source, "Product source")}</div></div>${termsDetails(p)}<div class="deployments"><h4>Contracts & markets</h4>${networks.map((d) => `<div class="deployment"><strong class="named-network">${chainLogo(d.chain)}${escape(chains.find((c) => c.id === d.chain)?.label || d.chain)}</strong>${external(chains.find((c) => c.id === d.chain)?.explorer + d.address, d.address, "contract-address")}<button data-markets-token="${escape(d.address)}" data-chain="${d.chain}">View liquidity ↗</button>${chains.find((c) => c.id === d.chain)?.quotable ? `<button data-quote-issuer="${escape(p.issuer)}" data-chain="${d.chain}">Compare quote →</button>` : `<span class="adapter-unavailable">Quotes not connected</span>`}</div>`).join("")}</div></details>`;
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
export function quoteTable(rows, { reference, bestId } = {}) {
  const now = Date.now(),
    best =
      bestId === undefined
        ? bestQuote(rows, now)
        : rows.find((row) => row.id === bestId);
  return (
    `<div class="table-header" aria-hidden="true"><span>Token / issuer</span><span>Network / quote source</span><span>USDC per equivalent share</span><span>You receive</span><span>Gas estimate</span><span></span></div>` +
    rows
      .map((r) => {
        const quoted = r.status === "quoted",
          expired = !(r.expiresAt > now),
          premium =
            quoted &&
            !expired &&
            r.rankable &&
            !reference?.stale &&
            !reference?.priceStale
              ? comparablePremium(
                  {
                    price: r.effectivePrice,
                    // effectivePrice is already per equivalent share.
                    sharesPerToken: 1,
                    conversionVerified:
                      r.conversionVerified !== false &&
                      Number.isFinite(r.equivalentShares) &&
                      r.equivalentShares > 0,
                    currency: "USD",
                    at: r.fetchedAt,
                  },
                  reference,
                  now,
                )
              : null,
          adverse = premium > 5 || r.priceImpactPct > 5,
          normalized = Number.isFinite(r.equivalentShares),
          quoteProvider = r.quoteProvider || r.venue || "Quote provider",
          fees = quoteFeeView(r),
          venues = [...new Set(r.liquidityVenues || [])],
          venueLabels = venues.map((name) =>
            name
              .replace(/pancakeswapv3|pancake-v3/gi, "PancakeSwap V3")
              .replace(/uniswapv3|uniswap-v3/gi, "Uniswap V3")
              .replace(/^Whirlpool$/, "Orca Whirlpool"),
          ),
          rawPrice =
            r.tokenQuantity > 0 && r.inputQuantity > 0
              ? r.inputQuantity / r.tokenQuantity
              : null,
          description = quoted
            ? normalized
              ? `${number(r.equivalentShares, 4)} equivalent shares, ${number(r.effectivePrice)} USDC per equivalent share, before network costs`
              : `${number(r.tokenQuantity, 4)} token units; share conversion unavailable`
            : "quote unavailable";
        return `<details class="quote-row ${best && best.id === r.id ? "best" : ""} ${quoted ? "" : "unavailable-row"} ${expired ? "stale" : ""} ${adverse ? "adverse-quote" : ""}" data-expires="${r.expiresAt || ""}" data-quote-provider="${escape(quoteProvider)}">
      <summary aria-label="${escape(r.symbol)} on ${escape(r.chainLabel)}: ${description}">
        <span class="token-cell">${mark(r)}<span><strong>${escape(r.symbol)}</strong><small>${escape(provider(r).name)}${best && best.id === r.id ? '<span class="best-label">Most exposure</span>' : ""}${adverse ? '<span class="quote-caution">Large price difference</span>' : ""}</small></span></span>
        <span class="chain-cell"><span class="named-network">${chainLogo(r.chain, r.chainLabel)}${escape(r.chainLabel)}</span><small class="named-venue">${venueLogo(quoteProvider)}Quote via ${escape(quoteProvider)}</small>${venues.length ? `<small class="liquidity-venues" title="The exchanges or liquidity sources reported by this quote provider.">Liquidity: ${escape(venueLabels.join(", "))}</small>` : ""}</span>
        <span class="price-cell"><span class="mobile-label">${normalized ? "USDC / equivalent share" : "USDC / token"}</span><strong>${quoted ? number(normalized ? r.effectivePrice : rawPrice) : "Unavailable"}</strong><small>${quoted ? (normalized ? "before network costs" : "Token quote · conversion unverified") : "expand for details"}</small>${Number.isFinite(premium) ? `<small class="quote-premium ${premium < 0 ? "negative" : ""}">${premium > 0 ? "+" : ""}${number(premium)}% vs listed ${reference.priceSession === "Closed" ? "last close" : "reference"}</small>` : ""}</span>
        <span class="exposure-cell"><span class="mobile-label">You receive</span><strong>${quoted ? number(normalized ? r.equivalentShares : r.tokenQuantity, 4) : "—"}</strong><small>${quoted ? (normalized ? "equivalent shares" : "tokens · unranked") : "no quote"}</small></span>
        <span class="cost-cell"><span class="mobile-label">Swap gas estimate</span><strong>${quoted ? escape(fees.label) : "—"}</strong><small>${fees.providerFee ? escape(fees.providerFee) : "review before purchase"}</small></span><span class="expand-icon" aria-hidden="true">⌄</span>
      </summary>
      <div class="quote-disclosure"><div><h4>Quote details</h4><dl><dt>Input</dt><dd>${number(r.inputQuantity)} ${escape(r.inputSymbol || "USDC")}</dd><dt>Token units</dt><dd>${number(r.tokenQuantity, 6)}</dd><dt>Shares / quoted unit</dt><dd>${number(r.sharesPerToken, 8)}</dd><dt>Swap gas estimate (USD)</dt><dd>${escape(fees.label)}<small>${escape(fees.detail)}</small></dd>${fees.providerFee ? `<dt>Provider fee</dt><dd>${escape(fees.providerFee)}</dd>` : ""}<dt>Fetched</dt><dd>${stamp(r.fetchedAt)}</dd><dt>Quote expires</dt><dd>${stamp(r.expiresAt)}</dd>${Number.isFinite(premium) ? `<dt>Listed comparison</dt><dd>${usd(reference.price)} · ${escape(reference.priceDate || stamp(reference.at))}. USDC treated as USD for this comparison; before network costs.</dd>` : ""}<dt>Price impact</dt><dd>${r.priceImpactPct == null ? "Not supplied" : number(r.priceImpactPct) + "%"}</dd></dl></div><div><h4>${quoted ? "Routing & costs" : "Quote unavailable"}</h4><p>${escape(r.reason || r.conversionWarning || "Fees and price impact are reflected in output. Gas, funding, bridging, approvals and future exit costs are separate.")}</p><p>Quote provider: ${escape(quoteProvider)}.${venues.length ? ` Liquidity: ${escape(venues.join(", "))}.` : " Liquidity venues were not supplied."}</p>${r.quoteFailures?.length ? `<p class="quote-provider-coverage">Other checked providers: ${r.quoteFailures.map((f) => `${escape(f.provider)} — ${escape(f.reason)}`).join("; ")}</p>` : ""}${r.conversionSource ? external(r.conversionSource, "Conversion source") : ""}${r.quoteSource ? external(r.quoteSource, r.quoteSourceLabel || "Quote response") : ""}<button class="text-button" data-action="terms">Read product terms →</button></div></div>
      <div class="contract-line"><span>Contract</span>${external(r.explorerUrl, r.address)}</div><div class="provider-handoff"><p>Enter ${number(r.inputQuantity)} ${escape(r.inputSymbol || "USDC")} at the venue and review its refreshed quote, eligibility and final costs.</p>${quoted && !expired ? `<a class="provider-link quote-link" href="${escape(r.buyUrl)}" data-expires="${r.expiresAt}" target="_blank" rel="noopener noreferrer">Open ${escape(quoteProvider)} ↗</a>` : quoted ? `<span class="provider-link quote-link" data-expires="${r.expiresAt}" aria-disabled="true">Refresh quote to continue</span>` : external(r.source, "Product source", "provider-link")}</div></details>`;
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
  return `<div class="terms-table">${rows.map((p) => `<article class="terms-row"><div class="token-cell">${mark(p)}<div><h3>${escape(provider(p).name)}</h3><small>${escape(p.symbol)}</small></div></div>${renderProductTerms(p)}</article>`).join("")}</div>`;
}
export function csvText(rows, columns) {
  const cell = (value) => {
    const text = String(value ?? "");
    return (
      '"' +
      (!Number.isFinite(value) && /^[=+@\-\t\r]/.test(text) ? "'" : "") +
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
    ["Network fee estimate USD", (r) => r.networkFeeUsd],
    ["Provider fee bps (included)", (r) => r.providerFeeBps],
    ["Conversion source", (r) => r.conversionSource],
    ["Availability", (r) => r.availability],
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
