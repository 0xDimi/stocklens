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
export function priceComparison({
  market,
  reference,
  spotPremium: p,
  loading = false,
} = {}) {
  const fresh =
    p &&
    p.stale !== true &&
    p.expiresAt > Date.now() &&
    p.price > 0 &&
    p.referencePrice > 0;
  // Show precisely the two observations used by the premium calculation.
  const listed = fresh
    ? {
        ...reference,
        price: p.referencePrice,
        at: p.referenceAt || reference?.at,
        priceDate: Object.hasOwn(p, "referenceDate")
          ? p.referenceDate
          : reference?.priceDate,
      }
    : reference;
  const closed = fresh
    ? p.referenceBasis === "last-close"
    : listed?.priceSession === "Closed";
  const aggregate =
    market?.price > 0
      ? `<small class="aggregate-reference">Tokenized market aggregate ${usd(market.price)}${observationIsStale(market) ? " · older observation" : ""} · ${stamp(market.updatedAt)}</small>`
      : "";
  return `<div class="reference-quote reference-listed"><span class="reference-label">${source(listed?.source, "Listed stock" + (listed?.exchange ? " · " + listed.exchange : ""))}</span><span class="reference-value"><strong>${usd(listed?.price)}</strong><small>${escape(closed ? "Last close" : listed?.marketStatus || "")}</small></span><small>${listed?.price ? escape(listedDate(listed)) + (observationIsStale(listed, Date.now(), { dateOnly: !!listed.priceDate }) ? " · older observation" : "") : loading ? "Loading listed price…" : "Listed price not supplied"}</small></div>
  <div class="reference-quote tokenized-reference"><span class="reference-label">Onchain per share</span><span class="reference-value"><strong>${fresh ? usd(p.price) : "—"}</strong></span><small>${fresh ? `<span class="pool-origin">${escape(p.symbol)} · ${escape(provider({ issuer: p.issuer }).name)}</span><span class="pool-location"> · ${escape(p.venue || p.chain || "Verified pool")}</span><span class="pool-time"> · ${stamp(p.priceAt)}</span>` : loading ? "Checking comparable pool price…" : "No current share-normalized pool price"}</small></div>
  <div class="reference-quote premium-reference"><span class="reference-label">Onchain premium</span><span class="reference-value"><strong class="${fresh ? polarity(p.value) : ""}">${fresh ? signed(p.value) : "—"}</strong></span><small>${fresh ? (closed ? "vs last close" : "vs listed stock") : "Requires two comparable prices"}</small>${fresh ? `<details class="price-method"><summary>Price basis</summary><small>${escape(p.basis || "One verified pool snapshot normalized to equivalent shares; not a buy quote or all-market average.")} ${escape(p.venue || "")} · ${escape(p.chain || "")} · ${source(p.source, "Pool source")}${p.conversionSource ? " · " + source(p.conversionSource, "Share conversion") : ""}</small></details>` : ""}</div>${aggregate}`;
}
