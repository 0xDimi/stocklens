import test from "node:test";
import assert from "node:assert/strict";

// Public transport contract: partial results survive independently of stream completion.
test("NDJSON reader publishes prices before the done event and rejects truncated responses", async () => {
  const module = await import("../src/market-stream.mjs").catch(() => ({}));
  assert.equal(typeof module.readMarketDetails, "function");
  let release;
  const pause = new Promise((r) => (release = r)),
    seen = [];
  const encoder = new TextEncoder();
  const response = new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "row",
              row: { id: "A", reference: { price: 100 } },
            }) + "\n",
          ),
        );
        await pause;
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
        );
        controller.close();
      },
    }),
  );
  const job = module.readMarketDetails(["A"], {
    fetcher: async () => response,
    onRows: (rows) => seen.push(...rows),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen[0].reference.price, 100);
  release();
  const result = await job;
  assert.equal(result.rows[0].reference.price, 100);
  await assert.rejects(
    module.readMarketDetails(["A"], {
      fetcher: async () => new Response('{"type":"row","row":{"id":"A"}}\n'),
    }),
    /incomplete/i,
  );
});

test("overlapping server streams reuse active asset work and replay cached source dates", async () => {
  const module = await import("../server/market-stream.mjs").catch(() => ({}));
  assert.equal(typeof module.createMarketStream, "function");
  let calls = 0,
    release;
  const pause = new Promise((r) => (release = r));
  const stream = module.createMarketStream({
    getDetails: async (params, options) => {
      calls++;
      const rows = params
        .get("ids")
        .split(",")
        .map((id) => ({ id, reference: { price: 100, at: 1000 } }));
      rows.forEach(options.onRow);
      await pause;
      return { rows };
    },
  });
  const seen = [],
    params = new URLSearchParams({ ids: "A,B" });
  const one = stream(params, (row) => seen.push(row));
  await new Promise((r) => setTimeout(r, 10));
  const two = stream(new URLSearchParams({ ids: "B" }), () => {});
  release();
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  const cached = [];
  await stream(params, (row) => cached.push(row));
  assert.equal(calls, 1);
  assert.equal(cached[0].reference.at, 1000);
});

test("late subscribers replay partial prices before the pending page finishes", async () => {
  const { createMarketStream } = await import("../server/market-stream.mjs");
  let release;
  const pause = new Promise((r) => (release = r));
  const stream = createMarketStream({
    getDetails: async (params, options) => {
      options.onRow({ id: "A", reference: { price: 100, at: 123 } });
      await pause;
      return {
        rows: [{ id: "A", reference: { price: 100, at: 123 } }, { id: "B" }],
      };
    },
  });
  const first = stream(new URLSearchParams({ ids: "A,B" }), () => {});
  await new Promise(setImmediate);
  const seen = [];
  const second = stream(new URLSearchParams({ ids: "A" }), (row) =>
    seen.push(row),
  );
  await new Promise(setImmediate);
  const early = seen[0]?.reference?.price;
  release();
  await Promise.all([first, second]);
  assert.equal(early, 100);
});
