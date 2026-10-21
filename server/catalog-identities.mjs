import { readFileSync } from "node:fs";
import { mergeDiscovery } from "./coingecko.mjs";
const { references } = JSON.parse(
  readFileSync(
    new URL("./data/catalog-identity-references.json", import.meta.url),
    "utf8",
  ),
);
const nativeIssuers = {
  xstocks: "xstocks-ecosystem",
  ondo: "ondo-tokenized-assets",
};
function sameContract(a, b) {
  return (
    a.chain === b.chain &&
    (a.chain === "Solana" || a.chain === "TON"
      ? a.address === b.address
      : a.address.toLowerCase() === b.address.toLowerCase())
  );
}

// A reviewed native binding needs the official underlying ISIN, product symbol,
// issuer and exact chain/contract. Ondo does not disclose a separate token ISIN.
export function applyCatalogReferences(stocks) {
  const bound = new Set();
  for (const stock of stocks) {
    const reference = references.find(
      (record) =>
        stock.id === record.underlyingIsin &&
        stock.ticker === record.ticker &&
        stock.products.some(
          (product) =>
            product.issuer === record.product.issuer &&
            product.symbol === record.product.symbol &&
            (record.product.isin === undefined
              ? record.product.issuer === "ondo"
              : product.isin === record.product.isin) &&
            product.deployments.some((deployment) =>
              sameContract(deployment, record.product),
            ),
        ),
    );
    if (!reference) continue;
    stock.name = reference.name;
    // A generic issuer label must not erase a source-backed Stock/ETF type.
    if (
      ["Stock", "ETF"].includes(reference.category) ||
      !["Stock", "ETF"].includes(stock.category)
    )
      stock.category = reference.category;
    stock.identitySource = {
      url: reference.source,
      checkedAt: reference.checkedAt,
      underlyingIsin: reference.underlyingIsin,
    };
    if (
      reference.rwa &&
      nativeIssuers[reference.product.issuer] &&
      reference.rwa.issuer === nativeIssuers[reference.product.issuer] &&
      sameContract(reference.rwa, reference.product)
    ) {
      stock.rwaId = reference.rwa.id;
      stock.aliases = [
        ...new Set([...(stock.aliases || []), "cg:" + reference.rwa.id]),
      ].filter((id) => id !== stock.id);
      stock.rwaSource = {
        url: reference.rwa.source,
        retrievedAt: reference.rwa.retrievedAt,
        mapping: reference.product.isin
          ? "Exact issuer product ISIN and native RWA token contract"
          : "Exact issuer underlying ISIN and native RWA token contract",
        coinId: reference.rwa.coinId,
      };
      bound.add(stock);
    }
  }
  // Old snapshots can contain both rows. Collapse only the native ID proved by
  // the reviewed contract above, including when its marketing name differs.
  const output = stocks.filter((stock) => {
    if (!stock.id.startsWith("cg:")) return true;
    const targets = [...bound].filter(
      (target) =>
        stock.id === "cg:" + target.rwaId &&
        (!stock.rwaId || stock.rwaId === target.rwaId) &&
        stock.ticker.toUpperCase().replace(/[.\-]/g, "") ===
          target.ticker.toUpperCase().replace(/[.\-]/g, ""),
    );
    if (targets.length !== 1) return true;
    const target = targets[0];
    const merged = mergeDiscovery([target], [stock])[0];
    if (["Stock", "ETF"].includes(target.category))
      merged.category = target.category;
    merged.aliases = [
      ...new Set([
        ...(target.aliases || []),
        ...(stock.aliases || []),
        stock.id,
      ]),
    ].filter((id) => id !== target.id);
    Object.assign(target, merged);
    return false;
  });
  return output;
}
