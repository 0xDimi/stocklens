import { issuers, TERMS_REVIEW_DATE } from "./data.mjs";

// Keep these keys stable: the same rows drive issuer summaries and comparison.
export const PRODUCT_TERM_DEFINITIONS = Object.freeze(
  [
    { key: "claim", label: "Legal claim" },
    { key: "dividends", label: "Dividends" },
    { key: "voting", label: "Voting rights" },
    { key: "access", label: "Primary-market access" },
    { key: "redemption", label: "Redemption route" },
    { key: "minimum", label: "Redemption minimum" },
  ].map(Object.freeze),
);

export const PRODUCT_TERMS_REVIEW_DATE = "2026-10-21";

const sources = {
  xstocks: "https://docs.xstocks.fi/docs/product-legal-overview",
  xstocksAccess: "https://docs.xstocks.fi/docs/issuance-and-redemption",
  xstocksDividends: "https://docs.xstocks.fi/docs/dividends-and-stock-splits",
  ondo: "https://docs.ondo.finance/ondo-stocks/legal-and-regulatory",
  ondoAccess: "https://docs.ondo.finance/ondo-stocks/onboarding-and-kyc",
  ondoDividends: "https://docs.ondo.finance/ondo-stocks/fees-and-taxes",
  ondoRedemption:
    "https://docs.ondo.finance/ondo-stocks/investing-and-redeeming",
  bstocks:
    "https://www.binance.com/en-AE/support/faq/detail/f0c03cd6509a4085b4cce1636f16be38",
  robinhood: "https://robinhood.com/rhj/stocktokens/",
  dinari: "https://docs.dinari.com/docs/faqs",
  coinbase: "https://www.coinbase.com/en-ca/tokenize",
  backpack:
    "https://learn.backpack.exchange/blog/introducing-backpack-securities",
  backpackDividends:
    "https://learn.backpack.exchange/blog/tokenized-spacex-spcx",
  anchored: "https://docs.anchored.finance/",
  anchoredAccess: "https://docs.anchored.finance/getting-started/eligibility",
  anchoredDividends:
    "https://docs.anchored.finance/getting-started/corporate-actions",
  reality: "https://realityfinance.xyz/",
  st0x: "https://st0x.io/docs/legal",
  stove: "https://www.stove.finance/",
};

// A missing field means this field was not reviewed. Never derive rights from
// a structure name, asset backing, transferability, token symbol or venue access.
// Each tuple is [compact value, exact supporting page, optional qualification].
const reviewed = {
  xstocks: {
    claim: ["Bearer debt · tracker certificate", sources.xstocks],
    dividends: ["Reinvested through multiplier", sources.xstocksDividends],
    voting: ["No shareholder voting rights", sources.xstocks],
    access: ["KYC/AML + whitelisted wallet", sources.xstocksAccess],
    redemption: ["Issuer platform after onboarding", sources.xstocksAccess],
  },
  ondo: {
    claim: ["Structured note · issuer debt", sources.ondo],
    dividends: [
      "Reinvested · net of withholding",
      sources.ondoDividends,
      "Dividends are reinvested net of applicable withholding taxes. Confirm the current token-to-share conversion separately.",
    ],
    voting: ["No shareholder voting rights", sources.ondo],
    access: ["KYC/KYB · supported jurisdictions", sources.ondoAccess],
    redemption: ["Direct issuer · onboarding required", sources.ondo],
    minimum: [
      "US$1 · direct issuer",
      sources.ondoRedemption,
      "Ondo's published minimum to invest or redeem is US$1. Venue order minimums are separate.",
    ],
  },
  bstocks: {
    claim: ["Certificate · no direct share ownership", sources.bstocks],
    dividends: ["Reinvested · offering terms apply", sources.bstocks],
    voting: ["No direct shareholder voting rights", sources.bstocks],
    access: ["Issuer conditions · venue restrictions", sources.bstocks],
    redemption: [
      "Unavailable to Binance FZE clients",
      sources.bstocks,
      "The cited Binance FZE FAQ says direct minting and redemption are currently unavailable to its clients. This restriction is venue-specific; issuer conditions apply elsewhere.",
    ],
  },
  robinhood: {
    claim: ["Debt security · Robinhood Assets (Jersey)", sources.robinhood],
    dividends: ["Reinvested through multiplier", sources.robinhood],
    access: [
      "Issuer redemption: KYC/AML",
      sources.robinhood,
      "The reviewed onchain FAQ describes KYC/AML for direct issuer redemption. Primary issuance onboarding was not reviewed. Jurisdiction restrictions apply.",
    ],
    redemption: [
      "Issuer fallback where no AP is available",
      sources.robinhood,
      "The onchain Stock Tokens FAQ permits direct issuer redemption where there is no authorized participant, subject to KYC/AML. Secondary-market sales are a separate route. Classic Stock Tokens use different terms.",
    ],
  },
  dinari: {
    claim: ["Separate security · backed by shares", sources.dinari],
    dividends: [
      "Stablecoin cash payments · net of fees",
      sources.dinari,
      "The FAQ describes automated stablecoin dividends paid to the holder's wallet and a standard dividend-distribution fee. Consult the current fee schedule.",
    ],
    access: ["KYC required for direct purchases", sources.dinari],
    redemption: [
      "Sell order burns dShares for proceeds",
      sources.dinari,
      "Dinari describes a sell order burning dShares and releasing payment proceeds. Partner and product access conditions still apply.",
    ],
  },
  coinbase: {
    claim: ["Direct senior claim on underlying equity", sources.coinbase],
    dividends: [
      "Reinvested through multiplier · net of fees",
      sources.coinbase,
    ],
    access: ["KYC-onboarded institutions / APs", sources.coinbase],
    redemption: ["Institutional partners / APs only", sources.coinbase],
  },
  backpack: {
    claim: ["Token convertible to brokerage entitlement", sources.backpack],
    dividends: ["Reinvested into tokenized shares", sources.backpackDividends],
    redemption: [
      "Deposit through Backpack Securities",
      sources.backpack,
      "Backpack describes converting tokenized securities into brokerage security entitlements through deposits. Brokerage account access and the applicable product terms are required.",
    ],
  },
  anchored: {
    claim: [
      "Not disclosed in reviewed overview",
      sources.anchored,
      "The reviewed overview describes asset backing and regulated custody, but does not establish the precise legal claim or insolvency priority.",
    ],
    dividends: [
      "USDC to account wallet · net of costs",
      sources.anchoredDividends,
    ],
    access: [
      "Professional / qualified investors · KYC/KYB",
      sources.anchoredAccess,
    ],
    redemption: [
      "Onboarding and eligibility restrictions",
      sources.anchoredAccess,
      "Eligibility restrictions cover redemptions. The redemption procedure and settlement route were not reviewed; transferability alone does not establish direct redemption access.",
    ],
  },
  // Retain the existing October 19 review. The website could not be re-fetched
  // on October 21; no additional terms are inferred from its backing statement.
  reality: {
    claim: ["Economic exposure · no legal share ownership", sources.reality],
    dividends: ["Stablecoin payments", sources.reality],
    voting: ["No company voting rights", sources.reality],
    access: ["KYC/AML · supported jurisdictions", sources.reality],
  },
  st0x: {
    claim: ["Unsecured debt claim on S01", sources.st0x],
    voting: ["No company voting rights", sources.st0x],
    access: [
      "Authorised Participants · onboarding",
      sources.st0x,
      "Direct exchange with S01 requires Authorised Participant onboarding and an account at an eligible broker. Other holders buy and sell at trading venues.",
    ],
    redemption: ["tStock → shares at eligible broker", sources.st0x],
    minimum: [
      "US$10 · tStock exchange",
      sources.st0x,
      "The US$10 token-value minimum applies to direct tStock-for-share exchange by onboarded Authorised Participants with an eligible broker. wtStock must first be unwrapped.",
    ],
  },
  stove: {
    claim: ["Economic exposure · no right to underlying shares", sources.stove],
    voting: ["No shareholder voting rights", sources.stove],
    access: [
      "Non-U.S. persons outside the U.S.",
      sources.stove,
      "The disclosure describes Regulation S offers outside the United States to non-U.S. persons and other jurisdiction restrictions. Specific primary-market KYC requirements were not reviewed.",
    ],
    redemption: [
      "Offering documents govern restrictions",
      sources.stove,
      "The public disclosure identifies transfer and redemption restrictions. The product-specific settlement route, fees and minimum were not reviewed.",
    ],
  },
};

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const own = (object, key) =>
  Object.hasOwn(object, key) ? object[key] : undefined;

function isWrapper(product) {
  return (
    product.wrapped === true ||
    /^wrapped[ -]/i.test(product.name || product.coinId || "") ||
    (product.issuer === "st0x" && /^wt[a-z0-9]+$/i.test(product.symbol || ""))
  );
}

function unknownTerm(
  definition,
  detail = "Product-specific documentation has not been reviewed for this term.",
) {
  return { ...definition, value: "Not reviewed", detail };
}

/** Return six source-backed term rows, in PRODUCT_TERM_DEFINITIONS order.
 * Sources are URL strings. Missing sources always remain explicit review gaps.
 * Returned objects are independent copies and can be formatted by the caller.
 */
export function productTerms(product = {}) {
  product ||= {};
  const info = own(issuers, product.issuer);
  const terms = own(reviewed, product.issuer);
  if (!terms)
    return PRODUCT_TERM_DEFINITIONS.map((definition) =>
      unknownTerm(definition),
    );

  const wrapped = isWrapper(product);
  if (wrapped && product.issuer !== "st0x") {
    return PRODUCT_TERM_DEFINITIONS.map((definition) => ({
      ...unknownTerm(
        definition,
        "This wrapper has not had a separate legal review. Underlying issuer terms do not establish the wrapper holder's claim, corporate-action treatment or direct redemption access.",
      ),
      ...(definition.key === "claim"
        ? { value: "Wrapper · rights not reviewed" }
        : {}),
    }));
  }

  return PRODUCT_TERM_DEFINITIONS.map((definition) => {
    let entry = terms[definition.key];
    if (product.issuer === "st0x") {
      if (definition.key === "claim" && wrapped)
        entry = ["wtStock wraps unsecured tStock", sources.st0x];
      if (definition.key === "redemption" && wrapped)
        entry = [
          "Unwrap to tStock → eligible broker",
          sources.st0x,
          "Unwrap wtStock to tStock before exchange. Direct exchange with S01 requires Authorised Participant onboarding and an eligible broker; other holders rely on trading venues.",
        ];
      if (definition.key === "dividends")
        entry = wrapped
          ? [
              "More tStock per wrapper",
              sources.st0x,
              "For wtStock, dividends increase the tStock held per wrapper. Direct tStock dividend claiming is not live in the reviewed disclosure.",
            ]
          : /^t[a-z0-9]+$/i.test(product.symbol || "")
            ? ["tStock dividend claiming not live", sources.st0x]
            : [
                "Depends on tStock / wtStock form",
                sources.st0x,
                "wtStock accumulates more tStock per wrapper. Direct tStock dividend claiming is not live in the reviewed disclosure. Confirm the exact token form.",
              ];
    }
    if (!entry) return unknownTerm(definition);
    const [value, source, qualification] = entry;
    const detail =
      qualification ||
      (definition.key === "claim"
        ? info.rights
        : definition.key === "dividends"
          ? info.dividends
          : definition.key === "redemption"
            ? info.exit
            : undefined);
    return { ...definition, value, source, ...(detail ? { detail } : {}) };
  });
}

/** Comparison rows contain one complete term object in values per product. */
export function termComparisonRows(products = []) {
  const columns = products.map(productTerms);
  return PRODUCT_TERM_DEFINITIONS.map((definition, index) => ({
    ...definition,
    values: columns.map((terms) => terms[index]),
  }));
}

// Rendering never trusts source or discovery URLs supplied by a catalog record.
function sourceLink(url, label) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return "";
    return `<a href="${escape(parsed.href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
  } catch {
    return "";
  }
}

/** Compact, keyboard-accessible summary with native expandable source detail. */
export function renderProductTerms(product = {}) {
  product ||= {};
  const terms = productTerms(product);
  const info = own(issuers, product.issuer);
  const pending = !terms.some((term) => term.source);
  const reviewDate =
    product.issuer === "reality"
      ? TERMS_REVIEW_DATE
      : PRODUCT_TERMS_REVIEW_DATE;
  const review = pending
    ? "Review pending"
    : `${info?.reviewStatus === "partial" ? "Partial source review" : "Source review"} · ${reviewDate}`;
  return `<section class="product-terms" aria-label="${escape(product.symbol || info?.name || "Token")} product terms"><dl class="product-terms-grid">${terms.map((term) => `<div class="product-term"><dt>${escape(term.label)}</dt><dd>${escape(term.value)}</dd></div>`).join("")}</dl><details class="product-terms-legal"><summary>Legal details &amp; sources</summary><p class="product-terms-review">${escape(review)}. Product-specific offering documents and venue rules apply.</p>${product.issuer === "reality" ? '<p class="product-terms-review">The October 19 source review is retained; the issuer website could not be rechecked on October 21.</p>' : ""}<dl class="product-terms-sources">${terms.map((term) => `<div><dt>${escape(term.label)}</dt><dd>${escape(term.detail || term.value)}${term.source ? ` ${sourceLink(term.source, `${term.label} source`)}` : ""}</dd></div>`).join("")}</dl></details></section>`;
}
