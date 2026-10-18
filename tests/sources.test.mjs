import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverProducts,
  mergeDiscovery,
  parseTokenMarkets,
  parseRwaTokens,
} from "../server/coingecko.mjs";
import { parsePools, parseHistory } from "../server/gecko.mjs";
const rawa = [
  { id: "nvidia", symbol: "nvda", name: "NVIDIA", asset_type: "stock" },
  {
    id: "alphabet-class-a",
    symbol: "googl",
    name: "Alphabet Class A",
    asset_type: "stock",
  },
];
const address = "0x" + "1".repeat(40);
test("CoinGecko discovery requires underlying identity and symbol corroboration; wrapped and mismatched products are excluded", () => {
  const coins = [
    {
      id: "nvidia-bstocks",
      name: "NVIDIA (bStocks Tokenized Stock)",
      symbol: "nvdab",
      platforms: { "binance-smart-chain": address },
    },
    {
      id: "nvidia-xstock",
      name: "NVIDIA xStock",
      symbol: "tslax",
      platforms: { ethereum: address },
    },
    {
      id: "wrapped-nvidia-xstock",
      name: "Wrapped NVIDIA xStock",
      symbol: "wnvdax",
      platforms: { ethereum: address },
    },
    {
      id: "alphabet-class-a-ondo-tokenized-stock",
      name: "Alphabet Class A (Ondo Tokenized Stock)",
      symbol: "googlon",
      platforms: { ethereum: address },
    },
  ];
  const found = discoverProducts(rawa, coins, "2026-10-19T00:00:00Z");
  assert.equal(found.find((s) => s.rwaId === "nvidia").products.length, 1);
  assert.equal(
    found.find((s) => s.rwaId === "nvidia").products[0].issuer,
    "bstocks",
  );
  assert.equal(
    found.find((s) => s.rwaId === "alphabet-class-a").products.length,
    1,
  );
});
test("discovery merges only corroborated underlying names and symbols, preserves ISIN URLs and issuer provenance", () => {
  const stocks = [
    {
      id: "US67066G1040",
      ticker: "NVDA",
      name: "NVIDIA",
      products: [
        {
          issuer: "xstocks",
          symbol: "NVDAx",
          source: "issuer",
          deployments: [{ chain: "Ethereum", address }],
        },
      ],
    },
  ];
  const d = discoverProducts(
    rawa,
    [
      {
        id: "nvidia-xstock",
        name: "NVIDIA xStock",
        symbol: "nvdax",
        platforms: { ethereum: address, base: "0x" + "2".repeat(40) },
      },
    ],
    "now",
  );
  const result = mergeDiscovery(stocks, d);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "US67066G1040");
  assert.equal(result[0].products[0].source, "issuer");
  assert.equal(result[0].products[0].coinId, "nvidia-xstock");
  assert.equal(result[0].products[0].deployments.length, 2);
  const conflict = mergeDiscovery(
    [
      {
        ...stocks[0],
        name: "Different Company",
        products: [
          {
            issuer: "xstocks",
            symbol: "NVDAx",
            deployments: [
              { chain: "Ethereum", address: "0x" + "3".repeat(40) },
            ],
          },
        ],
      },
    ],
    d,
  );
  assert.equal(conflict.length, 2);
});
test("native RWA grouping validates the requested asset and does not invent issuer rights", () => {
  const s = { rwaId: "nvidia", ticker: "NVDA" };
  assert.throws(() =>
    parseRwaTokens({ id: "tesla", symbol: "tsla", tokens: [] }, s),
  );
  const r = parseRwaTokens(
    {
      id: "nvidia",
      symbol: "nvda",
      tokens: [
        {
          id: "new-token",
          name: "New",
          symbol: "NVDA",
          issuer_details: { id: "other-ecosystem", name: "Other" },
          platforms: { base: address },
        },
      ],
    },
    s,
  );
  assert.equal(r[0].issuerName, "Other");
  assert.equal(r[0].mapping, "CoinGecko RWA grouping");
  assert.equal(r[0].deployments[0].chain, "Base");
});
test("token markets preserve nulls and source timestamps and reject unrelated IDs", () => {
  const r = parseTokenMarkets(
    [
      {
        id: "right",
        current_price: null,
        total_volume: null,
        last_updated: "2026-10-18T00:00:00Z",
      },
      { id: "wrong", current_price: 5 },
    ],
    ["right"],
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].price, null);
  assert.equal(r[0].volume24h, null);
  assert.equal(r[0].updatedAt, "2026-10-18T00:00:00Z");
});
const pool = (base, quote) => ({
  id: "eth_" + address,
  type: "pool",
  attributes: {
    address,
    name: "pair",
    base_token_price_usd: "10",
    quote_token_price_usd: "20",
    reserve_in_usd: "100",
    volume_usd: { h24: "50" },
    price_change_percentage: { h24: "2" },
  },
  relationships: {
    base_token: { data: { id: "eth_" + base } },
    quote_token: { data: { id: "eth_" + quote } },
    dex: { data: { id: "uniswap-v3" } },
  },
});
test("Gecko pools require an exact catalog contract, correct chain and orientation; fake same-ticker pools are rejected", () => {
  const stock = {
    products: [
      {
        issuer: "xstocks",
        symbol: "NVDAx",
        deployments: [{ chain: "Ethereum", address }],
      },
    ],
  };
  const r = parsePools(
    {
      data: [
        pool(address, "0x" + "2".repeat(40)),
        pool("0x" + "3".repeat(40), "0x" + "2".repeat(40)),
      ],
    },
    stock,
    "now",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].price, 10);
  assert.equal(r[0].orientation, "base");
  const q = parsePools(
    { data: [pool("0x" + "2".repeat(40), address)] },
    stock,
    "now",
  );
  assert.equal(q[0].price, 20);
  assert.equal(q[0].orientation, "quote");
  assert.equal(
    parsePools(
      { data: [{ ...pool(address, "other"), id: "base_" + address }] },
      stock,
      "now",
    ).length,
    0,
  );
});
test("OHLCV history validates chronological positive observations and never fills missing periods", () => {
  const r = parseHistory({
    data: {
      attributes: {
        ohlcv_list: [
          [20, 1, 3, 1, 2, 10],
          [10, 1, 2, 1, 1.5, 3],
          [30, 1, 2, 1, null, 4],
        ],
      },
    },
  });
  assert.deepEqual(
    r.map((p) => p.time),
    [10000, 20000],
  );
  assert.equal(r[0].price, 1.5);
  assert.throws(() => parseHistory({ data: {} }));
});

test("same-issuer exact contracts corroborate changed company names while retaining the security identifier", () => {
  const a = {
    id: "US30303M1027",
    ticker: "META",
    name: "Meta",
    products: [
      {
        issuer: "xstocks",
        symbol: "METAx",
        deployments: [{ chain: "Ethereum", address }],
      },
    ],
  };
  const b = {
    id: "cg:meta-platforms",
    rwaId: "meta-platforms",
    ticker: "META",
    name: "Meta Platforms",
    products: [
      {
        issuer: "xstocks",
        symbol: "METAx",
        coinId: "meta-xstock",
        deployments: [{ chain: "Ethereum", address }],
      },
    ],
  };
  const r = mergeDiscovery([a], [b]);
  assert.equal(r.length, 1);
  assert.equal(r[0].rwaId, "meta-platforms");
});

test("issuer tokens acquire CoinGecko market IDs by exact same-issuer contracts, never ticker alone", async () => {
  const { attachKnownProducts } = await import("../server/coingecko.mjs");
  const stocks = [
    {
      id: "security",
      products: [
        {
          issuer: "xstocks",
          symbol: "METAx",
          source: "issuer",
          deployments: [{ chain: "Ethereum", address }],
        },
      ],
    },
  ];
  const coin = {
    id: "meta-xstock",
    symbol: "metax",
    name: "Meta xStock",
    platforms: { ethereum: address, base: "0x" + "2".repeat(40) },
  };
  const r = attachKnownProducts(stocks, [coin], "now");
  assert.equal(r[0].products[0].coinId, "meta-xstock");
  assert.equal(r[0].products[0].source, "issuer");
  assert.equal(r[0].products[0].deployments.length, 2);
  assert.equal(
    attachKnownProducts(
      stocks,
      [{ ...coin, platforms: { ethereum: "0x" + "3".repeat(40) } }],
      "now",
    )[0].products[0].coinId,
    undefined,
  );
});

test("history range excludes observations outside elapsed bounds without filling gaps", () => {
  const rows = [
    [10, 1, 2, 1, 1.5, 3],
    [20, 1, 3, 1, 2, 4],
    [30, 1, 4, 1, 3, 5],
  ];
  assert.deepEqual(
    parseHistory(
      { data: { attributes: { ohlcv_list: rows } } },
      { since: 15000, until: 25000 },
    ).map((p) => p.time),
    [20000],
  );
});
test("native enrichment persists in the canonical catalog used by downstream views", async () => {
  const { resolveStock } = await import("../server/catalog.mjs");
  const old = {
    issuer: "xstocks",
    symbol: "NVDAx",
    deployments: [{ chain: "Ethereum", address }],
  };
  const added = {
    issuer: "other",
    symbol: "NVDA",
    deployments: [{ chain: "Base", address: "0x" + "4".repeat(40) }],
  };
  const catalog = {
    stocks: [
      {
        id: "security",
        rwaId: "nvidia",
        ticker: "NVDA",
        name: "NVIDIA",
        products: [old],
      },
    ],
    warnings: [],
    fetchedAt: "now",
  };
  const dependencies = {
    getCatalog: async () => catalog,
    getNative: async () => ({ products: [added] }),
  };
  const enriched = await resolveStock("security", true, dependencies);
  assert.equal(enriched.stock.products.length, 2);
  const downstream = await resolveStock("security", false, dependencies);
  assert.equal(downstream.stock.products.length, 2);
});

test("native RWA grouping excludes wrapped products as discovery does", () => {
  const result = parseRwaTokens(
    {
      id: "nvidia",
      symbol: "nvda",
      tokens: [
        {
          id: "wrapped-nvidia-xstock",
          name: "Wrapped NVIDIA xStock",
          symbol: "wnvdax",
          issuer_details: { id: "xstocks-ecosystem", name: "xStocks" },
          platforms: { ethereum: address },
        },
      ],
    },
    { rwaId: "nvidia", ticker: "NVDA" },
  );
  assert.equal(result.length, 0);
});

test('OHLCV emits real candle values, rejects malformed bars and does not bridge gaps', () => {
  const points=parseHistory({data:{attributes:{ohlcv_list:[
    [10,2,4,1,3,50],[30,3,5,2,4,60],
    [40,3,2,1,2,10],[50,null,4,1,2,10],[60,2,4,3,2,10],
  ]}}});
  assert.deepEqual(points.map(p=>p.time),[10000,30000]);
  assert.deepEqual(points[0],{time:10000,open:2,high:4,low:1,close:3,price:3,volume:50});
});

test('OHLCV rejects boolean fields that could masquerade as a one-dollar price', () => {
  assert.equal(parseHistory({data:{attributes:{ohlcv_list:[[10,true,2,1,2,3]]}}}).length,0);
});
