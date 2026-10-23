// Keep route absence separate from a source that could not complete its check.
export function quoteFailure(error) {
  const reason =
    error?.message || "The quote source did not return a response.";
  const kind =
    error?.status === 429 ||
    /rate limit|quota reached|capacity is busy/i.test(reason)
      ? "rate-limited"
      : ["price-impact", "no-route"].includes(error?.quoteFailureKind)
        ? error.quoteFailureKind
        : error?.name === "TimeoutError" ||
            /timeout|timed out|deadline|still in progress/i.test(reason)
          ? "timeout"
          : /no (verified )?.*route|no routes|no liquidity/i.test(reason)
            ? "no-route"
            : "source-unavailable";
  return { kind, reason };
}
export function quoteUnavailable(failures) {
  const availability =
    ["rate-limited", "timeout", "source-unavailable", "price-impact"].find(
      (kind) => failures.some((f) => f.kind === kind),
    ) || "no-route";
  const reasons = {
    "rate-limited":
      "A quote source reached its public request limit. Refresh shortly; this does not establish that the token has no route.",
    timeout:
      "A quote source did not respond within this comparison’s time limit. Refresh or choose one network to retry.",
    "source-unavailable":
      "The connected quote sources could not complete this check. Provider details are shown below.",
    "price-impact":
      "The returned route exceeded the provider’s price-impact limit. Try a smaller amount or another network.",
    "no-route":
      "The checked providers returned no verified route for this amount. Try another amount or explore the token’s listed venues.",
  };
  return { availability, reason: reasons[availability] };
}
export function quoteFeeView(row) {
  const known = Number.isFinite(row.networkFeeUsd) && row.networkFeeUsd >= 0;
  return {
    label:
      known && row.networkFeeUsd > 0 && row.networkFeeUsd < 0.01
        ? "<$0.01"
        : known
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(row.networkFeeUsd)
          : "At venue",
    detail: known
      ? "Provider estimate; approval and account-creation costs may be separate."
      : "Gas depends on the transaction and wallet. The venue calculates it before confirmation; it is excluded from this ranking.",
    providerFee:
      Number.isFinite(row.providerFeeBps) && row.providerFeeBps >= 0
        ? `${(row.providerFeeBps / 100).toFixed(2)}% provider fee included`
        : null,
  };
}
export function supportsQuotes(chain) {
  return Boolean(
    chain?.usdc &&
    (!chain.quoteProviders ||
      Object.values(chain.quoteProviders).some(Boolean)),
  );
}
// Give different issuers a first opportunity before one multi-chain product
// consumes the comparison deadline. Preserve all deployments, including gaps.
export function scheduleQuoteJobs(products, chains, network = "all") {
  const groups = products.map((product) => ({
    product,
    deployments: product.deployments
      .filter((d) => network === "all" || d.chain === network)
      .map((d, index) => ({ d, index }))
      .sort(
        (a, b) =>
          Number(supportsQuotes(chains[b.d.chain])) -
            Number(supportsQuotes(chains[a.d.chain])) || a.index - b.index,
      )
      .map(({ d }) => d),
  }));
  const supported = [],
    unsupported = [];
  for (let round = 0; groups.some((g) => g.deployments[round]); round++) {
    for (const { product, deployments } of groups) {
      const deployment = deployments[round];
      if (!deployment) continue;
      (supportsQuotes(chains[deployment.chain]) ? supported : unsupported).push(
        { product, deployment },
      );
    }
  }
  return [...supported, ...unsupported];
}
