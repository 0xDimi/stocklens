import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { applyCatalogReferences } from "../server/catalog-identities.mjs";
import {
  createCachedCatalogLoader,
  createCatalogLoader,
  resolveStock,
} from "../server/catalog.mjs";
const at = "2026-10-21T13:34:11.445Z";
const nativeId = "direxion-daily-semi-bull-3x-etf";
const contract = "0xd318bbbe6b6e83f74e7acaeb5e94c08ddbdb44c0";
function rows() {
  return [
    {
      id: "US25459W4583",
      ticker: "SOXL",
      name: "Direxion Semiconductor Bull 3X",
      category: "ETF",
      sourceAt: at,
      products: [
        {
          issuer: "ondo",
          symbol: "SOXLon",
          source: "https://ondo.finance/global-markets",
          sourceAt: at,
          deployments: [{ chain: "Ethereum", address: contract }],
        },
      ],
    },
    {
      id: "cg:" + nativeId,
      rwaId: nativeId,
      ticker: "SOXL",
      name: "Direxion Daily Semi Bull 3X ETF",
      category: "ETF",
      sourceAt: at,
      products: [
        {
          issuer: "reality",
          symbol: "RSOXL",
          coinId: "direxion-daily-semiconductor-bull-3x-shares-etf-rstock",
          sourceAt: at,
          deployments: [
            {
              chain: "Arbitrum",
              address: "0x25501fea0562fa74dab22dc09dd3f994d5558dce",
            },
          ],
        },
      ],
    },
  ];
}
test("Ondo exact native contract consolidates duplicate rows and keeps the previous native URL", async () => {
  const stocks = applyCatalogReferences(rows());
  assert.equal(stocks.length, 1);
  const stock = stocks[0];
  assert.equal(stock.id, "US25459W4583");
  assert.equal(stock.name, "Direxion Daily Semiconductor Bull 3X ETF");
  assert.equal(stock.rwaId, nativeId);
  assert.deepEqual(
    stock.products.map((p) => p.issuer),
    ["ondo", "reality"],
  );
  assert.equal(stock.products[0].sourceAt, at);
  assert.ok(stock.aliases.includes("cg:" + nativeId));
  assert.match(stock.rwaSource.mapping, /underlying ISIN/i);
  const resolved = await resolveStock("cg:" + nativeId, false, {
    getCatalog: async () => ({ stocks, warnings: [], fetchedAt: at }),
  });
  assert.equal(resolved.stock.id, stock.id);
  assert.deepEqual(
    applyCatalogReferences(stocks),
    stocks,
    "normalization is idempotent",
  );
});
test("ticker and underlying ISIN cannot substitute for an exact issuer contract", () => {
  for (const mutate of [
    (p) => (p.deployments[0].address = "0x" + "1".repeat(40)),
    (p) => (p.issuer = "reality"),
    (p) => (p.symbol = "SOXSOn"),
    (p) => (p.deployments[0].chain = "Base"),
  ]) {
    const stocks = rows();
    mutate(stocks[0].products[0]);
    assert.equal(applyCatalogReferences(stocks).length, 2);
    assert.equal(stocks[0].rwaId, undefined);
  }
});
for (const seed of [false, true])
  test(`${seed ? "checksummed seed" : "existing disk cache"} removes previously persisted duplicate identities before refresh`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "stocklens-identity-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const snapshot = {
      schemaVersion: 1,
      savedAt: at,
      sources: {},
      catalog: {
        stocks: rows(),
        coverage: { assets: 2, versions: 2 },
        sources: [],
        warnings: [],
        fetchedAt: at,
      },
    };
    const seedPath = join(root, "seed.json.gz");
    await writeFile(
      seed ? seedPath : join(root, "canonical-catalog-v1.json"),
      seed
        ? gzipSync(
            JSON.stringify({
              snapshot,
              sha256: createHash("sha256")
                .update(JSON.stringify(snapshot))
                .digest("hex"),
            }),
          )
        : JSON.stringify(snapshot),
    );
    const offline = async () => {
      throw new Error("source offline");
    };
    const load = createCachedCatalogLoader({
      cacheDir: root,
      seedPath: seed ? seedPath : null,
      now: () => Date.parse(at),
      getXstocks: offline,
      getOndo: offline,
      getDiscovery: offline,
    });
    const result = await load();
    assert.equal(result.stocks.length, 1);
    assert.equal(result.coverage.assets, 1);
    assert.equal(result.coverage.versions, 2);
    assert.equal(result.stocks[0].rwaId, nativeId);
  });
test("fresh catalog joins the reviewed native RWA after Ondo official contracts attach", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "stocklens-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const official = rows()[0],
    native = rows()[1];
  const result = await createCatalogLoader({
    cacheDir: root,
    seedPath: null,
    now: () => Date.parse(at),
    getXstocks: async () => [
      {
        symbol: "SOXLx",
        isin: "CH0000000001",
        name: official.name + " xStock",
        underlying: { symbol: "SOXL", isin: official.id, type: "ETF" },
        deployments: [{ network: "Ethereum", address: "0x" + "2".repeat(40) }],
      },
    ],
    getOndo: async () => [
      {
        ISIN: official.id,
        Type: "ETF",
        Symbol: "SOXLon",
        "Stock Ticker": "SOXL",
        "Stock Name": official.name,
        "Ethereum Deployed Address": contract,
      },
    ],
    getDiscovery: async () => ({
      registry: [],
      retrievedAt: at,
      stocks: [native],
    }),
  })();
  assert.equal(result.stocks.length, 1);
  assert.equal(result.stocks[0].id, official.id);
  assert.ok(result.stocks[0].products.some((p) => p.issuer === "ondo"));
  assert.ok(result.stocks[0].products.some((p) => p.issuer === "reality"));
});

test("reviewed real issuer records bind all nine independently corroborated native groups", async () => {
  const { readFile } = await import("node:fs/promises");
  const { stocks } = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/reviewed-native-issuer-identities.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const expected = {
    SOXL: "direxion-daily-semi-bull-3x-etf",
    PALL: "abrdn-physical-palladium-shares-etf",
    PPLT: "abrdn-physical-platinum-shares-etf",
    ASML: "asml-holding-nv",
    IEMG: "ishares-core-msci-emerging-markets-etf",
    DELL: "dell",
    DFDV: "defi-development-corp",
    XLE: "state-street-energy-select-sector-spdr-fund",
    VCX: "fundrise-innovation-fund",
  };
  for (const stock of stocks) {
    const result = applyCatalogReferences([stock])[0];
    assert.equal(result.rwaId, expected[stock.ticker], stock.ticker);
    assert.equal(result.id, stock.id);
    assert.ok(result.aliases.includes("cg:" + expected[stock.ticker]));
    if (stock.products.some((p) => p.issuer === "xstocks")) {
      const forged = structuredClone(stock);
      forged.products.find((p) => p.issuer === "xstocks").isin = "CH0000000000";
      delete forged.rwaId;
      assert.equal(
        applyCatalogReferences([forged])[0].rwaId,
        undefined,
        "a mismatched token ISIN must reject " + stock.ticker,
      );
    }
  }
});

test("a native ID cannot bypass a contradictory underlying ticker", () => {
  const stocks = rows();
  stocks[1].ticker = "SOXS";
  const result = applyCatalogReferences(stocks);
  assert.equal(result.length, 2);
  assert.equal(result[1].ticker, "SOXS");
  assert.equal(result[0].products.length, 1);
});

test("a contradictory native RWA identifier cannot overwrite a reviewed binding", () => {
  const stocks = rows();
  stocks[1].rwaId = "direxion-daily-semi-bear-3x-etf";
  const result = applyCatalogReferences(stocks);
  assert.equal(result.length, 2);
  assert.equal(result[0].rwaId, nativeId);
});

test("repeated XLE normalization retains the native ETF classification", async () => {
  const { readFile } = await import("node:fs/promises");
  const { stocks } = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/reviewed-native-issuer-identities.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const xle = stocks.find((stock) => stock.ticker === "XLE");
  assert.equal(xle.category, "Listed security");
  const native = {
    id: "cg:state-street-energy-select-sector-spdr-fund",
    rwaId: "state-street-energy-select-sector-spdr-fund",
    ticker: "XLE",
    name: "State Street Energy Select Sector SPDR Fund",
    category: "ETF",
    products: [],
  };
  const first = applyCatalogReferences([xle, native]);
  assert.equal(first.length, 1);
  assert.equal(first[0].category, "ETF");
  const expected = structuredClone(first);
  const second = applyCatalogReferences(first);
  assert.equal(second[0].category, "ETF");
  assert.deepEqual(second, expected);
});

test("reviewed listed-stock metadata preserves an existing Stock classification", async () => {
  const { readFile } = await import("node:fs/promises");
  const { stocks } = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/reviewed-native-issuer-identities.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const ticker of ["ASML", "DFDV"]) {
    const stock = stocks.find((stock) => stock.ticker === ticker);
    stock.category = "Stock";
    assert.equal(applyCatalogReferences([stock])[0].category, "Stock", ticker);
  }
});

test("Nasdaq Stock classification corrects the previous VCX ETF category before native consolidation", async () => {
  const { readFile } = await import("node:fs/promises");
  const { stocks } = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/reviewed-native-issuer-identities.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const vcx = stocks.find((stock) => stock.ticker === "VCX");
  const native = {
    id: "cg:fundrise-innovation-fund",
    rwaId: "fundrise-innovation-fund",
    ticker: "VCX",
    category: "Stock",
    products: [],
  };
  const first = applyCatalogReferences([vcx, native]);
  // Nasdaq returns VCX only under assetclass=stocks; its ETF info has no data.
  assert.equal(first[0].category, "Stock");
  const expected = structuredClone(first);
  assert.deepEqual(applyCatalogReferences(first), expected);
});

test("all nine reviewed identities corroborate actual Nasdaq names, asset classes, and prices", async () => {
  const { readFile } = await import("node:fs/promises");
  const { parseFundamentals } = await import("../server/fundamentals.mjs");
  const { stocks } = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/reviewed-native-issuer-identities.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const { observations } = JSON.parse(
    await readFile(
      new URL("./fixtures/reviewed-listed-identity-info.json", import.meta.url),
      "utf8",
    ),
  );
  const normalized = applyCatalogReferences(stocks);
  for (const observation of observations) {
    const stock = normalized.find(
      (stock) => stock.ticker === observation.info.data.symbol,
    );
    assert.equal(
      stock.name,
      observation.info.data.companyName.trim(),
      stock.ticker,
    );
    assert.equal(
      stock.category,
      observation.info.data.assetClass === "ETF" ? "ETF" : "Stock",
      stock.ticker,
    );
    assert.equal(stock.identitySource.url, observation.source, stock.ticker);
    const fundamentals = parseFundamentals(
      observation.info,
      null,
      stock,
      observation.retrievedAt,
    );
    assert.ok(
      fundamentals.price > 0,
      stock.ticker + " actual Nasdaq price is available",
    );
  }
});
