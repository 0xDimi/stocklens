import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { sourceClient } from "../server/source-client.mjs";
test("HTTP 429 applies a source-wide cooldown across different endpoints", async (t) => {
  let calls = 0;
  const app = createServer((req, res) => {
    calls++;
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end("{}");
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "cooldown-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
  );
  await assert.rejects(api("/first"));
  await assert.rejects(api("/second"));
  assert.equal(calls, 1);
});
