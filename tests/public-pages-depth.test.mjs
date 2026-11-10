import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { summarizeDepth } from "../server/buy-depth.mjs";

test("depth requires a fresh baseline and reports only tested sizes within one percent", () => {
  const now = Date.now();
  const quote = (effectivePrice, expiresAt = now + 1000) => ({
    status: "quoted",
    effectivePrice,
    expiresAt,
    quoteProvider: "Test",
  });
  assert.equal(
    summarizeDepth(
      [quote(100), quote(101), quote(101.01), quote(100, now)],
      now,
    ).largestTested,
    1000,
  );
  assert.equal(summarizeDepth([null, quote(101)], now).largestTested, null);
});

test("stock and issuer pages expose crawler metadata and reject unknown assets", async (t) => {
  const stock = {
    id: "US67066G1040",
    ticker: "NVDA",
    name: "NVIDIA & Co.",
    products: [{ issuer: "xstocks" }],
  };
  const server = createApp({ getCatalog: async () => ({ stocks: [stock] }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const paths = [
    "/stock/NVDA",
    "/issuer/xstocks",
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
    "/stock/UNKNOWN",
    "/?stock=US67066G1040",
  ];
  const result = await Promise.all(paths.map((path) => fetch(base + path)));
  assert.deepEqual(
    result.map((response) => response.status),
    [200, 200, 200, 200, 200, 404, 200],
  );
  assert.match(await result[0].text(), /og:title.*NVIDIA &amp; Co\./);
  assert.match(await result[1].text(), /og:title.*xStocks/);
  assert.match(await result[2].text(), /<loc>[^<]+\/stock\/NVDA<\/loc>/);
  assert.match(await result[3].text(), /Sitemap: .*\/sitemap.xml/);
  assert.equal(result[4].headers.get("content-type"), "image/x-icon");
  assert.match(
    await result[6].text(),
    /rel="canonical" href="[^"]+\/stock\/NVDA"/,
  );
});
