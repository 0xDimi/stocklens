import { CHAINS } from "./config.mjs";
import { issuers as reviewed } from "../src/data.mjs";
export function coverageSummary(stocks) {
  const products = stocks.flatMap((s) => s.products),
    ids = [...new Set(products.map((p) => p.issuer))];
  const networks = [
    ...new Set(products.flatMap((p) => p.deployments.map((d) => d.chain))),
  ];
  return {
    assets: stocks.length,
    versions: products.length,
    deployments: products.reduce((n, p) => n + p.deployments.length, 0),
    pendingAssets: stocks.filter((s) => !s.products.length).length,
    wrappedVersions: products.filter((p) => p.wrapped).length,
    networks: networks.length,
    quoteNetworks: networks.filter((id) => CHAINS[id]?.usdc).length,
    issuers: ids
      .map((id) => {
        const ps = products.filter((p) => p.issuer === id);
        return {
          id,
          name: reviewed[id]?.name || ps[0]?.issuerName || id,
          versions: ps.length,
          networks: new Set(
            ps.flatMap((p) => p.deployments.map((d) => d.chain)),
          ).size,
          reviewed:
            !!reviewed[id] && reviewed[id].reviewStatus !== "unreviewed",
          source: reviewed[id]?.source || ps[0]?.source,
        };
      })
      .sort((a, b) => b.versions - a.versions),
    unmappedPlatforms: [
      ...new Set(products.flatMap((p) => p.unmappedPlatforms || [])),
    ],
    scope:
      "Observed coverage from connected sources, not a guarantee of every token or venue. Native grouping is checked when an asset is opened.",
  };
}
