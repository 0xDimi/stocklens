import { getFundamentals } from "./fundamentals.mjs";
import { resolveStock } from "./catalog.mjs";
import { productMarkets } from "./product-markets.mjs";
import { getPools, getHistory } from "./gecko.mjs";
import { CHAINS } from "./config.mjs";
import { sourceStatus } from "./source-client.mjs";
export function validateView(params) {
  const id = params.get("stock") || "NVDA",
    chain = params.get("chain") || "all";
  if (!/^[A-Za-z0-9.:\-]{1,100}$/.test(id))
    throw new Error("Choose a valid underlying asset.");
  if (chain !== "all" && !CHAINS[chain])
    throw new Error("Choose a supported chain.");
  return { id, chain };
}
export async function productsView({ id, chain }, params) {
  const { stock, warnings, catalogAt } = await resolveStock(
    id,
    params?.get("enrich") !== "false",
  );
  const referenceWork = getFundamentals(stock);
  let markets = { rows: [], retrievedAt: null };
  try {
    markets = await productMarkets(stock);
    if (markets.warning) warnings.push(markets.warning);
  } catch (error) {
    warnings.push("CoinGecko prices unavailable: " + error.message);
  }
  const rows = stock.products
    .filter(
      (p) => chain === "all" || p.deployments.some((d) => d.chain === chain),
    )
    .map((p) => ({
      ...p,
      market:
        markets.rows.find(
          (m) =>
            (p.coinId && m.coinId === p.coinId) ||
            m.productKey === p.issuer + ":" + p.symbol,
        ) || null,
    }));
  return {
    stock,
    reference: await referenceWork,
    rows,
    warnings,
    catalogAt,
    retrievedAt: markets.retrievedAt,
    sources: sourceStatus(),
    basis:
      "USD per token unit; aggregate market observations, not order quotes or underlying exchange prices.",
  };
}
export async function marketsView({ id, chain }, params) {
  const { stock, warnings } = await resolveStock(id);
  let deployment = null;
  if (params?.get("token")) {
    deployment = stock.products
      .flatMap((p) => p.deployments)
      .find((d) => d.address === params.get("token") && d.chain === chain);
    if (!deployment) {
      const error = new Error("Choose a token deployment from this stock.");
      error.status = 400;
      throw error;
    }
  }
  try {
    return {
      stock,
      ...(await getPools(stock, chain, deployment)),
      warnings,
      sources: sourceStatus(),
    };
  } catch (error) {
    return {
      stock,
      rows: [],
      retrievedAt: null,
      warnings: [...warnings, "GeckoTerminal unavailable: " + error.message],
      sources: sourceStatus(),
      error: error.message,
    };
  }
}
export async function historyView(query, params) {
  const range = params.get("range") || "1d",
    pool = params.get("pool");
  if (
    !["1d", "7d"].includes(range) ||
    !pool ||
    pool.length > 220 ||
    !/^[a-zA-Z0-9_:.-]+$/.test(pool)
  ) {
    const error = new Error("Choose a listed pool and a 1d or 7d range.");
    error.status = 400;
    throw error;
  }
  const { stock } = await resolveStock(query.id);
  const deployment = params.get("token")
    ? stock.products
        .flatMap((p) => p.deployments)
        .find(
          (d) => d.chain === query.chain && d.address === params.get("token"),
        )
    : null;
  if (params.get("token") && !deployment) {
    const error = new Error("Choose a catalog token deployment.");
    error.status = 400;
    throw error;
  }
  return getHistory(stock, pool, range, deployment);
}
