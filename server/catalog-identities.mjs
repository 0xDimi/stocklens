import { readFileSync } from "node:fs";
const { references } = JSON.parse(
  readFileSync(
    new URL("./data/catalog-identity-references.json", import.meta.url),
    "utf8",
  ),
);

// Product marketing names can differ from the listed underlying. These reviewed
// references require all disclosed security identifiers and an exact contract.
export function applyCatalogReferences(stocks) {
  for (const stock of stocks) {
    const reference = references.find(
      (record) =>
        stock.id === record.underlyingIsin &&
        stock.ticker === record.ticker &&
        stock.products.some(
          (product) =>
            product.issuer === record.product.issuer &&
            product.symbol === record.product.symbol &&
            product.isin === record.product.isin &&
            product.deployments.some(
              (deployment) =>
                deployment.chain === record.product.chain &&
                deployment.address.toLowerCase() ===
                  record.product.address.toLowerCase(),
            ),
        ),
    );
    if (!reference) continue;
    stock.name = reference.name;
    stock.category = reference.category;
    stock.identitySource = {
      url: reference.source,
      checkedAt: reference.checkedAt,
      underlyingIsin: reference.underlyingIsin,
    };
    if (
      reference.rwa &&
      reference.rwa.issuer === "xstocks-ecosystem" &&
      reference.rwa.chain === reference.product.chain &&
      reference.rwa.address.toLowerCase() ===
        reference.product.address.toLowerCase()
    ) {
      stock.rwaId = reference.rwa.id;
      stock.aliases = [
        ...new Set([...(stock.aliases || []), "cg:" + reference.rwa.id]),
      ].filter((id) => id !== stock.id);
      stock.rwaSource = {
        url: reference.rwa.source,
        retrievedAt: reference.rwa.retrievedAt,
        mapping: "Exact issuer product ISIN and native RWA token contract",
        coinId: reference.rwa.coinId,
      };
    }
  }
  return stocks;
}
