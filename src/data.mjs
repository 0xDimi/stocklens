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
  coinbase: {
    name: "Coinbase",
    short: "C",
    structure: "Beneficial equity claim",
    rights:
      "Coinbase describes a senior claim on shares held in regulated, bankruptcy-remote custody. The token is issued as a B20 on Base; consult its prospectus.",
    dividends:
      "An onchain multiplier reflects reinvested dividends after withholding and fees, plus splits. Raw token counts stay unchanged.",
    exit: "Primary issuance and redemption are limited to onboarded institutional partners and authorized participants. U.S. persons and other restricted jurisdictions are excluded.",
    url: "https://www.coinbase.com/tokenize",
    source: "https://www.coinbase.com/en-ca/tokenize",
    sourceLabel: "Tokenized-stock structure & FAQ",
    eligibility: "https://www.coinbase.com/tokenize",
    eligibilityLabel: "Prospectus & eligibility",
    reviewStatus: "reviewed",
  },
  backpack: {
    name: "Backpack Securities",
    short: "B",
    structure: "Redeemable security token",
    rights:
      "Backpack distinguishes brokerage security entitlements from onchain tokens. Its tokenized securities can be converted back into the corresponding entitlement, subject to terms.",
    dividends:
      "The tokenized form reinvests dividends into additional tokenized shares; corporate actions adjust token balances. Brokerage holdings use a separate cash-dividend flow.",
    exit: "Conversion to a brokerage security entitlement requires access to Backpack Securities. Account eligibility and product terms apply; DEX liquidity is a separate exit.",
    url: "https://backpack.exchange/stocks/about",
    source:
      "https://learn.backpack.exchange/blog/introducing-backpack-securities",
    sourceLabel: "Backpack Securities structure",
    eligibility: "https://learn.backpack.exchange/blog/tokenized-spacex-spcx",
    eligibilityLabel: "Tokenized vs brokerage holdings",
    reviewStatus: "partial",
  },
  anchored: {
    name: "Anchored",
    short: "A",
    structure: "Asset-backed token · terms partial",
    rights:
      "Anchored describes full backing through regulated custody. The reviewed public overview does not establish the precise holder claim or insolvency priority; review the offering terms.",
    dividends:
      "Anchored says dividends are credited to the associated account wallet in USDC, net of taxes, fees and operational costs.",
    exit: "Onboarding, geographic restrictions and issuer redemption conditions apply. Transferability does not establish that a holder can redeem directly.",
    url: "https://anchored.finance/",
    source: "https://docs.anchored.finance/",
    sourceLabel: "Issuer overview · legal claim not confirmed",
    eligibility: "https://docs.anchored.finance/getting-started/eligibility",
    eligibilityLabel: "Eligibility & onboarding",
    reviewStatus: "partial",
    dividendSource:
      "https://docs.anchored.finance/getting-started/corporate-actions",
  },
  reality: {
    name: "Reality",
    short: "R",
    structure: "Asset-backed economic exposure",
    rights:
      "BG El Salvador, S.A. de C.V. issues rTokens. Reality describes segregated share backing; tokens do not confer legal share ownership or voting rights.",
    dividends:
      "The issuer says dividends are paid in stablecoins, rather than reinvested into token value.",
    exit: "Supported jurisdictions, KYC/AML, sanctions screening and product eligibility apply. A public backing statement does not establish unconditional direct redemption rights.",
    url: "https://realityfinance.xyz/",
    source: "https://realityfinance.xyz/",
    sourceLabel: "Issuer, rights & backing disclosure",
    eligibility: "https://realityfinance.xyz/",
    eligibilityLabel: "Eligibility & jurisdiction disclosure",
    reviewStatus: "partial",
  },
  st0x: {
    name: "ST0x",
    short: "S",
    structure: "Unsecured debt · wtStock wrapper",
    rights:
      "S01 Issuer GmbH issues tStock as an unsecured claim. wtStock wraps tStock. Neither grants company voting rights; issuer default can cause a total loss.",
    dividends:
      "For wtStock, dividends increase the tStock held per wrapper. The issuer says direct tStock dividend claiming is not live yet.",
    exit: "Unwrap wtStock before issuer exchange. Direct tStock-for-share redemption requires authorized-participant onboarding and an eligible broker. Other holders rely on venues.",
    url: "https://st0x.io/",
    source: "https://st0x.io/docs/legal",
    sourceLabel: "S01 legal structure & wrapper rights",
    eligibility: "https://st0x.io/docs/legal",
    eligibilityLabel: "Redemption & eligibility",
    reviewStatus: "reviewed",
  },
  stove: {
    name: "Stove",
    short: "S",
    structure: "Stock-linked economic exposure",
    rights:
      "Stove's current disclosure says tokens reference securities but grant no right to receive the underlying shares, vote, or claim against the referenced company. The applicable issuer is named in offering documents.",
    dividends:
      "Corporate-action entitlements must be checked in the specific offering documents; the reviewed public disclosure does not establish a universal dividend mechanism.",
    exit: "Offered outside the United States to non-U.S. persons under Regulation S. Onboarding documents govern transfer and redemption restrictions, fees and recourse.",
    url: "https://www.stove.finance/",
    source: "https://www.stove.finance/",
    sourceLabel: "Current issuer disclosure",
    eligibility:
      "https://docs.proto.stove.finance/documentation/protocol/eligibility.html",
    eligibilityLabel: "Eligibility & jurisdiction rules",
    reviewStatus: "partial",
  },
  rstock: {
    name: "rStocks · issuer unconfirmed",
    short: "r",
    structure: "Issuer not confirmed",
    rights:
      "The discovery naming pattern alone does not establish the legal issuer or holder rights. This record remains separate from Reality until native grouping confirms its identity.",
    dividends: "Not confirmed from an issuer-specific primary source.",
    exit: "Redemption rights and access conditions are not confirmed.",
    url: "https://www.coingecko.com/en/categories/tokenized-stock",
    source: "https://www.coingecko.com/en/categories/tokenized-stock",
    sourceLabel: "Discovery record · issuer review pending",
    eligibility: "https://www.coingecko.com/en/categories/tokenized-stock",
    eligibilityLabel: "Find product-specific issuer documents",
    reviewStatus: "unreviewed",
  },
};
export const TERMS_REVIEW_DATE = "2026-10-19";
for (const issuer of Object.values(issuers)) {
  issuer.reviewedAt = TERMS_REVIEW_DATE;
  issuer.reviewStatus ||= "reviewed";
}
