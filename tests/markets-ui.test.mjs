import test from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/market-model.mjs";
import * as page from "../src/markets-page.mjs";

const observation = (now) => ({
  value: 2.5,
  symbol: "NVDAx",
  chain: "Solana",
  price: 102.5,
  sharesPerToken: 1,
  priceAt: now,
  referenceAt: now,
  retrievedAt: new Date(now).toISOString(),
  source: "https://example.org/pool",
  conversionSource: "https://example.org/conversion",
  expiresAt: now + 30000,
  basis:
    "Observed onchain spot price normalized to equivalent shares; not an executable quote.",
});

test("expired observed premiums stay identifiable as historical observations without becoming zero", () => {
  assert.equal(typeof model.observedPremiumState, "function");
  const p = observation(100000);
  assert.deepEqual(model.observedPremiumState(p, 120000), {
    value: 2.5,
    stale: false,
  });
  assert.deepEqual(model.observedPremiumState(p, 130000), {
    value: 2.5,
    stale: true,
  });
  assert.equal(model.observedPremiumState(null, 130000), null);
  assert.equal(model.observedPremiumState({ ...p, value: null }, 130000), null);
});

test("visible detail loading is bounded, coalesces duplicate selections and retains earlier pages", async () => {
  assert.equal(typeof model.createMarketDetailsLoader, "function");
  const pending = [];
  const loader = model.createMarketDetailsLoader({
    fetchDetails: (ids) =>
      new Promise((resolve) => pending.push({ ids, resolve })),
    now: () => 100000,
  });
  const ids = Array.from({ length: 25 }, (_, i) => `stock-${i}`);
  loader.load(ids);
  loader.load(ids);
  await new Promise(setImmediate);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].ids.length, 5);
  assert.equal(pending[1].ids.length, 5);
  assert.equal(loader.get("stock-0").status, "loading");
  while (pending.some((r) => !r.done)) {
    const requests = pending.filter((r) => !r.done);
    for (const r of requests) {
      r.done = true;
      r.resolve({
        rows: r.ids.map((id) => ({
          id,
          reference: { marketCap: 100, pe: null },
          premium: null,
          premiumReason: "No verified conversion",
        })),
        retrievedAt: "1970-01-01T00:01:40.000Z",
      });
    }
    await new Promise(setImmediate);
  }
  assert.equal(pending.length, 5);
  assert.equal(loader.get("stock-24").status, "ready");
  loader.load(["next-page"]);
  await new Promise(setImmediate);
  assert.equal(loader.get("stock-0").reference.marketCap, 100);
  loader.ingestReference("stock-0", { marketCap: 200 });
  assert.equal(loader.get("stock-0").premiumReason, "No verified conversion");
  loader.load(ids);
  assert.equal(
    pending.length,
    6,
    "returning to a cached page must not refetch",
  );
  pending[5].resolve({
    rows: [{ id: "next-page", reference: null, premium: null }],
    retrievedAt: "1970-01-01T00:01:40.000Z",
  });
});

test("request failures are distinct from successful missing values and retry only after cooldown", async () => {
  assert.equal(typeof model.createMarketDetailsLoader, "function");
  let now = 100000;
  let fail = true;
  const loader = model.createMarketDetailsLoader({
    now: () => now,
    fetchDetails: async (ids) => {
      if (fail) throw new Error("Provider offline");
      return {
        rows: ids.map((id) => ({
          id,
          reference: null,
          referenceReason: "No corroborated listed reference",
          premium: null,
          premiumReason: "No verified share conversion",
        })),
        retrievedAt: new Date(now).toISOString(),
      };
    },
  });
  loader.load(["a"]);
  await new Promise(setImmediate);
  assert.equal(loader.get("a").status, "error");
  assert.match(loader.get("a").error, /offline/);
  fail = false;
  loader.load(["a"]);
  assert.equal(loader.get("a").status, "error");
  now += 61000;
  loader.load(["a"]);
  await new Promise(setImmediate);
  assert.equal(loader.get("a").status, "ready");
  assert.equal(loader.get("a").reference, null);
});

test("superseded page requests are cancelled and cannot overwrite the new page", async () => {
  assert.equal(typeof model.createMarketDetailsLoader, "function");
  const pending = [];
  const loader = model.createMarketDetailsLoader({
    fetchDetails: (ids, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ ids, signal, resolve });
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  });
  loader.load(["old"]);
  await new Promise(setImmediate);
  loader.load(["new"]);
  await new Promise(setImmediate);
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].ids[0], "new");
  pending[1].resolve({
    rows: [{ id: "new", reference: null, premium: null }],
    retrievedAt: new Date().toISOString(),
  });
  await new Promise(setImmediate);
  assert.equal(loader.get("new").status, "ready");
  assert.notEqual(loader.get("old")?.status, "error");
});

test("company metrics separate inapplicable ETF values, source outages and undisclosed ratios", () => {
  assert.equal(typeof model.companyMetricState, "function");
  assert.deepEqual(
    model.companyMetricState(
      { category: "ETF" },
      { status: "error", error: "Offline" },
      "pe",
    ),
    { value: null, state: "not-applicable" },
  );
  assert.deepEqual(
    model.companyMetricState(
      { category: "Stock" },
      { status: "ready", reference: { pe: null, peStatus: "unavailable" } },
      "pe",
    ),
    { value: null, state: "unavailable" },
  );
  assert.deepEqual(
    model.companyMetricState(
      { category: "Stock" },
      { status: "ready", reference: { pe: null, peStatus: "not-reported" } },
      "pe",
    ),
    { value: null, state: "not-reported" },
  );
  assert.deepEqual(
    model.companyMetricState(
      { category: "Stock" },
      { status: "error", error: "Offline" },
      "pe",
    ),
    { value: null, state: "error" },
  );
  assert.deepEqual(
    model.companyMetricState(
      { category: "Stock" },
      { status: "loading", reference: { pe: 20, peStatus: "available" } },
      "pe",
    ),
    { value: 20, state: "available" },
  );
});

test("a failed source refresh keeps the last known company data and premium with stale provenance", async () => {
  const p = observation(100000);
  let refresh = false;
  const loader = model.createMarketDetailsLoader({
    now: () => 100000,
    fetchDetails: async () => ({
      rows: [
        {
          id: "a",
          reference: refresh
            ? null
            : {
                marketCap: 120,
                pe: 20,
                retrievedAt: "1970-01-01T00:01:40.000Z",
              },
          premium: refresh ? null : p,
          referenceReason: refresh ? "Nasdaq source unavailable" : null,
          premiumReason: refresh ? "Price source unavailable" : null,
        },
      ],
      retrievedAt: "1970-01-01T00:01:40.000Z",
    }),
  });
  loader.load(["a"]);
  await new Promise(setImmediate);
  loader.ingestReference("a", {
    marketCap: 121,
    pe: 20,
    retrievedAt: "1970-01-01T00:01:40.000Z",
  });
  assert.equal(loader.get("a").premium.value, 2.5);
  refresh = true;
  loader.load(["a"], { force: true });
  await new Promise(setImmediate);
  assert.equal(loader.get("a").reference.marketCap, 121);
  assert.equal(loader.get("a").reference.marketCapStale, true);
  assert.equal(loader.get("a").reference.peStale, true);
  assert.equal(loader.get("a").premium.value, 2.5);
  assert.match(loader.get("a").reference.staleReason, /unavailable/);
});

// Minimal DOM boundary: the browser owns focus changes when a focused node is
// removed. These cases exercise our preservation rules, not browser semantics.
function focusFixture({ key = "asset:pe:summary", moveDuringRender = false } = {}) {
  const document = { body: {}, activeElement: null };
  const old = { dataset: { marketFocus: key } };
  const replacement = {
    dataset: { marketFocus: key },
    focus() {
      document.activeElement = this;
    },
  };
  const outside = { id: "market-search" };
  const container = {
    ownerDocument: document,
    contains: (element) => element === old,
    querySelectorAll: () => [replacement],
    set innerHTML(value) {
      this.markup = value;
      if (document.activeElement === old) document.activeElement = document.body;
      if (moveDuringRender) document.activeElement = outside;
    },
  };
  document.activeElement = old;
  return { document, old, replacement, outside, container };
}
test("market rendering restores the same control identity after replacing table rows", () => {
  assert.equal(typeof page.renderMarketBody, "function");
  const state = focusFixture();
  page.renderMarketBody(state.container, "updated rows");
  assert.equal(state.document.activeElement, state.replacement);
  assert.equal(state.container.markup, "updated rows");
});
test("market rendering leaves focus outside the table alone", () => {
  assert.equal(typeof page.renderMarketBody, "function");
  const state = focusFixture();
  state.document.activeElement = state.outside;
  page.renderMarketBody(state.container, "updated rows");
  assert.equal(state.document.activeElement, state.outside);
});
test("market rendering does not steal focus moved while rows were replaced", () => {
  assert.equal(typeof page.renderMarketBody, "function");
  const state = focusFixture({ moveDuringRender: true });
  page.renderMarketBody(state.container, "updated rows");
  assert.equal(state.document.activeElement, state.outside);
});
test("market refresh waits for the feed before requesting forced details", async () => {
  assert.equal(typeof page.refreshMarketPage, "function");
  let finish;
  const events = [];
  const work = page.refreshMarketPage(
    () =>
      new Promise((resolve) => {
        finish = resolve;
        events.push("feed pending");
      }),
    () => events.push("details refreshed"),
    (error) => events.push(error.message),
  );
  assert.deepEqual(events, ["feed pending"]);
  finish();
  await work;
  assert.deepEqual(events, ["feed pending", "details refreshed"]);
});
test("a rejected market refresh reports the error and still refreshes independent details", async () => {
  assert.equal(typeof page.refreshMarketPage, "function");
  const events = [];
  await page.refreshMarketPage(
    async () => {
      throw new Error("Feed unavailable");
    },
    () => events.push("details refreshed"),
    (error) => events.push(error.message),
  );
  assert.deepEqual(events, ["Feed unavailable", "details refreshed"]);
});
test("market rendering restores disclosure state before focusing its nested link", () => {
  const state = focusFixture({ key: "asset:pe:source" });
  let disclosureOpen = false;
  state.replacement.focus = () => {
    if (disclosureOpen) state.document.activeElement = state.replacement;
  };
  page.renderMarketBody(state.container, "updated rows", () => {
    disclosureOpen = true;
  });
  assert.equal(state.document.activeElement, state.replacement);
});
