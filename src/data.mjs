// ALL numbers below are synthetic. These are scenario inputs, not market data.
export const stocks = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    sector: "Semiconductors",
    initial: "N",
    color: "nvidia",
    referencePrice: 185,
    ratios: { xstocks: 1.012, ondo: 1.008 },
  },
  {
    ticker: "AAPL",
    name: "Apple",
    sector: "Consumer technology",
    initial: "A",
    color: "apple",
    referencePrice: 230,
    ratios: { xstocks: 1.026, ondo: 1.018 },
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    sector: "Automotive",
    initial: "T",
    color: "tesla",
    referencePrice: 340,
    ratios: { xstocks: 1, ondo: 1 },
  },
];

export const issuers = {
  xstocks: {
    name: "xStocks",
    suffix: "x",
    short: "x",
    structure: "Tracker certificate",
    rights:
      "Read the issuer’s prospectus and product-specific final terms for the rights attached to the certificate.",
    exit: "Check the provider’s current redemption terms, minimums, onboarding, and jurisdiction restrictions.",
    dividends:
      "Dividend treatment is set by the product documentation. The demo uses an illustrative shares-per-token ratio.",
    url: "https://xstocks.com/",
    source: "https://assets.backed.fi/legal-documentation",
    sourceLabel: "Prospectus & final terms",
  },
  ondo: {
    name: "Ondo",
    suffix: "on",
    short: "o",
    structure: "Structured note",
    rights:
      "A debt instrument issued by Ondo Global Markets (BVI) Limited. It provides economic exposure, without shareholder voting or information rights.",
    exit: "Direct issuer purchases and redemptions require onboarding. Access through other venues has its own requirements.",
    dividends:
      "Designed to track total returns, including dividends reinvested net of applicable withholding taxes.",
    url: "https://app.ondo.finance/",
    source: "https://docs.ondo.finance/ondo-stocks/legal-and-regulatory",
    sourceLabel: "Legal structure & holder rights",
  },
};

const scenarios = [
  {
    issuer: "xstocks",
    chain: "Solana",
    venue: "Jupiter",
    spreadBps: 12,
    feeBps: 5,
    networkFee: 0.03,
    impactBpsPerThousand: 2,
  },
  {
    issuer: "ondo",
    chain: "Solana",
    venue: "Jupiter",
    spreadBps: 15,
    feeBps: 6,
    networkFee: 0.03,
    impactBpsPerThousand: 1.5,
  },
  {
    issuer: "ondo",
    chain: "Ethereum",
    venue: "EVM venue",
    spreadBps: 6,
    feeBps: 3,
    networkFee: 2.4,
    impactBpsPerThousand: 0.4,
  },
  {
    issuer: "xstocks",
    chain: "Ethereum",
    venue: "EVM venue",
    spreadBps: 11,
    feeBps: 5,
    networkFee: 2.4,
    impactBpsPerThousand: 0.8,
  },
  {
    issuer: "ondo",
    chain: "BNB Chain",
    venue: "EVM venue",
    spreadBps: 20,
    feeBps: 7,
    networkFee: 0.12,
    impactBpsPerThousand: 1.8,
  },
  {
    issuer: "xstocks",
    chain: "BNB Chain",
    venue: "EVM venue",
    spreadBps: 18,
    feeBps: 7,
    networkFee: 0.12,
    impactBpsPerThousand: 2.5,
  },
];

export function routesFor(stock) {
  return scenarios.map((route) => ({
    ...route,
    id: `${route.issuer}-${route.chain}`,
    shareRatio: stock.ratios[route.issuer],
  }));
}
