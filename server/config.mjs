export const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public";
export const ONDO_CSV =
  "https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?rlkey=n3no1w78wrah3umsl0nr9s77i&dl=1";
export const ONDO_SOURCE = "https://docs.ondo.finance/addresses#ondo-stocks";
export const CHAINS = {
  Solana: {
    id: "Solana",
    label: "Solana",
    platform: "solana",
    gecko: "solana",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    explorer: "https://solscan.io/token/",
    rpc: () =>
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  },
  Ethereum: {
    id: "Ethereum",
    label: "Ethereum",
    platform: "ethereum",
    gecko: "eth",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    explorer: "https://etherscan.io/token/",
    evmId: 1,
    kyber: "ethereum",
    websiteChain: "ethereum",
    rpc: () =>
      process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
    oracle: "0x9BC39DB6fbB44B91a48b8D5A6C208B82B1741bE6",
  },
  BinanceSmartChain: {
    id: "BinanceSmartChain",
    label: "BNB Chain",
    platform: "binance-smart-chain",
    gecko: "bsc",
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    decimals: 18,
    explorer: "https://bscscan.com/token/",
    evmId: 56,
    kyber: "bsc",
    websiteChain: "bnb",
    rpc: () => process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com",
    oracle: "0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e",
  },
};
// Discovery coverage is independent of execution-adapter coverage.
const extra = [
  ["Base", "Base", "base", "base", "https://basescan.org/token/"],
  [
    "Arbitrum",
    "Arbitrum",
    "arbitrum-one",
    "arbitrum",
    "https://arbiscan.io/token/",
  ],
  [
    "Avalanche",
    "Avalanche",
    "avalanche",
    "avax",
    "https://snowtrace.io/token/",
  ],
  [
    "Polygon",
    "Polygon",
    "polygon-pos",
    "polygon_pos",
    "https://polygonscan.com/token/",
  ],
  [
    "Optimism",
    "Optimism",
    "optimistic-ethereum",
    "optimism",
    "https://optimistic.etherscan.io/token/",
  ],
  [
    "HyperEVM",
    "HyperEVM",
    "hyperevm",
    "hyperevm",
    "https://hyperevmscan.io/token/",
  ],
  [
    "Robinhood",
    "Robinhood",
    "robinhood",
    "robinhood",
    "https://explorer.robinhood.com/token/",
  ],
  ["Monad", "Monad", "monad", "monad", "https://monadscan.com/token/"],
  ["Mantle", "Mantle", "mantle", "mantle", "https://mantlescan.xyz/token/"],
  ["Ink", "Ink", "ink", "ink", "https://explorer.inkonchain.com/token/"],
  [
    "XLayer",
    "X Layer",
    "x-layer",
    "x-layer",
    "https://www.oklink.com/xlayer/token/",
  ],
  ["Gnosis", "Gnosis", "xdai", "xdai", "https://gnosisscan.io/token/"],
  ["Morph", "Morph", "morph-l2", "morph", "https://explorer.morphl2.io/token/"],
  ["Tron", "Tron", "tron", "tron", "https://tronscan.org/#/token20/"],
  ["TON", "TON", "the-open-network", "ton", "https://tonviewer.com/"],
];
for (const [id, label, platform, gecko, explorer] of extra)
  CHAINS[id] = { id, label, platform, gecko, explorer };
Object.assign(CHAINS.Base, {
  usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  decimals: 6,
  evmId: 8453,
  kyber: "base",
  websiteChain: "base",
  rpc: () => process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
});
Object.assign(CHAINS.Arbitrum, {
  usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  decimals: 6,
  evmId: 42161,
  kyber: "arbitrum",
  websiteChain: "arbitrum",
  rpc: () =>
    process.env.ARBITRUM_RPC_URL || "https://arbitrum-one-rpc.publicnode.com",
});
// As of 2026-10-23: native USDC contracts are from Circle's canonical table:
// https://developers.circle.com/stablecoins/usdc-contract-addresses
// Mantle/Gnosis bridged contracts and public RPCs are independently confirmed
// by LI.FI /v1/token + /v1/chains, then eth_chainId and decimals() on each RPC.
// Discovery, token units and each quote provider are separate capabilities.
const executionNetworks = [
  [
    "Optimism",
    10,
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    "https://optimism-rpc.publicnode.com",
    "optimism",
    true,
  ],
  [
    "Polygon",
    137,
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    "https://polygon-bor-rpc.publicnode.com",
    "polygon",
    true,
  ],
  [
    "Avalanche",
    43114,
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    "https://api.avax.network/ext/bc/C/rpc",
    "avalanche",
    true,
  ],
  [
    "HyperEVM",
    999,
    "0xb88339cb7199b77e23db6e890353e22632ba630f",
    "https://rpc.hyperliquid.xyz/evm",
    "hyperevm",
    false,
  ],
  [
    "Monad",
    143,
    "0x754704bc059f8c67012fed69bc8a327a5aafb603",
    "https://rpc.monad.xyz",
    "monad",
    false,
  ],
  [
    "Mantle",
    5000,
    "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9",
    "https://rpc.mantle.xyz",
    null,
    false,
  ],
  [
    "Gnosis",
    100,
    "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83",
    "https://rpc.gnosischain.com",
    null,
    true,
  ],
  [
    "Ink",
    57073,
    "0x2d270e6886d130d724215a266106e6832161eaed",
    "https://rpc-gel.inkonchain.com",
    null,
    false,
  ],
  [
    "XLayer",
    196,
    "0xb6ceceab302e2e4948951ee7843fc24e92933061",
    "https://rpc.xlayer.tech",
    null,
    false,
  ],
  [
    "Morph",
    2818,
    "0xcfb1186f4e93d60e60a8bdd997427d1f33bc372b",
    "https://rpc.morph.network",
    null,
    false,
  ],
];
for (const [id, evmId, usdc, publicRpc, kyber, velora] of executionNetworks) {
  Object.assign(CHAINS[id], {
    evmId,
    usdc,
    decimals: 6,
    rpc: () => process.env[`${id.toUpperCase()}_RPC_URL`] || publicRpc,
    quoteProviders: {
      raydium: false,
      jupiter: false,
      kyber: !!kyber,
      velora,
      lifi: !kyber && !velora,
    },
  });
  if (kyber) Object.assign(CHAINS[id], { kyber, websiteChain: kyber });
  if (velora) CHAINS[id].veloraChain = id.toLowerCase();
}
for (const id of ["Ethereum", "BinanceSmartChain", "Base", "Arbitrum"]) {
  CHAINS[id].quoteProviders = {
    raydium: false,
    jupiter: false,
    kyber: true,
    velora: true,
    lifi: false,
  };
  CHAINS[id].veloraChain = CHAINS[id].kyber;
}
CHAINS.Solana.quoteProviders = {
  raydium: true,
  jupiter: true,
  kyber: false,
  velora: false,
  lifi: false,
};
CHAINS.BinanceSmartChain.inputSymbol = "Binance-Peg USDC";
CHAINS.Mantle.inputSymbol = "Bridged USDC";
CHAINS.Gnosis.inputSymbol = "Bridged USDC";
for (const id of ["TON", "Tron", "Robinhood"]) {
  CHAINS[id].quoteProviders = {
    raydium: false,
    jupiter: false,
    kyber: false,
    velora: false,
    lifi: false,
  };
  CHAINS[id].quoteUnavailableReason =
    "A public USDC-funded order route has not been verified on this network. Explore its listed markets in the Markets tab.";
}
// Robinhood is a mainnet, but a supported chain alone does not establish a
// verified USDC contract or an executable route for a listed stock token.
Object.assign(CHAINS.Robinhood, {
  evmId: 4663,
  explorer: "https://robinhoodchain.blockscout.com/token/",
  rpc: () =>
    process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
});
export function validAddress(chain, address) {
  if (typeof address !== "string" || !CHAINS[chain]) return false;
  if (chain === "Solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (chain === "Tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (chain === "TON") return /^[EU]Q[A-Za-z0-9_-]{46}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
