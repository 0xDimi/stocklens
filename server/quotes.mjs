import { getFundamentals } from "./fundamentals.mjs";
import { resolveStock } from "./catalog.mjs";
import { getQuoteOptions } from "./providers.mjs";
import { mapLimit, observeWithin } from "./http.mjs";
import { rankQuotes, validBudget } from "../src/model.mjs";
import { CHAINS } from "./config.mjs";
import { scheduleQuoteJobs } from "../src/quote-support.mjs";

export function validateComparison(params) {
  const id = params.get("stock") || params.get("ticker") || "NVDA";
  const amount = params.get("amount") || "1000";
  const chain = params.get("chain") || "all";
  if (!/^[A-Za-z0-9.:\-]{1,100}$/.test(id))
    throw new Error("Choose a valid stock identifier.");
  if (!validBudget(amount))
    throw new Error(
      "Enter a USDC amount between 10 and 1,000,000, with at most two decimal places.",
    );
  if (chain !== "all" && !CHAINS[chain])
    throw new Error("Choose a supported chain.");
  return { id, amount, chain };
}
// Keep quote fanout inside the 30-second indicative lifetime. Timed-out work
// may complete in the shared cache; its original observation time is retained.
export async function collectQuoteOptions(
  jobs,
  amount,
  { budgetMs = 22_000, concurrency = 6, getOptions = getQuoteOptions } = {},
) {
  const deadline = Date.now() + budgetMs;
  const grouped = await mapLimit(
    jobs,
    concurrency,
    async ({ product, deployment }) => {
      const remaining = deadline - Date.now();
      try {
        if (remaining <= 0)
          throw new Error("Comparison quote deadline reached.");
        return await observeWithin(
          () =>
            getOptions(product, deployment, amount, {
              deadlineAt: deadline - 50,
            }),
          remaining,
        );
      } catch {
        const chain = CHAINS[deployment.chain];
        return [
          {
            id: `${product.issuer}:${deployment.chain}:${deployment.address}`,
            issuer: product.issuer,
            issuerName: product.issuerName,
            symbol: product.symbol,
            wrapped: product.wrapped === true,
            chain: deployment.chain,
            chainLabel: chain?.label || deployment.chain,
            address: deployment.address,
            explorerUrl: chain ? chain.explorer + deployment.address : null,
            source: product.source,
            sourceAt: product.sourceAt,
            status: "unavailable",
            availability: "timeout",
            quoteProvider: null,
            venue: "—",
            buyUrl: null,
            liquidityVenues: [],
            poolIds: [],
            fetchedAt: null,
            expiresAt: null,
            reason:
              "Public quote sources did not respond within this comparison's time limit. Refresh or choose one chain to retry.",
          },
        ];
      }
    },
  );
  return grouped.flat();
}

export async function compareStock({ id, amount, chain }) {
  const { stock, warnings, catalogAt } = await resolveStock(id, true);
  const referenceWork = getFundamentals(stock);
  const jobs = scheduleQuoteJobs(stock.products, CHAINS, chain);
  const rows = await collectQuoteOptions(jobs, amount);
  return {
    stock,
    amount,
    chain,
    rows: rankQuotes(rows),
    reference: await referenceWork,
    fetchedAt: Date.now(),
    catalogAt,
    warnings,
    costBasis:
      "USDC input divided by equivalent share exposure. Network, approval, account-creation, bridging, funding and future exit costs are excluded from ranking. USDC is assumed funded on each selected chain; BNB Chain uses Binance-Peg USDC.",
    quoteType:
      "Indicative swap quotes; venue will re-quote before any purchase.",
    freshnessMs: 30_000,
  };
}
