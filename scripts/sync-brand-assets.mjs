// Refresh reviewed brand assets from source metadata. Run manually; never on requests.
import { mkdir, writeFile, readFile, access, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { safeLogo } from "../src/brands.mjs";
const folder = new URL("../assets/logos/", import.meta.url);
await mkdir(folder, { recursive: true });
const manifest = await readFile(new URL("sources.json", folder), "utf8")
  .then((t) => JSON.parse(t).images)
  .catch(() => []);
async function save(name, url) {
  try {
    try {
      await access(new URL(name + ".png", folder));
      return;
    } catch {}
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 500000 || b.length < 50)
      throw new Error("Image size outside bounds");
    const target = new URL(name + ".png", folder);
    if (b.toString("hex", 0, 8) === "89504e470d0a1a0a")
      await writeFile(target, b);
    else {
      if (!/^image\//.test(r.headers.get("content-type") || ""))
        throw new Error("Not an image");
      const temp = new URL(name + ".source", folder);
      await writeFile(temp, b);
      try {
        execFileSync(
          "sips",
          ["-s", "format", "png", temp.pathname, "--out", target.pathname],
          { stdio: "pipe" },
        );
      } finally {
        await unlink(temp).catch(() => {});
      }
    }
    manifest.push({
      file: name + ".png",
      source: url,
      checkedAt: new Date().toISOString(),
    });
    console.log("saved", name, b.length);
  } catch (e) {
    console.log("unavailable", name, e.message);
  }
}
const chainPaths = {
  Solana: "solana",
  Ethereum: "ethereum",
  BinanceSmartChain: "smartchain",
  Base: "base",
  Arbitrum: "arbitrum",
  Avalanche: "avalanchec",
  Polygon: "polygon",
  Optimism: "optimism",
  Tron: "tron",
  TON: "ton",
  Mantle: "mantle",
  Gnosis: "xdai",
  HyperEVM: "hyperevm",
  Monad: "monad",
  Ink: "ink",
  XLayer: "xlayer",
};
for (const [id, path] of Object.entries(chainPaths))
  await save(
    "chain-" + id,
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/" +
      path +
      "/info/logo.png",
  );
const stocks = [
  "NVDA",
  "AAPL",
  "TSLA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "GOOG",
  "META",
  "COIN",
  "AMD",
  "SPY",
  "QQQ",
  "SOXL",
  "MSTR",
  "INTC",
  "CRCL",
  "MU",
  "AVGO",
  "PLTR",
  "ORCL",
  "GLD",
  "NFLX",
  "COST",
  "TSM",
  "JPM",
  "WMT",
  "LLY",
  "BRK-B",
];
for (const ticker of stocks)
  await save(
    "stock-" + ticker,
    "https://financialmodelingprep.com/image-stock/" + ticker + ".png",
  );
const issuerIds = {
  xstocks: "xstocks-ecosystem",
  ondo: "ondo-tokenized-assets",
  bstocks: "bstocks-ecosystem",
  robinhood: "robinhood-chain-stocks-ecosystem",
  coinbase: "coinbase-ecosystem",
  dinari: "dinari-ecosystem",
  backpack: "backpack-securities-ecosystem",
  anchored: "anchored-ecosystem",
  reality: "reality-ecosystem",
  st0x: "st0x-ecosystem",
  stove: "stove-ecosystem",
};
for (const [id, native] of Object.entries(issuerIds)) {
  try {
    await access(new URL("issuer-" + id + ".png", folder));
    continue;
  } catch {}
  await new Promise((r) => setTimeout(r, 6500));
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/rwas/issuers/" + native,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json(),
      url = safeLogo(d.image?.large || d.image?.small);
    if (d.id !== native || !url) throw new Error("No verified image");
    await save("issuer-" + id, url);
  } catch (e) {
    console.log("issuer", id, e.message);
  }
}
// Source-owned exchange/DEX token logos, identified by their official token registry addresses.
const venues = {
  raydium: ["solana", "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iJm9H1SgCth"],
  uniswap: ["ethereum", "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],
  pancakeswap: ["smartchain", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"],
  kyberswap: ["ethereum", "0xdeFA4e8a7bcBA345F687a2f1456F5Edd9CE97202"],
};
for (const [name, [chain, address]] of Object.entries(venues))
  await save(
    "venue-" + name,
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/" +
      chain +
      "/assets/" +
      address +
      "/logo.png",
  );
// The platform registry provides source-native icons for networks absent from Trust Wallet.
try {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/asset_platforms",
    { signal: AbortSignal.timeout(12000) },
  );
  if (response.ok) {
    const rows = await response.json();
    for (const [id, platform] of Object.entries({
      Ink: "ink",
      XLayer: "x-layer",
      Morph: "morph-l2",
      Robinhood: "robinhood",
    })) {
      const row = rows.find((r) => r.id === platform),
        url = safeLogo(row?.image?.large);
      if (url) await save("chain-" + id, url);
    }
  }
} catch (error) {
  console.log("platform images", error.message);
}
await new Promise((resolve) => setTimeout(resolve, 6000));
try {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=raydium,jupiter-exchange-solana,meteora&per_page=100&page=1",
    { signal: AbortSignal.timeout(12000) },
  );
  if (response.ok) {
    const rows = await response.json();
    for (const [id, coin] of Object.entries({
      raydium: "raydium",
      jupiter: "jupiter-exchange-solana",
      meteora: "meteora",
    })) {
      const row = rows.find((r) => r.id === coin),
        url = safeLogo(row?.image);
      if (url) await save("venue-" + id, url);
    }
  }
} catch (error) {
  console.log("venue token images", error.message);
}
await new Promise((resolve) => setTimeout(resolve, 6000));
try {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/exchanges?per_page=100&page=1",
    { signal: AbortSignal.timeout(12000) },
  );
  if (response.ok) {
    const rows = await response.json();
    for (const [id, exchange] of Object.entries({
      kraken: "kraken",
      gate: "gate",
      coinbase: "gdax",
      backpack: "backpack_exchange",
      binance: "binance",
    })) {
      const row = rows.find((r) => r.id === exchange),
        url = safeLogo(row?.image);
      if (url) await save("venue-" + id, url);
    }
  }
} catch (error) {
  console.log("exchange images", error.message);
}
await writeFile(
  new URL("sources.json", folder),
  JSON.stringify(
    {
      description:
        "Source URLs and retrieval times for real brand images. Corporate logos are used only for disambiguated US tickers.",
      images: manifest,
    },
    null,
    2,
  ) + "\n",
);
