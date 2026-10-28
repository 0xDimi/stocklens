import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = (process.env.STOCKLENS_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const evidence = [];
async function read(path, status = 200) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(45000),
    redirect: "manual",
  });
  assert.equal(response.status, status, path);
  const data = await response.json();
  evidence.push({ path, status });
  return data;
}
const catalog = await read("/api/catalog"),
  landscape = await read("/api/issuers");
assert.equal(
  landscape.issuers.length,
  new Set(catalog.stocks.flatMap((s) => s.products.map((p) => p.issuer))).size,
);
assert.ok(
  landscape.totals.reportingIssuers >= 2,
  "Real issuer reports must be available, not just the catalog shell",
);
const sum = landscape.issuers.reduce(
  (n, r) => n + (r.market?.marketCap ?? 0),
  0,
);
assert.ok(Math.abs(sum - landscape.totals.marketCap) < 0.01);
assert.ok(
  Math.abs(
    landscape.issuers.reduce((n, r) => n + (r.market?.share || 0), 0) - 100,
  ) < 1e-6,
);
for (const row of landscape.issuers)
  if (row.market) {
    assert.ok(Number.isFinite(Date.parse(row.market.sourceAt)));
    assert.ok(
      row.market.apiSource.startsWith(
        "https://api.coingecko.com/api/v3/rwas/issuers/",
      ),
    );
  }
const nvda = await read("/api/issuer-assets?issuer=ondo&q=NVDA&type=Stock");
assert.equal(nvda.total, 1);
assert.equal(nvda.rows[0].id, "US67066G1040");
assert.ok(
  nvda.rows[0].products.every((p) => p.issuer === "ondo" && !p.wrapped),
);
assert.ok(
  nvda.rows[0].products.some((p) => p.market?.price > 0),
  "A real NVIDIA token price must load through the issuer endpoint",
);
await read("/api/issuer-assets?issuer=not-an-issuer", 400);
await read("/api/issuer-assets?issuer=ondo&page=0", 400);
const summary = {
  at: new Date().toISOString(),
  base,
  status: "passed",
  issuers: landscape.issuers.length,
  reportedCaps: landscape.totals.reportingIssuers,
  marketCap: landscape.totals.marketCap,
  marketSourceRange: [
    landscape.coverage.oldestSourceAt,
    landscape.coverage.newestSourceAt,
  ],
  nvdaToken: nvda.rows[0].products.find((p) => p.market?.price > 0)?.symbol,
  evidence,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/issuer-integration.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
