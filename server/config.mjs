export const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public";
export const ONDO_CSV =
  "https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?rlkey=n3no1w78wrah3umsl0nr9s77i&dl=1";
export const ONDO_SOURCE = "https://docs.ondo.finance/addresses#ondo-stocks";
export const CHAINS = {
  Solana: {
    id: "Solana",
    label: "Solana",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    explorer: "https://solscan.io/token/",
    rpc: () =>
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  },
  Ethereum: {
    id: "Ethereum",
    label: "Ethereum",
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
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    decimals: 18,
    explorer: "https://bscscan.com/token/",
    kyber: "bsc",
    websiteChain: "bnb",
    rpc: () => process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com",
    oracle: "0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e",
  },
};
export function validAddress(chain, address) {
  return (
    typeof address === "string" &&
    (chain === "Solana"
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
      : /^0x[a-fA-F0-9]{40}$/.test(address))
  );
}
