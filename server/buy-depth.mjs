import { resolveStock } from "./catalog.mjs";
import { CHAINS, validAddress } from "./config.mjs";
import { getQuote } from "./providers.mjs";
import { observeWithin } from "./http.mjs";

const SIZES = [100, 1000, 10000, 100000];
const inflight = new Map();

export function summarizeDepth(quotes, now = Date.now()) {
  const prices = SIZES.map((amount, index) => {
    const quote = quotes[index];
    const valid =
      quote?.status === "quoted" &&
      quote.expiresAt > now &&
      Number.isFinite(quote.effectivePrice) &&
      quote.effectivePrice > 0;
    return {
      amount,
      price: valid ? quote.effectivePrice : null,
      expiresAt: valid ? quote.expiresAt : null,
      provider: valid ? quote.quoteProvider : null,
      reason: valid
        ? null
        : quote?.reason || "No current share-normalized quote.",
    };
  });
  const baseline = prices[0].price;
  for (const row of prices)
    row.changePct =
      baseline && row.price ? (row.price / baseline - 1) * 100 : null;
  const supported = prices.filter(
    (row) => row.changePct !== null && row.price <= baseline * 1.01,
  );
  return {
    rows: prices,
    largestTested: supported.at(-1)?.amount ?? null,
    expiresAt: supported.length
      ? Math.min(...supported.map((row) => row.expiresAt))
      : null,
  };
}

export async function buyDepth(params) {
  const id = params.get("stock"),
    chain = params.get("chain"),
    address = params.get("token");
  if (
    !/^[A-Za-z0-9.:-]{1,100}$/.test(id || "") ||
    !Object.hasOwn(CHAINS, chain) ||
    !validAddress(chain, address || "")
  ) {
    throw Object.assign(
      new Error("Select a stock and an exact token contract."),
      { status: 400 },
    );
  }
  const key = JSON.stringify([id, chain, address]);
  if (inflight.has(key)) return inflight.get(key);
  if (inflight.size >= 3)
    throw Object.assign(
      new Error("Depth checks are busy. Please retry shortly."),
      { status: 429 },
    );
  const work = (async () => {
    const { stock } = await resolveStock(id, true);
    const sameAddress = (candidate) =>
      address.startsWith("0x")
        ? candidate.toLowerCase() === address.toLowerCase()
        : candidate === address;
    const product = stock.products.find((p) =>
      p.deployments.some((d) => d.chain === chain && sameAddress(d.address)),
    );
    const deployment = product?.deployments.find(
      (d) => d.chain === chain && sameAddress(d.address),
    );
    if (!deployment)
      throw Object.assign(
        new Error("This contract is not mapped to the stock."),
        { status: 404 },
      );
    const deadlineAt = Date.now() + 22000;
    const quotes = await Promise.all(
      SIZES.map((amount) =>
        observeWithin(
          () =>
            getQuote(product, deployment, String(amount), {
              deadlineAt: deadlineAt - 50,
            }),
          deadlineAt - Date.now(),
        ).catch(() => null),
      ),
    );
    return {
      ...summarizeDepth(quotes),
      id: [stock.id, chain, deployment.address].join(":"),
      observedAt: Math.max(...quotes.map((quote) => quote?.fetchedAt || 0)),
    };
  })().finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}
