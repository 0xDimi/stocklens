import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { request } from "../server/http.mjs";
import { quoteFailure, quoteUnavailable } from "../src/quote-support.mjs";
test("public quote HTTP errors retain safe reasons without reflecting raw provider text", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "ESTIMATED_LOSS_GREATER_THAN_MAX_IMPACT",
        private: "must-not-be-reflected",
        priceRoute: { data: "x".repeat(20000) },
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await assert.rejects(
      request(`http://127.0.0.1:${server.address().port}/`),
      (e) => {
        assert.equal(e.status, 400);
        assert.equal(e.quoteFailureKind, "price-impact");
        assert.doesNotMatch(e.message, /private|must-not/);
        assert.equal(quoteFailure(e).kind, "price-impact");
        assert.equal(
          quoteUnavailable([quoteFailure(e)]).availability,
          "price-impact",
        );
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("explicit public quota exhaustion is classified as a request limit", () => {
  assert.equal(
    quoteFailure(
      new Error(
        "LI.FI public quote quota reached. Try again after its two-hour window resets.",
      ),
    ).kind,
    "rate-limited",
  );
});
