import { escape, usd, number, stamp } from "./views.mjs";

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
  spotPremium,
  loading = false,
} = {}) {
  const closed = reference?.priceSession === "Closed";
  const fresh =
    spotPremium &&
    spotPremium.stale !== true &&
    Number.isFinite(spotPremium.expiresAt) &&
    spotPremium.expiresAt > Date.now();
  return `<div class="reference-quote reference-listed"><span class="reference-label">${source(reference?.source, "Listed stock" + (reference?.exchange ? " · " + reference.exchange : ""))}</span><span class="reference-value"><strong>${usd(reference?.price)}</strong><small>${escape(closed ? "Last close" : reference?.marketStatus || "")}</small></span><small>${reference?.price ? escape(listedDate(reference)) + (reference.priceStale ? " · older observation" : "") : loading ? "Loading listed price…" : "Listed price not supplied"}</small></div>
  <div class="reference-quote tokenized-reference"><span class="reference-label" title="CoinGecko aggregate for tokenized versions. It is not an executable buy quote.">Tokenized market</span><span class="reference-value"><strong>${usd(market?.price)}</strong><span class="${polarity(market?.change24h)}">${signed(market?.change24h)}</span></span><small>${market?.updatedAt ? stamp(market.updatedAt) : "Tokenized price not observed"}</small></div>
  <div class="reference-quote premium-reference"><span class="reference-label">Onchain premium</span><span class="reference-value"><strong class="${fresh ? polarity(spotPremium.value) : ""}">${fresh ? signed(spotPremium.value) : "—"}</strong></span><small>${fresh ? (spotPremium.referenceBasis === "last-close" ? "vs last close · representative pool" : "Representative pool vs listed stock") : loading ? "Checking comparable prices…" : "No current comparable pool price"}</small>${fresh ? `<details class="price-method"><summary>Price basis</summary><small>${escape(spotPremium.basis || "A share-normalized snapshot from one verified pool; not a buy quote or all-market average.")} ${spotPremium.source ? source(spotPremium.source, "Pool source") : ""}</small></details>` : ""}</div>`;
}
