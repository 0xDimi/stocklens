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
  kyber: "base",
  websiteChain: "base",
  rpc: () => process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
});
Object.assign(CHAINS.Arbitrum, {
  usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  decimals: 6,
  kyber: "arbitrum",
  websiteChain: "arbitrum",
  rpc: () =>
    process.env.ARBITRUM_RPC_URL || "https://arbitrum-one-rpc.publicnode.com",
});
export function validAddress(chain, address) {
  if (typeof address !== "string" || !CHAINS[chain]) return false;
  if (chain === "Solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (chain === "Tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (chain === "TON") return /^[EU]Q[A-Za-z0-9_-]{46}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
