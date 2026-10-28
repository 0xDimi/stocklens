import test from "node:test";
import assert from "node:assert/strict";
import { marketDetailsView } from "../server/market-details.mjs";
import * as model from "../src/market-model.mjs";
import { priceComparison } from "../src/reference-view.mjs";

const stock = {
  id: "US67066G1040",
  ticker: "NVDA",
  name: "NVIDIA",
  category: "Stock",
  products: [],
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test("listed prices publish while an independent pool source is still pending", async () => {
  const spots = deferred(),
    published = [];
  const run = marketDetailsView(new URLSearchParams({ ids: stock.id }), {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => ({ price: 100, currency: "USD", at: Date.now() }),
    getSpots: () => spots.promise,
    quote: async () => null,
    onRow: (row) => published.push(row),
    quotes: false,
  });
  await new Promise((r) => setTimeout(r, 20));
  const early = published.find((r) => r.reference?.price === 100);
  spots.resolve(new Map());
  await run;
  assert.ok(early, "do not hold a listed price behind the pool request");
  assert.equal(early.components.spot, "loading");
  assert.equal(published.at(-1).components.spot, "unavailable");
});

test("field merging keeps a valid reference when a newer view has no reference", () => {
  assert.equal(typeof model.mergeMarketDetails, "function");
  const reference = { price: 100, at: 1000, currency: "USD" };
  const result = model.mergeMarketDetails(
    { reference, checkedAt: 100 },
    { reference: null, spot: { price: 101, at: 1100 }, checkedAt: 200 },
  );
  assert.equal(result.reference.price, 100);
  assert.equal(result.reference.at, 1000);
  assert.equal(result.spot.price, 101);
  assert.equal(result.checkedAt, 200);
});

test("partial component loading does not call a pending listed price Not supplied", () => {
  const html = priceComparison({
    components: { reference: "loading", spot: "ready" },
  });
  assert.match(html, /Loading listed price/);
  assert.doesNotMatch(html, /not supplied/i);
});

test("market page applies a streamed reference before its request completes", async () => {
  let finish;
  const pending = new Promise((r) => (finish = r));
  const loader = model.createMarketDetailsLoader({
    batchSize: 25,
    maxActive: 1,
    fetchDetails: async (ids, signal, publish) => {
      publish([
        {
          id: ids[0],
          reference: { price: 100 },
          components: { reference: "ready", spot: "loading" },
        },
      ]);
      await pending;
      return { rows: ids.map((id) => ({ id, reference: { price: 100 } })) };
    },
  });
  loader.load(Array.from({ length: 25 }, (_, i) => "stock-" + i));
  await new Promise((r) => setTimeout(r, 20));
  const early = loader.get("stock-0").reference?.price;
  finish();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(early, 100);
});

test("external completion does not leave an idle page permanently loading", () => {
  const loader = model.createMarketDetailsLoader({
    fetchDetails: async () => ({ rows: [] }),
  });
  loader.ingestDetails("a", {
    status: "loading",
    components: { reference: "loading" },
  });
  loader.ingestDetails("a", {
    status: "ready",
    reference: { price: 100 },
    checkedAt: 1000,
  });
  assert.equal(loader.get("a").status, "ready");
});

test("all listed-price jobs finish before optional company requests start", async () => {
  const stocks = Array.from({ length: 8 }, (_, i) => ({
    ...stock,
    id: "stock-" + i,
  }));
  let priceReads = 0,
    earlyCompany = false;
  await marketDetailsView(
    new URLSearchParams({ ids: stocks.map((s) => s.id).join(",") }),
    {
      getCatalog: async () => ({ stocks }),
      onRow: () => {},
      quotes: false,
      getSpots: async () => new Map(),
      getReference: async (s, { priceOnly }) => {
        if (priceOnly) priceReads++;
        else if (priceReads !== stocks.length) earlyCompany = true;
        return { price: 100, currency: "USD", at: Date.now() };
      },
    },
  );
  assert.equal(priceReads, 8);
  assert.equal(earlyCompany, false);
});

test("missing-pool fallback checks one preferred route and leaves liquid pool rows alone", async () => {
  const stocks = ["pool", "missing"].map((id) => ({
    ...stock,
    id,
    products: [
      {
        issuer: "xstocks",
        name: "NVIDIA xStock",
        symbol: "NVDAx",
        deployments: [
          { chain: "Solana", address: "mint" },
          { chain: "Ethereum", address: "0x" + "1".repeat(40) },
        ],
      },
    ],
  }));
  const seen = [];
  const result = await marketDetailsView(
    new URLSearchParams({ ids: "pool,missing" }),
    {
      getCatalog: async () => ({ stocks }),
      quotes: "missing",
      priceOnly: true,
      getReference: async () => ({
        price: 100,
        at: Date.now(),
        currency: "USD",
      }),
      getSpots: async () =>
        new Map([
          [
            "pool",
            {
              price: 100,
              at: Date.now(),
              currency: "USD",
              conversionVerified: true,
            },
          ],
        ]),
      quote: async (product, deployment) => {
        seen.push(deployment.chain);
        return {
          status: "quoted",
          effectivePrice: 101,
          equivalentShares: 1000 / 101,
          fetchedAt: Date.now(),
          sharesPerToken: 1,
        };
      },
    },
  );
  assert.deepEqual(seen, ["Solana"]);
  assert.equal(
    result.rows.find((r) => r.id === "missing").buyObservation.price,
    101,
  );
  assert.equal(result.rows.find((r) => r.id === "pool").buyObservation, null);
});

test("completed company refreshes distinguish missing reports from retained failures", () => {
  const prior = {
    reference: {
      price: 100,
      at: 1000,
      pe: 25,
      peStatus: "available",
      peStale: false,
      peRetrievedAt: "2026-10-28T10:00:00Z",
    },
  };
  const missing = model.mergeMarketDetails(prior, {
    components: { company: "ready" },
    reference: { price: 101, at: 2000, pe: null, peStatus: "not-reported" },
  });
  assert.equal(missing.reference.pe, null);
  const failed = model.mergeMarketDetails(prior, {
    components: { company: "ready" },
    reference: { price: 101, at: 2000, pe: null, peStatus: "unavailable" },
  });
  assert.equal(failed.reference.pe, 25);
  assert.equal(failed.reference.peStale, true);
});

test("forced requests during an active page load queue the expanded data requirements", async () => {
  const pending = [];
  const loader = model.createMarketDetailsLoader({
    fetchDetails: (ids) =>
      new Promise((resolve) => pending.push({ ids, resolve })),
  });
  loader.load(["A"]);
  await new Promise(setImmediate);
  loader.load(["A"], { force: true });
  pending[0].resolve({ rows: [{ id: "A", reference: { price: 100 } }] });
  await new Promise(setImmediate);
  assert.equal(pending.length, 2);
  pending[1].resolve({
    rows: [{ id: "A", reference: { price: 100, pe: 25 } }],
  });
  await new Promise(setImmediate);
  assert.equal(loader.get("A").reference.pe, 25);
});

test("new company observations merge independently of a newer listed price", () => {
  const result = model.mergeMarketDetails(
    {
      reference: {
        price: 102,
        at: 2000,
        pe: 20,
        peRetrievedAt: "2026-10-28T10:00:00Z",
      },
    },
    {
      components: { company: "ready" },
      reference: {
        price: 101,
        at: 1000,
        pe: 25,
        peRetrievedAt: "2026-10-28T11:00:00Z",
      },
    },
  );
  assert.equal(result.reference.price, 102);
  assert.equal(result.reference.pe, 25);
});

test("failed optional company request does not turn an info-only response into confirmed missing metrics", async () => {
  const data = await marketDetailsView(new URLSearchParams({ ids: stock.id }), {
    getCatalog: async () => ({ stocks: [stock] }),
    quotes: false,
    onRow: () => {},
    getSpots: async () => new Map(),
    getReference: async (s, options) =>
      options?.priceOnly
        ? { price: 101, at: 2000, pe: null, peStatus: "not-reported" }
        : null,
  });
  const row = data.rows[0];
  assert.equal(row.components.company, "unavailable");
  const merged = model.mergeMarketDetails(
    {
      reference: {
        price: 100,
        at: 1000,
        pe: 25,
        peRetrievedAt: "2026-10-28T10:00:00Z",
      },
    },
    row,
  );
  assert.equal(merged.reference.pe, 25);
  assert.equal(merged.reference.peStale, true);
});

test("a stock overview upgrades an info-only Markets snapshot without waiting for cache expiry", async () => {
  const model = await import("../src/asset-comparison-model.mjs");
  assert.equal(typeof model.needsCompanyDetails, "function");
  assert.equal(
    model.needsCompanyDetails({ components: { company: "idle" } }),
    true,
  );
  assert.equal(
    model.needsCompanyDetails({ components: { company: "loading" } }),
    true,
  );
  assert.equal(
    model.needsCompanyDetails({ components: { company: "ready" } }),
    false,
  );
  assert.equal(
    model.needsCompanyDetails({ components: { company: "unavailable" } }),
    false,
  );
});

test("company loading text does not claim that a pending source omitted its metric", async () => {
  const { profileMetric } = await import("../src/asset-comparison-model.mjs");
  const loading = profileMetric(
    { category: "Stock" },
    {
      loading: true,
      components: { company: "loading" },
      reference: { pe: null, peReason: "Nasdaq did not report P/E" },
    },
    "pe",
  );
  assert.equal(loading.label, "Loading…");
  assert.doesNotMatch(loading.note, /did not report/);
  const done = profileMetric(
    { category: "Stock" },
    {
      loading: true,
      components: { company: "ready" },
      reference: { pe: null, peReason: "Nasdaq did not report P/E" },
    },
    "pe",
  );
  assert.equal(done.label, "Unavailable");
});

test("missing-pool fallback allows metadata and routing within the shared observation deadline", async () => {
  const item = {
    ...stock,
    products: [
      {
        issuer: "xstocks",
        name: "NVIDIA xStock",
        symbol: "NVDAx",
        deployments: [{ chain: "Solana", address: "mint" }],
      },
    ],
  };
  const result = await marketDetailsView(
    new URLSearchParams({ ids: item.id }),
    {
      getCatalog: async () => ({ stocks: [item] }),
      quotes: "missing",
      priceOnly: true,
      getReference: async () => ({
        price: 100,
        at: Date.now(),
        currency: "USD",
      }),
      getSpots: async () => new Map(),
      quote: async (product, deployment, amount, { deadlineAt }) => {
        assert.ok(
          deadlineAt - Date.now() >= 17000,
          "Do not time out a valid metadata-plus-route lookup at ten seconds",
        );
        return {
          status: "quoted",
          effectivePrice: 101,
          equivalentShares: 1000 / 101,
          fetchedAt: Date.now(),
        };
      },
    },
  );
  assert.equal(result.rows[0].buyObservation?.price, 101);
});
