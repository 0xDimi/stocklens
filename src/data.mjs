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
  bstocks: {
    name: "bStocks",
    short: "b",
    structure: "Certificate",
    rights:
      "Binance describes bStocks as tokenized securities issued by BTech Holdings Limited. Holders do not directly own the underlying stock.",
    dividends:
      "Dividends are reinvested. One token can represent more than one underlying share over time; a current conversion ratio is required.",
    exit: "Minting and redemption follow issuer conditions. The cited Binance FZE FAQ states direct minting/redemption is unavailable to its clients.",
    url: "https://www.binance.com/bstocks-landing",
    source:
      "https://academy.binance.com/en/articles/what-are-bstocks-a-guide-to-tokenized-stocks-on-binance",
    sourceLabel: "Binance bStocks overview",
    eligibility:
      "https://www.binance.com/en-AE/support/faq/detail/f0c03cd6509a4085b4cce1636f16be38",
    eligibilityLabel: "bStocks FAQ & access conditions",
  },
  robinhood: {
    name: "Robinhood",
    short: "r",
    structure: "Tokenized debt security",
    rights:
      "Robinhood’s current onchain Stock Tokens page names Robinhood Assets (Jersey) Limited as issuer. Read the applicable token documents; Classic Stock Tokens use a different structure.",
    dividends:
      "The cited onchain product reinvests dividends, so a token can represent more than one share over time.",
    exit: "Access, redemption and investor restrictions depend on the specific product and venue. Read the issuer’s current terms before choosing a token.",
    url: "https://robinhood.com/rhj/stocktokens/",
    source: "https://robinhood.com/rhj/stocktokens/",
    sourceLabel: "Onchain Stock Tokens",
    eligibility: "https://robinhood.com/rhj/stocktokens/",
    eligibilityLabel: "Issuer terms & availability",
  },
  dinari: {
    name: "Dinari",
    short: "d",
    structure: "Security-backed dShare",
    rights:
      "Dinari describes a dShare as a separate security backed by the corresponding security. The holder is not a direct shareholder in the company.",
    dividends:
      "Dinari processes dividends and corporate actions. Consult the current distribution fees and split treatment.",
    exit: "Direct purchases require KYC and supported payment assets. Redemption and transfer conditions depend on the product and distribution partner.",
    url: "https://dinari.com/",
    source: "https://docs.dinari.com/docs/faqs",
    sourceLabel: "Dinari FAQs & holder rights",
    eligibility: "https://docs.dinari.com/docs/what-is-dshare",
    eligibilityLabel: "dShare structure & access",
  },
};
