import test from "node:test";
import assert from "node:assert/strict";
import { createStockPages } from "../src/stock-pages.mjs";

// Rendering does not need browser layout. Keep a minimal DOM boundary while
// exercising the actual page controller, API ingestion and generated markup.
class RenderNode extends EventTarget {
  innerHTML = "";
  hidden = false;
  setAttribute() {}
  contains() {
    return false;
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return new RenderNode();
  }
  append() {}
  remove() {}
}
const stock = {
  id: "msft",
  name: "Microsoft",
  ticker: "MSFT",
  category: "Stock",
  products: [],
};
const now = Date.now();
const reference = {
  price: 110,
  at: now,
  priceDate: "2026-10-21",
  priceSession: "Closed",
  source: "https://listed.test/latest",
};
const buy = {
  price: 102,
  value: 2,
  referencePrice: 100,
  referenceAt: now - 120000,
  referenceDate: null,
  referenceBasis: "contemporaneous",
  priceAt: now,
  expiresAt: now + 300000,
  symbol: "MSFTx",
  issuer: "xstocks",
  chain: "Solana",
  source: "https://quotes.test/msft",
  referenceSource: "https://listed.test/original",
  conversionSource: "https://issuer.test/shares",
  sharesPerToken: 1,
};
async function render(t, detail, comparison = false, options = {}) {
  const document = new RenderNode();
  document.body = new RenderNode();
  document.createElement = () => new RenderNode();
  const root = new RenderNode(),
    compareRoot = new RenderNode();
  root.ownerDocument = document;
  const pages = createStockPages({
    root,
    compareRoot,
    getStocks: () => [stock],
    getMarkets: () => new Map(),
    api: async (path) => {
      if (path.startsWith("/api/market-details") && options.failDetails?.())
        throw new Error("Listed-security request unavailable");
      return path.startsWith("/api/products")
        ? { stock, rows: [] }
        : path.startsWith("/api/screener")
          ? { rows: [{ id: stock.id, market: null }] }
          : { rows: [{ id: stock.id, ...detail }] };
    },
  });
  t.after(() => pages.destroy());
  await (comparison
    ? pages.openComparison([stock.id])
    : pages.openStock(stock.id));
  return {
    html: (comparison ? compareRoot : root).innerHTML,
    pages,
    root,
    compareRoot,
  };
}
const band = (html) =>
  html.match(
    /<div class="stock-price-band">([\s\S]*?)<div class="stock-price stock-aggregate-reference">/,
  )?.[1] || html;
const row = (html, label) =>
  html.match(
    new RegExp(`<tr><th scope="row">${label}</th>([\\s\\S]*?)</tr>`),
  )?.[1] || "";

test("overview shows the normalized buy fallback with the exact listed comparison price", async (t) => {
  const { html } = await render(t, {
    reference,
    spotPremium: null,
    premium: buy,
  });
  const prices = band(html);
  assert.match(prices, /\$102\.00/);
  assert.match(prices, /\+2\.00%/);
  assert.match(prices, /\$1,000 (?:indicative )?buy/);
  assert.match(prices, /\$100\.00/);
  assert.doesNotMatch(
    prices,
    /\$110\.00|2026-10-21|Share-normalized spot premium/,
  );
  assert.match(prices, /https:\/\/listed\.test\/original/);
});

test("overview displays raw verified onchain prices without inventing a listed premium", async (t) => {
  const { html } = await render(t, {
    reference: null,
    buyObservation: { ...buy, value: undefined, conversionVerified: true },
  });
  const prices = band(html);
  assert.match(prices, /\$102\.00/);
  assert.match(prices, /Listed price required/);
  assert.doesNotMatch(prices, /\+2\.00%/);
});

test("overview prefers a current buy over an older pool and dates retained pool observations", async (t) => {
  const oldPool = {
    ...buy,
    price: 99,
    value: -1,
    priceAt: now - 600000,
    expiresAt: now - 300000,
    retained: true,
  };
  const current = await render(t, {
    reference,
    spotPremium: oldPool,
    premium: buy,
  });
  assert.match(band(current.html), /\$102\.00/);
  assert.doesNotMatch(band(current.html), /\$99\.00/);
  const retained = await render(t, { reference, spotPremium: oldPool });
  assert.match(band(retained.html), /\$99\.00/);
  assert.match(band(retained.html), /Older observation/);
});

test("stock comparison uses the same buy fallback and its listed observation", async (t) => {
  const { html } = await render(t, { reference, premium: buy }, true);
  assert.match(row(html, "Onchain price"), /\$102\.00/);
  assert.match(row(html, "Onchain price"), /\$1,000 (?:indicative )?buy/);
  assert.match(row(html, "Onchain premium"), /\+2\.00%/);
  assert.match(row(html, "Listed price"), /\$100\.00/);
  assert.doesNotMatch(row(html, "Listed price"), /\$110\.00|2026-10-21/);
});

test("stock comparison shows raw pool prices while withholding unaligned premiums", async (t) => {
  const { html } = await render(
    t,
    {
      reference,
      spot: { ...buy, at: now, conversionVerified: true },
    },
    true,
  );
  assert.match(row(html, "Onchain price"), /\$102\.00/);
  assert.match(row(html, "Onchain price"), /Pool snapshot/);
  assert.match(row(html, "Onchain premium"), /Prices not time-aligned/);
  assert.doesNotMatch(row(html, "Onchain premium"), /\+2\.00%/);
});

test("profile excludes unverified, future and over-day observations", async (t) => {
  for (const detail of [
    { spot: { ...buy, at: now, conversionVerified: false } },
    { premium: { ...buy, priceAt: now + 3600000 } },
    { premium: { ...buy, priceAt: now - 86400001 } },
  ]) {
    const { html } = await render(t, { reference, ...detail });
    assert.doesNotMatch(band(html), /\$102\.00|\+2\.00%/);
  }
});

test("failed profile refresh retains all price observations as older without losing the comparable premium", async (t) => {
  const observations = {
    spotPremium: buy,
    spot: { ...buy, priceAt: undefined, at: now, conversionVerified: true },
    premium: buy,
    buyObservation: { ...buy, conversionVerified: true },
  };
  for (const comparison of [false, true]) {
    let failed = false;
    const { pages, root, compareRoot } = await render(
      t,
      { reference, ...observations },
      comparison,
      { failDetails: () => failed },
    );
    failed = true;
    await pages.refresh();
    const prices = comparison ? compareRoot.innerHTML : band(root.innerHTML);
    assert.match(prices, /\+2\.00%/);
    assert.match(prices, /Older observation/);
    const retained = pages.details(stock.id);
    for (const [field, original] of Object.entries(observations))
      assert.deepEqual(retained[field], { ...original, stale: true }, field);
    assert.equal(retained.reference.at, reference.at);
    assert.equal(retained.reference.priceStale, true);
    assert.equal(retained.reference.marketCapStale, true);
    assert.equal(retained.reference.peStale, true);
  }
});
