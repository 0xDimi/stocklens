import { escape, usd, number, stamp, provider } from "./views.mjs";
import { observationIsStale } from "./asset-comparison-model.mjs";

export function listedDate(reference) {
  if (reference?.priceDate && /^\d{4}-\d{2}-\d{2}$/.test(reference.priceDate))
    return new Date(reference.priceDate + "T12:00:00Z").toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return reference?.at ? stamp(reference.at) : "No listed-price observation";
}
// An explicit null date means the original reference had intraday precision.
export function comparisonReference(reference, metric) {
  return {
    ...reference,
    price: metric.referencePrice ?? reference?.price,
    at: metric.referenceAt ?? reference?.at,
    priceDate: Object.hasOwn(metric, "referenceDate")
      ? metric.referenceDate
      : reference?.priceDate,
  };
}
const signed = (value) =>
  Number.isFinite(value) ? `${value > 0 ? "+" : ""}${number(value)}%` : "—";
const polarity = (value) =>
  value < 0 ? "negative" : value > 0 ? "positive" : "";
const source = (url, label) => {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && !u.username && !u.password)
      return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
  } catch {}
  return escape(label);
};
// Pool snapshots and order-size prices have different meanings. Prefer a
// current pool, then a current buy observation, then an explicitly dated one.
export function selectOnchainPrice(
  { spotPremium, spot, premium, buyObservation } = {},
  now = Date.now(),
) {
  const candidates = [
    [spotPremium, "pool", true],
    [spot?.conversionVerified === true ? spot : null, "pool", false],
    [premium, "buy", true],
    [
      buyObservation?.conversionVerified === true ? buyObservation : null,
      "buy",
      false,
    ],
  ].flatMap(([data, kind, metric]) => {
    const at = data?.priceAt ?? data?.at;
    if (
      !(data?.price > 0) ||
      !Number.isFinite(data.price) ||
      !Number.isFinite(at) ||
      at > now ||
      now - at > 86400000
    )
      return [];
    const expiresAt = data.expiresAt ?? at + 300000;
    const older =
      data.stale === true ||
      data.retained === true ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now;
    return [{ data, kind, metric, at, older }];
  });
  return (
    candidates.sort(
      (a, b) =>
        Number(a.older) - Number(b.older) ||
        Number(a.kind === "buy") - Number(b.kind === "buy") ||
        b.at - a.at ||
        Number(b.metric) - Number(a.metric),
    )[0] || null
  );
}
export function priceComparison({
  market,
  reference,
  spotPremium,
  spot,
  premium,
  buyObservation,
  loading = false,
} = {}) {
  const selected = selectOnchainPrice(
    { spotPremium, spot, premium, buyObservation },
    Date.now(),
  );
  const p = selected?.data;
  const comparable =
    selected?.metric && Number.isFinite(p.value) && p.referencePrice > 0;
  // The listed number must be the exact observation behind the displayed spread.
  const listed = comparable ? comparisonReference(reference, p) : reference;
  const closed = comparable
    ? p.referenceBasis === "last-close"
    : listed?.priceSession === "Closed";
  const kindLabel =
    selected?.kind === "buy" ? "$1,000 buy · before gas" : "Pool snapshot";
  const ageLabel = selected?.older ? "Older observation · " : "";
  const basis = p
    ? `<details class="price-method"><summary>Price basis</summary><small>${ageLabel}${escape(p.basis || (selected.kind === "buy" ? "Size-specific indicative buy price before network costs; not a pool spot price or executable offer." : "One verified pool snapshot normalized to equivalent shares; not a buy quote or all-market average."))} ${escape(p.venue || "")} · ${escape(p.chain || "")} · ${source(p.source, selected.kind === "buy" ? "Quote source" : "Pool source")}${p.conversionSource ? " · " + source(p.conversionSource, "Share conversion") : ""}</small></details>`
    : "";
  const aggregate =
    market?.price > 0
      ? `<small class="aggregate-reference">Tokenized market aggregate ${usd(market.price)}${observationIsStale(market) ? " · older observation" : ""} · ${stamp(market.updatedAt)}</small>`
      : "";
  return `<div class="reference-quote reference-listed"><span class="reference-label">${source(listed?.source, "Listed stock" + (listed?.exchange ? " · " + listed.exchange : ""))}</span><span class="reference-value"><strong>${usd(listed?.price)}</strong><small>${escape(closed ? "Last close" : listed?.marketStatus || "")}</small></span><small>${listed?.price ? escape(listedDate(listed)) + (observationIsStale(listed, Date.now(), { dateOnly: !!listed.priceDate }) ? " · older observation" : "") : loading ? "Loading listed price…" : "Listed price not supplied"}</small></div>
  <div class="reference-quote tokenized-reference"><span class="reference-label">Onchain per share</span><span class="reference-value"><strong>${p ? usd(p.price) : "—"}</strong></span><small>${p ? `<span class="pool-origin">${escape(p.symbol)} · ${escape(provider({ issuer: p.issuer }).name)}</span><span class="price-kind"> · ${kindLabel}</span><span class="pool-time"> · ${ageLabel}${stamp(selected.at)}</span>` : loading ? "Checking comparable onchain price…" : "No verified share price available"}</small></div>
  <div class="reference-quote premium-reference"><span class="reference-label">Onchain premium</span><span class="reference-value"><strong class="${comparable ? polarity(p.value) : ""}">${comparable ? signed(p.value) : "—"}</strong></span><small>${comparable ? `${ageLabel}${closed ? "vs last close" : "vs listed stock"}` : !listed?.price && p ? "Listed price required" : p ? "Prices not time-aligned" : "Requires a verified share price"}</small>${basis}</div>${aggregate}`;
}
