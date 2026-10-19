// Financial units are explicit. Integer amounts remain strings until display math.
export function toBaseUnits(value, decimals) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 30 ||
    !/^\d+(\.\d+)?$/.test(String(value))
  )
    throw new Error("Invalid decimal amount.");
  const [whole, fraction = ""] = String(value).split(".");
  if (fraction.length > decimals)
    throw new Error("Amount has too many decimal places.");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}
export function fromBaseUnits(value, decimals) {
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 30
  )
    throw new Error("Invalid token amount.");
  const digits = String(value).padStart(decimals + 1, "0");
  const result = Number(
    decimals
      ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`
      : digits,
  );
  if (!Number.isFinite(result))
    throw new Error("Token amount is outside supported bounds.");
  return result;
}
export function validBudget(value) {
  return (
    typeof value === "string" &&
    /^\d+(\.\d{1,2})?$/.test(value) &&
    Number(value) >= 10 &&
    Number(value) <= 1_000_000
  );
}
export function activeMultiplier(data, now = Date.now()) {
  const current = Number(data.currentMultiplier ?? data.multiplier);
  const pending = Number(data.newMultiplier);
  let activation = Number(
    data.activationDateTime ?? data.newMultiplierEffectiveTimestamp,
  );
  if (activation > 1e12) activation /= 1000;
  if (!Number.isFinite(current) || current <= 0)
    throw new Error("Verified shares-per-token ratio is unavailable.");
  return Number.isFinite(pending) &&
    pending > 0 &&
    activation > 0 &&
    now >= activation * 1000
    ? pending
    : current;
}
export function normalizeQuote(raw) {
  const inputQuantity = fromBaseUnits(raw.inputAmount, raw.inputDecimals);
  const tokenQuantity = fromBaseUnits(raw.outputAmount, raw.outputDecimals);
  if (inputQuantity <= 0 || tokenQuantity <= 0)
    throw new Error("Quote returned no output.");
  const ratio = Number(raw.sharesPerToken);
  const equivalentShares =
    raw.sharesPerToken != null && Number.isFinite(ratio) && ratio > 0
      ? tokenQuantity * ratio
      : null;
  const effectivePrice = equivalentShares
    ? inputQuantity / equivalentShares
    : null;
  const gas = raw.networkFeeUsd == null ? null : Number(raw.networkFeeUsd);
  return {
    inputQuantity,
    tokenQuantity,
    equivalentShares,
    effectivePrice,
    networkFeeUsd: gas != null && Number.isFinite(gas) && gas >= 0 ? gas : null,
    fetchedAt: raw.fetchedAt,
    expiresAt: raw.fetchedAt + 30_000,
  };
}
export function rankQuotes(rows, now = Date.now()) {
  return rows
    .map((row) => ({
      ...row,
      rankable:
        row.status === "quoted" &&
        Number.isFinite(row.effectivePrice) &&
        row.effectivePrice > 0 &&
        row.expiresAt > now,
    }))
    .sort(
      (a, b) =>
        Number(b.rankable) - Number(a.rankable) ||
        (a.rankable
          ? a.effectivePrice - b.effectivePrice
          : Number(b.status === "quoted") - Number(a.status === "quoted")) ||
        a.id.localeCompare(b.id),
    );
}
export function findStocks(stocks, query) {
  const q = query.trim().toLowerCase();
  return stocks.filter((stock) =>
    `${stock.ticker} ${stock.name} ${stock.id || ""} ${(stock.products || []).map((p) => p.symbol).join(" ")}`
      .toLowerCase()
      .includes(q),
  );
}

export function assetById(stocks, id) {
  const exact = stocks.find((stock) => stock.id === id);
  if (exact) return exact;
  const rwa = typeof id === "string" && id.startsWith("cg:") ? id.slice(3) : id;
  const matches = stocks.filter((stock) => stock.rwaId === rwa);
  return matches.length === 1 ? matches[0] : null;
}
