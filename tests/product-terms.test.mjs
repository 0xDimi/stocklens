import test from "node:test";
import assert from "node:assert/strict";
import {
  productTerms,
  renderProductTerms,
  termComparisonRows,
} from "../src/product-terms.mjs";

const term = (product, key) =>
  productTerms(product).find((row) => row.key === key);

test("unknown identities cannot acquire reviewed issuer rights from discovery data", () => {
  for (const issuer of ["new-issuer", "rstock", "constructor", "__proto__"]) {
    const rows = productTerms({ issuer, source: "javascript:alert(1)" });
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.value === "Not reviewed"));
    assert.ok(rows.every((row) => !row.source));
  }
});

test("a partial disclosure never becomes a claim of shareholder rights or a zero minimum", () => {
  assert.equal(
    term({ issuer: "anchored" }, "claim").value,
    "Not disclosed in reviewed overview",
  );
  assert.equal(term({ issuer: "anchored" }, "voting").value, "Not reviewed");
  assert.equal(term({ issuer: "coinbase" }, "voting").value, "Not reviewed");
  assert.equal(term({ issuer: "xstocks" }, "minimum").value, "Not reviewed");
  assert.match(
    term({ issuer: "bstocks" }, "redemption").value,
    /Unavailable to Binance FZE clients/,
  );
});

test("published primary redemption minimums retain their eligible route", () => {
  assert.equal(
    term({ issuer: "ondo" }, "minimum").value,
    "US$1 · direct issuer",
  );
  const st0x = { issuer: "st0x", symbol: "wtNVDA", wrapped: true };
  assert.equal(term(st0x, "minimum").value, "US$10 · tStock exchange");
  assert.match(term(st0x, "minimum").detail, /Authorised Participants/);
  assert.match(term(st0x, "redemption").value, /Unwrap to tStock/);
  assert.match(term(st0x, "redemption").detail, /eligible broker/i);
});

test("generic wrappers do not inherit primary access, dividend mechanics or redemption", () => {
  for (const product of [
    { issuer: "xstocks", wrapped: true },
    { issuer: "xstocks", name: "Wrapped NVIDIA xStock" },
  ]) {
    assert.match(term(product, "claim").value, /Wrapper/);
    assert.match(term(product, "dividends").value, /Not reviewed/);
    assert.match(term(product, "redemption").value, /Not reviewed/);
    assert.match(term(product, "minimum").value, /Not reviewed/);
    assert.match(term(product, "redemption").detail, /wrapper/i);
  }
  assert.match(
    term({ issuer: "st0x", symbol: "tNVDA" }, "dividends").value,
    /claiming not live/i,
  );
  assert.match(
    term({ issuer: "st0x", symbol: "wtNVDA", wrapped: true }, "dividends")
      .value,
    /tStock per wrapper/,
  );
});

test("comparison keeps each product aligned to the same term without mutating source rows", () => {
  const products = [{ issuer: "ondo" }, { issuer: "rstock" }];
  const rows = termComparisonRows(products);
  assert.deepEqual(
    rows.map((row) => row.key),
    productTerms(products[0]).map((row) => row.key),
  );
  assert.equal(
    rows.find((row) => row.key === "minimum").values[1].value,
    "Not reviewed",
  );
  rows[0].values[0].value = "changed";
  assert.notEqual(productTerms(products[0])[0].value, "changed");
  assert.deepEqual(
    termComparisonRows([]).map((row) => row.values),
    [[], [], [], [], [], []],
  );
});

test("rendered terms expose native disclosure, text labels and only safe source links", () => {
  const html = renderProductTerms({
    issuer: "ondo",
    symbol: '<img src=x onerror="alert(1)">',
  });
  assert.match(html, /<dl/);
  assert.match(html, /<dt>Redemption minimum<\/dt>/);
  assert.match(html, /<details/);
  assert.match(html, /<summary>Legal details &amp; sources<\/summary>/);
  assert.match(html, /https:\/\/docs\.ondo\.finance/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<img|onerror="/);
  const unknown = renderProductTerms({
    issuer: "<script>alert(1)</script>",
    source: "javascript:alert(1)",
  });
  assert.doesNotMatch(unknown, /href=|<script|javascript:/);
  assert.match(unknown, /Review pending/);
});
