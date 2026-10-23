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
function createPacedRequester({
  intervalMs,
  maxQueue = 12,
  name,
  send = request,
}) {
  const queue = [];
  let nextAt = 0;
  let rateTimer = null;
  const deadlineError = () =>
    new Error(`${name} public quote deadline reached. Refresh shortly.`);
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
    send(job.url, {
      ...job.options,
      timeout: Math.min(12_000, remaining),
    }).then(job.resolve, job.reject);
    pump();
  };
  return (url, { deadlineAt = Date.now() + 20_000, ...options } = {}) => {
    const now = Date.now();
    if (deadlineAt <= Math.max(now, nextAt) + queue.length * intervalMs)
      return Promise.reject(deadlineError());
    if (queue.length >= maxQueue)
      return Promise.reject(
        new Error(`${name} public quote capacity is busy. Refresh shortly.`),
      );
    return new Promise((resolve, reject) => {
      const job = {
        url,
        deadlineAt,
        options,
        resolve,
        reject,
        expiryTimer: null,
      };
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
export function createJupiterRequester(options = {}) {
  return createPacedRequester({
    intervalMs: 2100,
    ...options,
    name: "Jupiter",
  });
}
export const requestJupiter = createJupiterRequester();

// https://docs.li.fi/api-reference/rate-limits: keyless advanced/routes has a
// 75-request rolling two-hour quota. Never retry, rotate IPs or request keys.
export function createLifiRequester({
  maxRequests = 75,
  windowMs = 7_200_000,
  intervalMs = 1100,
  maxQueue = 12,
  send = request,
  now = Date.now,
} = {}) {
  const sentAt = [];
  let blockedUntil = 0;
  return createPacedRequester({
    intervalMs,
    maxQueue,
    name: "LI.FI",
    send: (url, options) => {
      const time = now();
      while (sentAt.length && sentAt[0] <= time - windowMs) sentAt.shift();
      if (time < blockedUntil || sentAt.length >= maxRequests)
        return Promise.reject(
          new Error(
            "LI.FI public quote quota reached. Try again after its two-hour window resets.",
          ),
        );
      sentAt.push(time);
      return send(url, options).catch((error) => {
        // Another client on the same public IP may have consumed the quota.
        // Stop requesting instead of immediately spending another request.
        if (error.status === 429) blockedUntil = now() + windowMs;
        throw error;
      });
    },
  });
}
export const requestLifi = createLifiRequester();

// Route estimates include fees only when every top-level step explicitly says
// so. Included substeps repeat those fees and must not be counted twice.
export function parseLifi(response, deployment, chain, amount, units) {
  const candidates = [];
  for (const q of response?.routes || []) {
    if (
      q.fromChainId !== chain.evmId ||
      q.toChainId !== chain.evmId ||
      q.containsSwitchChain !== false ||
      q.fromAmount !== amount ||
      !sameAddress(q.fromToken?.address, chain.usdc) ||
      !sameAddress(q.toToken?.address, deployment.address) ||
      q.fromToken.chainId !== chain.evmId ||
      q.toToken.chainId !== chain.evmId ||
      q.fromToken.decimals !== chain.decimals ||
      q.toToken.decimals !== units.outputDecimals ||
      !positiveInteger(q.toAmount) ||
      !positiveInteger(q.toAmountMin) ||
      BigInt(q.toAmountMin) > BigInt(q.toAmount) ||
      !q.steps?.length
    )
      continue;
    const steps = q.steps;
    if (
      steps.some(
        (s) =>
          s.action?.fromChainId !== chain.evmId ||
          s.action?.toChainId !== chain.evmId ||
          !Array.isArray(s.estimate?.feeCosts) ||
          s.estimate.feeCosts.some(
            (f) =>
              f.included !== true ||
              typeof f.amount !== "string" ||
              !/^\d+$/.test(f.amount) ||
              nonnegative(f.percentage) == null ||
              Number(f.percentage) > 1,
          ),
      )
    )
      continue;
    const fees = steps.flatMap((s) => s.estimate.feeCosts);
    const venues = unique(
      steps.flatMap((s) =>
        (s.includedSteps || [s])
          .filter((step) => step.type === "swap")
          .map((step) => step.toolDetails?.name || step.tool),
      ),
    );
    candidates.push({
      inputAmount: amount,
      outputAmount: q.toAmount,
      minimumOutputAmount: q.toAmountMin,
      networkFeeUsd: nonnegative(q.gasCostUSD),
      priceImpactPct: null,
      providerFeeBps: fees.reduce(
        (sum, f) => sum + Number(f.percentage) * 10_000,
        0,
      ),
      liquidityVenues: venues,
      markets: venues,
      poolIds: [],
    });
  }
  candidates.sort((a, b) =>
    BigInt(a.outputAmount) > BigInt(b.outputAmount) ? -1 : 1,
  );
  if (!candidates.length)
    throw new Error(
      "No verified LI.FI route with disclosed included fees is available for this amount.",
    );
  return candidates[0];
}

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
  if (!chain.evmId || !chain.usdc) return [];
  if (chain.quoteProviders?.lifi) {
    const body = JSON.stringify({
      fromChainId: chain.evmId,
      toChainId: chain.evmId,
      fromTokenAddress: chain.usdc,
      toTokenAddress: deployment.address,
      fromAmount: amount,
      options: { order: "CHEAPEST", slippage: 0.005, allowSwitchChain: false },
    });
    const buyParams = new URLSearchParams({
      fromChain: String(chain.evmId),
      toChain: String(chain.evmId),
      fromToken: chain.usdc,
      toToken: deployment.address,
      fromAmount: `${BigInt(amount) / 10n ** BigInt(chain.decimals)}.${(BigInt(amount) % 10n ** BigInt(chain.decimals)).toString().padStart(chain.decimals, "0")}`,
    });
    return [
      {
        id: "lifi",
        name: "LI.FI",
        url: "https://li.quest/v1/advanced/routes",
        sourceUrl:
          "https://docs.li.fi/api-reference/advanced/get-a-set-of-routes-for-a-request-that-describes-a-transfer-of-tokens",
        sourceLabel: "Quote API documentation",
        buyUrl: `https://jumper.exchange/?${buyParams}`,
        load: (url, options) =>
          requestLifi(url, {
            ...options,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        parse: parseLifi,
      },
    ];
  }
  if (!chain.quoteProviders?.velora) return [];
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
      buyUrl: `https://app.velora.xyz/app/swap/${chain.usdc}-${deployment.address}?network=${chain.veloraChain || chain.kyber}`,
      load: request,
      parse: parseVelora,
    },
  ];
}
