// Sourced structural notes only. Live contracts and quotes come from the server.
export const issuers = {
  xstocks: {
    name: "xStocks",
    short: "x",
    structure: "Tracker certificate",
    rights:
      "A bearer debt instrument issued by Backed Assets (JE) Limited. Read the prospectus and the specific product’s final terms for holder rights and recourse.",
    exit: "Issuer issuance and redemption have separate onboarding, minimums, restrictions, and fees. Secondary-market liquidity is a separate exit route.",
    dividends:
      "Corporate actions use a multiplier. On Solana it scales raw token amounts; EVM balances are already adjusted by the contract.",
    url: "https://xstocks.com/",
    source: "https://docs.xstocks.fi/docs/product-legal-overview",
    sourceLabel: "Legal structure & holder rights",
    eligibility: "https://assets.backed.fi/legal-documentation",
    eligibilityLabel: "Prospectus & restricted countries",
  },
  ondo: {
    name: "Ondo",
    short: "o",
    structure: "Structured note",
    rights:
      "A debt instrument issued by Ondo Global Markets (BVI) Limited. It provides economic exposure without shareholder voting or information rights.",
    exit: "Direct issuer purchases and redemptions require onboarding. Other venues have their own access rules and available liquidity.",
    dividends:
      "Designed to track total returns, including dividends reinvested net of applicable withholding taxes. Raw tokens can represent more than one underlying share.",
    url: "https://app.ondo.finance/",
    source: "https://docs.ondo.finance/ondo-stocks/legal-and-regulatory",
    sourceLabel: "Legal structure & holder rights",
    eligibility: "https://docs.ondo.finance/ondo-stocks/eligibility",
    eligibilityLabel: "Eligibility & jurisdiction restrictions",
  },
};
