import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import * as adapters from "../server/public-quote-providers.mjs";
import { request } from "../server/http.mjs";

test("a valid fast Raydium quote survives a Jupiter provider that never settles", async () => {
  assert.equal(typeof adapters.settleQuoteProviders, "function");
  const observed = {
    id: "raydium",
    status: "quoted",
    fetchedAt: 100,
    expiresAt: 30100,
    outputAmount: "5000",
  };
  const started = Date.now();
  const results = await adapters.settleQuoteProviders(
    [() => Promise.resolve(observed), () => new Promise(() => {})],
    started + 35,
  );
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value, observed);
  assert.equal(results[1].status, "rejected");
  assert.ok(Date.now() - started < 250);
  assert.equal(
    results[0].value.expiresAt,
    30100,
    "Original expiry must not be extended",
  );
});

test("Jupiter rejects jobs that cannot fit the remaining deadline without sending them", async () => {
  assert.equal(typeof adapters.createJupiterRequester, "function");
  const received = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const load = adapters.createJupiterRequester({ intervalMs: 60 });
  try {
    assert.deepEqual(
      await load(url + "/first", { deadlineAt: Date.now() + 1000 }),
      { ok: true },
    );
    await assert.rejects(
      load(url + "/expired", { deadlineAt: Date.now() + 15 }),
      /deadline|capacity|timed out/i,
    );
    assert.deepEqual(received, ["/first"]);
    assert.deepEqual(
      await load(url + "/next", { deadlineAt: Date.now() + 1000 }),
      { ok: true },
    );
    assert.deepEqual(received, ["/first", "/next"]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Jupiter caps an active HTTP request by its quote deadline", async () => {
  assert.equal(typeof adapters.createJupiterRequester, "function");
  let closed;
  const disconnected = new Promise((resolve) => {
    closed = resolve;
  });
  const server = createServer((req) => req.once("close", closed));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const load = adapters.createJupiterRequester({ intervalMs: 1 });
  try {
    const started = Date.now();
    await assert.rejects(
      load(`http://127.0.0.1:${server.address().port}`, {
        deadlineAt: started + 35,
      }),
    );
    await disconnected;
    assert.ok(Date.now() - started < 250);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("comparison retains a real HTTP Raydium response while another provider exceeds the deadline", async () => {
  const { collectQuoteOptions } = await import("../server/quotes.mjs");
  const { parseRaydium } = await import("../server/providers.mjs");
  const { normalizeQuote } = await import("../src/model.mjs");
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: {
          inputMint: "usdc",
          outputMint: "mint",
          inputAmount: "1000000000",
          outputAmount: "5000000000",
          routePlan: [{ poolId: "verified-response-pool" }],
        },
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const product = { issuer: "xstocks", symbol: "NVDAx" };
  const deployment = { chain: "Solana", address: "mint" };
  let sourceObservation;
  try {
    const rows = await collectQuoteOptions([{ product, deployment }], "1000", {
      budgetMs: 150,
      getOptions: async (_product, _deployment, _amount, { deadlineAt }) => {
        const results = await adapters.settleQuoteProviders(
          [
            async () => {
              const response = await request(
                `http://127.0.0.1:${server.address().port}`,
              );
              const raw = parseRaydium(
                response,
                deployment,
                { usdc: "usdc" },
                "1000000000",
              );
              const fetchedAt = Date.now();
              sourceObservation = {
                id: "raydium",
                status: "quoted",
                ...normalizeQuote({
                  ...raw,
                  inputDecimals: 6,
                  outputDecimals: 9,
                  sharesPerToken: 1,
                  fetchedAt,
                }),
                outputAmount: raw.outputAmount,
              };
              return sourceObservation;
            },
            () => new Promise(() => {}),
          ],
          deadlineAt,
        );
        return results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
      },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "quoted");
    assert.equal(rows[0].outputAmount, "5000000000");
    assert.equal(rows[0].equivalentShares, 5);
    assert.equal(rows[0].expiresAt, sourceObservation.expiresAt);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
