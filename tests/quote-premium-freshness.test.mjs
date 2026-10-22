import test from "node:test";
import assert from "node:assert/strict";
import { quoteTable } from "../src/views.mjs";

function fixture() {
  const now = Date.now();
  return {
    now,
    row: {
      id: "jupiter",
      issuer: "xstocks",
      symbol: "NVDAx",
      chain: "Solana",
      chainLabel: "Solana",
      address: "Mint",
      status: "quoted",
      rankable: true,
      effectivePrice: 110,
      equivalentShares: 10,
      // Effective price is already normalized; do not apply this ratio again.
      sharesPerToken: 2,
      tokenQuantity: 5,
      inputQuantity: 1100,
      fetchedAt: now - 1000,
      expiresAt: now + 30000,
      quoteProvider: "Jupiter",
      buyUrl: "https://jup.ag",
      explorerUrl: "https://solscan.io/token/Mint",
    },
    reference: {
      price: 100,
      currency: "USD",
      at: now - 1000,
      retrievedAt: new Date(now - 1000).toISOString(),
      priceSession: "Regular",
    },
  };
}

function assertNoComparison(html, { best = true } = {}) {
  assert.doesNotMatch(html, /quote-premium|Listed comparison/);
  assert.doesNotMatch(html, /adverse-quote|Large price difference/);
  // Reference availability must not change the best available quote.
  if (best) {
    assert.match(html, /quote-row best/);
    assert.match(html, /Most exposure/);
  }
}

test("aligned quotes compare their already normalized share price with the exact reference", () => {
  const { row, reference } = fixture();
  const html = quoteTable([row], { reference });
  assert.match(html, /\+10\.00% vs listed reference/);
  assert.match(html, /Large price difference/);
  assert.match(html, /<dt>Listed comparison<\/dt><dd>\$100\.00/);
  assert.match(
    html,
    /USDC treated as USD for this comparison; before network costs/,
  );
});

const invalidReferences = [
  ["undated reference", () => ({ at: undefined })],
  ["stale reference flag", () => ({ stale: true })],
  ["stale price flag", () => ({ priceStale: true })],
  ["old intraday reference", (now) => ({ at: now - 3600000 })],
  ["unaligned intraday reference", (now) => ({ at: now - 180000 })],
  ["future reference", (now) => ({ at: now + 120000 })],
  ["reference without a currency", () => ({ currency: undefined })],
  ["reference in another currency", () => ({ currency: "EUR" })],
];
for (const [name, overrides] of invalidReferences) {
  test(`quote premium is hidden for ${name}`, () => {
    const { row, reference, now } = fixture();
    assertNoComparison(
      quoteTable([row], { reference: { ...reference, ...overrides(now) } }),
    );
  });
}

const invalidQuotes = [
  ["undated quote", () => ({ fetchedAt: undefined })],
  ["old quote", (now) => ({ fetchedAt: now - 3600000 })],
  ["future quote", (now) => ({ fetchedAt: now + 60000 })],
  ["explicitly unverified conversion", () => ({ conversionVerified: false })],
  ["missing equivalent shares", () => ({ equivalentShares: null })],
  ["expired quote", (now) => ({ expiresAt: now - 1000 })],
  ["unranked quote", () => ({ rankable: false })],
  ["unavailable quote", () => ({ status: "unavailable" })],
];
for (const [name, overrides] of invalidQuotes) {
  test(`quote premium is hidden for ${name}`, () => {
    const { row, reference, now } = fixture();
    const quote = { ...row, ...overrides(now) };
    assertNoComparison(quoteTable([quote], { reference }), {
      best:
        quote.status === "quoted" &&
        quote.rankable &&
        Number.isFinite(quote.equivalentShares) &&
        quote.expiresAt > now,
    });
  });
}

test("a dated last close retrieved recently remains comparable", () => {
  const { row, reference, now } = fixture();
  const html = quoteTable([row], {
    reference: {
      ...reference,
      at: now - 86400000,
      priceSession: "Closed",
      priceDate: "2026-10-20",
    },
  });
  assert.match(html, /\+10\.00% vs listed last close/);
  assert.match(html, /<dt>Listed comparison<\/dt><dd>\$100\.00 · 2026-10-20/);
});

for (const [name, overrides] of [
  ["missing observation date", () => ({ at: undefined })],
  ["missing retrieval time", () => ({ retrievedAt: undefined })],
  [
    "old retrieval",
    (now) => ({ retrievedAt: new Date(now - 3600000).toISOString() }),
  ],
  [
    "future retrieval",
    (now) => ({ retrievedAt: new Date(now + 60000).toISOString() }),
  ],
  ["close older than a week", (now) => ({ at: now - 8 * 86400000 })],
]) {
  test(`last-close premium is hidden for ${name}`, () => {
    const { row, reference, now } = fixture();
    assertNoComparison(
      quoteTable([row], {
        reference: {
          ...reference,
          at: now - 86400000,
          priceSession: "Closed",
          ...overrides(now),
        },
      }),
    );
  });
}

test("reported price impact still warns when the listed comparison is unavailable", () => {
  const { row, reference } = fixture();
  const html = quoteTable([{ ...row, priceImpactPct: 6 }], {
    reference: { ...reference, at: undefined },
  });
  assert.doesNotMatch(html, /quote-premium|Listed comparison/);
  assert.match(html, /adverse-quote/);
  assert.match(html, /Large price difference/);
  assert.match(html, /<dt>Price impact<\/dt><dd>6\.00%/);
});
