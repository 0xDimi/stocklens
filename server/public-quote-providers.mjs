import { request, observeWithin } from "./http.mjs";

const positiveInteger = (value) =>
  typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
const unique = (values) => [
  ...new Set(values.filter((value) => typeof value === "string" && value)),
];
const sameAddress = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const nonnegative = (value) =>
  value != null &&
  value !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;

// Official schemas: developers.jup.ag/docs/api-reference/swap/order and
// www.velora.xyz/docs/api-reference/market/prices (keyless public access).
export function parseJupiter(q, deployment, chain, amount) {
  if (
    !q ||
    q.error ||
    q.errorCode ||
    q.inputMint !== chain.usdc ||
    q.outputMint !== deployment.address ||
    q.inAmount !== amount ||
    q.swapMode !== "ExactIn" ||
    !positiveInteger(q.outAmount)
  )
    throw new Error("No verified Jupiter route is available for this amount.");
  const sourceExpiresAt = q.expireAt == null ? null : Date.parse(q.expireAt);
  if (q.expireAt != null && !Number.isFinite(sourceExpiresAt))
    throw new Error("Jupiter returned an invalid quote expiry.");
  const swaps = (q.routePlan || []).map((step) => step.swapInfo || {});
  return {
    inputAmount: q.inAmount,
    outputAmount: q.outAmount,
    minimumOutputAmount:
      positiveInteger(q.otherAmountThreshold) &&
      BigInt(q.otherAmountThreshold) <= BigInt(q.outAmount)
        ? q.otherAmountThreshold
        : null,
    sourceExpiresAt,
    priceImpactPct:
      q.priceImpact != null && Number.isFinite(Number(q.priceImpact))
        ? Number(q.priceImpact)
        : q.priceImpactPct != null && Number.isFinite(Number(q.priceImpactPct))
          ? Number(q.priceImpactPct) * 100
          : null,
    networkFeeUsd: null,
    liquidityVenues: unique(swaps.map((s) => s.label)),
    poolIds: unique(swaps.map((s) => s.ammKey)),
    markets: unique(swaps.map((s) => s.label)),
    providerFeeBps: nonnegative(q.feeBps),
    providerRouter: typeof q.router === "string" ? q.router : null,
  };
}

export function parseVelora(response, deployment, chain, amount, units) {
  const q = response.priceRoute;
  if (
    !q ||
    q.network !== chain.evmId ||
    q.side !== "SELL" ||
    !sameAddress(q.srcToken, chain.usdc) ||
    !sameAddress(q.destToken, deployment.address) ||
    q.srcAmount !== amount ||
    q.srcDecimals !== chain.decimals ||
    q.destDecimals !== units.outputDecimals ||
    !positiveInteger(q.destAmount) ||
    q.maxImpactReached === true
  )
    throw new Error("No verified Velora route is available for this amount.");
  // Default anonymous routes charge a provider fee. Never rank the gross output
  // when the provider does not disclose the net amount (or an explicit zero fee).
  const output =
    q.destAmountAfterFee ?? (q.partnerFee === 0 ? q.destAmount : null);
  if (!positiveInteger(output) || BigInt(output) > BigInt(q.destAmount))
    throw new Error(
      "Velora did not disclose a valid output after provider fees.",
    );
  const exchanges = (q.bestRoute || []).flatMap((route) =>
    (route.swaps || []).flatMap((swap) => swap.swapExchanges || []),
  );
  const venues = unique(exchanges.map((exchange) => exchange.exchange));
  return {
    inputAmount: q.srcAmount,
    outputAmount: output,
    minimumOutputAmount: null,
    priceImpactPct: null,
    networkFeeUsd: nonnegative(q.gasCostUSD),
    markets: venues,
    liquidityVenues: venues,
    poolIds: unique(
      exchanges.flatMap((exchange) => exchange.poolAddresses || []),
    ),
    providerFeeBps:
      nonnegative(q.partnerFee) == null ? null : Number(q.partnerFee) * 100,
  };
}

// A slow provider must never hide another provider's completed observation.
// Every timer is cleared by observeWithin when its provider settles.
export function settleQuoteProviders(jobs, deadlineAt) {
  return Promise.allSettled(
    jobs.map((job) => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0)
        return Promise.reject(new Error("Quote deadline reached."));
      return observeWithin(job, remaining);
    }),
  );
}

// Jupiter documents 0.5 requests/second for keyless clients. Expired waiting
// jobs are removed instead of occupying a Promise tail or sending late HTTP.
export function createJupiterRequester({
  intervalMs = 2100,
  maxQueue = 12,
} = {}) {
  const queue = [];
  let nextAt = 0;
  let rateTimer = null;
  const deadlineError = () =>
    new Error("Jupiter public quote deadline reached. Refresh shortly.");
  const pump = () => {
    if (rateTimer) {
      clearTimeout(rateTimer);
      rateTimer = null;
    }
    if (!queue.length) return;
    const delay = Math.max(0, nextAt - Date.now());
    if (delay) {
      rateTimer = setTimeout(pump, delay);
      return;
    }
    const job = queue.shift();
    clearTimeout(job.expiryTimer);
    const remaining = job.deadlineAt - Date.now();
    if (remaining <= 0) {
      job.reject(deadlineError());
      pump();
      return;
    }
    nextAt = Date.now() + intervalMs;
    request(job.url, { timeout: Math.min(12_000, remaining) }).then(
      job.resolve,
      job.reject,
    );
    pump();
  };
  return (url, { deadlineAt = Date.now() + 20_000 } = {}) => {
    const now = Date.now();
    if (deadlineAt <= Math.max(now, nextAt) + queue.length * intervalMs)
      return Promise.reject(deadlineError());
    if (queue.length >= maxQueue)
      return Promise.reject(
        new Error("Jupiter public quote capacity is busy. Refresh shortly."),
      );
    return new Promise((resolve, reject) => {
      const job = { url, deadlineAt, resolve, reject, expiryTimer: null };
      job.expiryTimer = setTimeout(() => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        reject(deadlineError());
        pump();
      }, deadlineAt - now);
      queue.push(job);
      pump();
    });
  };
}
export const requestJupiter = createJupiterRequester();

export function additionalQuoteProviders(deployment, chain, amount, units) {
  if (deployment.chain === "Solana") {
    const params = new URLSearchParams({
      inputMint: chain.usdc,
      outputMint: deployment.address,
      amount,
    });
    return [
      {
        id: "jupiter",
        name: "Jupiter",
        url: `https://api.jup.ag/swap/v2/order?${params}`,
        buyUrl: `https://jup.ag/swap?${new URLSearchParams({ buy: deployment.address, sell: chain.usdc })}`,
        load: requestJupiter,
        parse: parseJupiter,
      },
    ];
  }
  if (!chain.evmId) return [];
  const params = new URLSearchParams({
    srcToken: chain.usdc,
    destToken: deployment.address,
    amount,
    srcDecimals: String(chain.decimals),
    destDecimals: String(units.outputDecimals),
    side: "SELL",
    network: String(chain.evmId),
    version: "6.2",
  });
  return [
    {
      id: "velora",
      name: "Velora",
      url: `https://api.velora.xyz/prices?${params}`,
      buyUrl: `https://app.velora.xyz/app/swap/${chain.usdc}-${deployment.address}?network=${chain.kyber}`,
      load: request,
      parse: parseVelora,
    },
  ];
}
