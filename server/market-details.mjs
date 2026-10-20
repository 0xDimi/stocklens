import { loadCatalog } from "./catalog.mjs";
import { getFundamentals } from "./fundamentals.mjs";
import { getQuote, conversionIssuer } from "./providers.mjs";
import { memo, mapLimit, observeWithin } from "./http.mjs";
import { premium } from "../src/market-model.mjs";
import { getSpotObservations } from "./public-spot.mjs";

const BASIS =
  "$1,000 USDC indicative buy premium before gas; USDC assumed $1. A representative verified version, not the best price across all versions. Observed quote, not a market-wide spot price or executable offer.";
function candidates(stock) {
  const order = ["Solana", "BinanceSmartChain", "Ethereum"];
  return stock.products
    .filter((p) => !p.wrapped && !p.halted && conversionIssuer(p))
    .flatMap((product) =>
      product.deployments
        .filter((d) => order.includes(d.chain))
        .map((deployment) => ({ product, deployment })),
    )
    .sort(
      (a, b) =>
        Number(a.product.issuer !== "xstocks") -
          Number(b.product.issuer !== "xstocks") ||
        order.indexOf(a.deployment.chain) - order.indexOf(b.deployment.chain),
    );
}
async function observe(stock, quote, deadlineAt) {
  for (const { product, deployment } of candidates(stock).slice(0, 3)) {
    if (Date.now() >= deadlineAt) break;
    const result = await quote(product, deployment, "1000", { deadlineAt });
    if (
      result.status === "quoted" &&
      result.equivalentShares > 0 &&
      result.effectivePrice > 0
    )
      return result;
  }
  return null;
}
export async function marketDetailsView(
  params,
  {
    getCatalog = loadCatalog,
    getReference = getFundamentals,
    quote = getQuote,
    getSpots = getSpotObservations,
  } = {},
) {
  const ids = [...new Set((params.get("ids") || "").split(","))];
  if (
    !ids.length ||
    ids.length > 25 ||
    ids.some((id) => !/^[A-Za-z0-9.:\-]{1,100}$/.test(id))
  )
    throw Object.assign(new Error("Choose 1–25 exact catalog asset IDs."), {
      status: 400,
    });
  const catalog = await getCatalog();
  const stocks = ids.map((id) => catalog.stocks.find((s) => s.id === id));
  if (stocks.some((s) => !s))
    throw Object.assign(new Error("Choose exact catalog assets."), {
      status: 400,
    });
  const deadline = Date.now() + 26000;
  const spots = observeWithin(() => getSpots(stocks), 10000).catch(
    () => new Map(),
  );
  const rows = await mapLimit(stocks, 5, async (stock) => {
    const remaining = () => Math.max(1, deadline - Date.now());
    const quoteDeadline = Math.min(deadline, Date.now() + 10000) - 50;
    const [reference, observation, spotRows] = await Promise.all([
      observeWithin(
        () => getReference(stock),
        Math.min(18000, remaining()),
      ).catch(() => null),
      observeWithin(
        () =>
          quote === getQuote
            ? memo("market-premium:" + stock.id, 120000, () =>
                observe(stock, quote, quoteDeadline),
              )
            : observe(stock, quote, quoteDeadline),
        Math.min(10000, remaining()),
      ).catch(() => null),
      spots,
    ]);
    const spot = spotRows?.get(stock.id) || null;
    const spotValue = !(reference?.priceStale ?? reference?.stale)
      ? premium({ ...spot, sharesPerToken: 1 }, reference)
      : null;
    const closedSpot = reference?.priceSession === "Closed";
    const spotMetric =
      spotValue == null
        ? null
        : {
            value: spotValue,
            deltaUsd: spot.price - reference.price,
            price: spot.price,
            referencePrice: reference.price,
            rawPrice: spot.rawPrice,
            symbol: spot.symbol,
            issuer: spot.issuer,
            chain: spot.chain,
            address: spot.address,
            venue: spot.venue,
            liquidity: spot.liquidity,
            priceAt: spot.at,
            priceTimeBasis: spot.priceTimeBasis,
            referenceAt: reference.at,
            referenceDate: reference.priceDate || null,
            retrievedAt: spot.retrievedAt,
            source: spot.source,
            referenceSource: reference.priceSource,
            conversionSource: spot.conversionSource,
            sharesPerToken: spot.sharesPerToken,
            method: spot.method,
            referenceBasis: closedSpot ? "last-close" : "contemporaneous",
            basis:
              spot.basis +
              (closedSpot
                ? " Compared with the dated listed-stock last close, not a live listed price."
                : " Compared with the listed-stock observation."),
            expiresAt:
              Math.min(
                spot.at,
                closedSpot ? Date.parse(reference.retrievedAt) : reference.at,
              ) + 300000,
          };
    const value = !(reference?.priceStale ?? reference?.stale)
      ? premium(
          {
            price: observation?.effectivePrice,
            sharesPerToken: 1,
            conversionVerified: !!observation?.equivalentShares,
            currency: "USD",
            at: observation?.fetchedAt,
          },
          reference,
        )
      : null;
    const lastClose = reference?.priceSession === "Closed";
    const referenceTime = lastClose
      ? Date.parse(reference.retrievedAt)
      : reference?.at;
    const metric =
      value == null
        ? null
        : {
            value,
            symbol: observation.symbol,
            issuer: observation.issuer,
            chain: observation.chain,
            venue: observation.venue,
            budget: 1000,
            price: observation.effectivePrice,
            priceImpactPct: Number.isFinite(observation.priceImpactPct)
              ? observation.priceImpactPct
              : null,
            sharesPerToken: observation.sharesPerToken,
            priceAt: observation.fetchedAt,
            referenceAt: reference.at,
            retrievedAt: new Date(observation.fetchedAt).toISOString(),
            source: observation.quoteSource,
            conversionSource: observation.conversionSource,
            referenceBasis: lastClose ? "last-close" : "contemporaneous",
            basis:
              BASIS +
              (lastClose
                ? " Compared with the official Nasdaq last close, not a live listed-stock price."
                : ""),
            expiresAt: Math.min(observation.fetchedAt, referenceTime) + 300000,
          };
    return {
      id: stock.id,
      reference,
      premium: metric,
      spot,
      spotPremium: spotMetric,
      spotPremiumReason: spotMetric
        ? null
        : !spot
          ? "No fresh exact-contract pool snapshot with verified underlying-equivalent units is available."
          : !reference?.price
            ? "Listed-stock price unavailable."
            : "Pool snapshot and listed-stock price are not fresh and time-aligned; no current spot premium is asserted.",
      referenceReason: reference
        ? reference.price == null
          ? reference.priceReason
          : null
        : "No corroborated listed-security reference is currently available.",
      premiumReason: metric
        ? null
        : !reference?.price
          ? "Listed-stock reference unavailable."
          : !observation
            ? "No supported quote with verified share conversion for this asset."
            : "Quote and listed-stock reference are not fresh and time-aligned; no current premium is asserted.",
    };
  });
  return { rows, retrievedAt: new Date().toISOString(), basis: BASIS };
}
