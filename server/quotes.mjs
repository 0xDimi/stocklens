import { loadCatalog } from "./catalog.mjs";
import { getQuote } from "./providers.mjs";
import { mapLimit } from "./http.mjs";
import { rankQuotes, validBudget } from "../src/model.mjs";
import { CHAINS } from "./config.mjs";

export function validateComparison(params) {
  const id = params.get("stock") || params.get("ticker") || "NVDA";
  const amount = params.get("amount") || "1000";
  const chain = params.get("chain") || "all";
  if (!/^[A-Za-z0-9.\-]{1,20}$/.test(id))
    throw new Error("Choose a valid stock identifier.");
  if (!validBudget(amount))
    throw new Error(
      "Enter a USDC amount between 10 and 1,000,000, with at most two decimal places.",
    );
  if (chain !== "all" && !CHAINS[chain])
    throw new Error("Choose a supported chain.");
  return { id, amount, chain };
}
export async function compareStock({ id, amount, chain }) {
  const catalog = await loadCatalog();
  const matches = catalog.stocks.filter((s) => s.id === id || s.ticker === id);
  if (matches.length !== 1) {
    const error = new Error(
      matches.length
        ? "This ticker identifies more than one security. Choose its exact listing."
        : "This stock is not in the verified catalog.",
    );
    error.status = matches.length ? 409 : 404;
    throw error;
  }
  const stock = matches[0];
  const jobs = stock.products.flatMap((product) =>
    product.deployments
      .filter((d) => chain === "all" || d.chain === chain)
      .map((deployment) => ({ product, deployment })),
  );
  const rows = await mapLimit(jobs, 6, ({ product, deployment }) =>
    getQuote(product, deployment, amount),
  );
  return {
    stock,
    amount,
    chain,
    rows: rankQuotes(rows),
    fetchedAt: Date.now(),
    catalogAt: catalog.fetchedAt,
    warnings: catalog.warnings,
    costBasis:
      "USDC input divided by equivalent share exposure. Network, approval, account-creation, bridging, funding and future exit costs are excluded from ranking. USDC is assumed funded on each selected chain; BNB Chain uses Binance-Peg USDC.",
    quoteType:
      "Indicative swap quotes; venue will re-quote before any purchase.",
    freshnessMs: 30_000,
  };
}
