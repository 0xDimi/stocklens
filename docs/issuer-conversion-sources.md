# Share conversion evidence

Checked 23 October 2026. `server/issuer-conversions.mjs` extends the existing xStocks and Ondo conversion paths. A successful result measures underlying shares per whole raw token. It is independent of token market price and does not claim that a holder directly owns the underlying stock.

| Issuer | Exact identity authority | Current quantity conversion |
| --- | --- | --- |
| Coinbase | [Official Base Tokenized Stocks API](https://docs.base.org/sdks/tokenized-stocks/overview), paginated `https://api.coinbase.com/v1/tokenized-stocks` list; Base only | Token `uiMultiplier()` / 1e18. [Base's integration guide](https://docs.base.org/build-on-base/integrate-defi/list-tokenized-stocks) explicitly says raw tokens do not permanently equal one share and defines WAD precision. |
| bStocks | [Binance's published API reference](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/campaign.md), live `type=3` stock list; exact chain 56 and contract | Token `uiMultiplier()` / 1e18. [Binance FAQ](https://www.binance.bh/en/support/faq/detail/f0c03cd6509a4085b4cce1636f16be38) distinguishes raw balances from multiplied share exposure. The API multiplier is not substituted for a failed current contract read. |
| Reality | Official public `https://api.realityfinance.xyz/api/v1/rwa/assets/tickers`; active exact ARB or Morph deployment | Token `uiMultiplier()` / 1e18. [Issuer overview](https://realityfinance.xyz/info/docs/rtokens/overview) specifies ERC-8056 and says stock splits leave raw balances constant. Its simpler one-token/one-share pricing description must not override that raw-unit distinction. |
| ST0x | [Issuer token directory](https://st0x.io/tokens), each `/tokens/TICKER.md` page lists `tStock` and `wtStock` contracts separately by numeric chain ID | Verify wrapper `asset()` equals that exact listed tStock, then `convertToAssets(one whole wrapper)` normalized by the underlying contract's decimals. [Issuer FAQ](https://st0x.io/faq) defines one tStock per share and says wtStock grows with delivered dividends. Both decimal precisions are read live. |
| Robinhood | [Official assets API](https://docs.robinhood.com/chain/stock-token-apis/), active exact numeric-chain deployment in `https://api.robinhood.com/rhj/assets` | Token `uiMultiplier()` / 1e18. [Issuer overview](https://docs.robinhood.com/chain/stock-tokens/) explicitly defines the shares-per-token multiplier. Public mainnet RPC is documented [here](https://docs.robinhood.com/chain/connecting/). |
| Backpack | Official `https://api.backpack.exchange/api/v1/assets`; exact Solana mint in the matching stock record | Current Token-2022 `scaledUiAmountConfig`, including effective pending changes. Require Token-2022 ownership, initialized mint, matching decimals, and no paused extension. [Issuer explanation](https://learn.backpack.exchange/articles/what-is-backpack-securities) defines the share entitlement and tokenization/redemption units. A caller may pass an already-read `mintAccount`. |
| Dinari, native | Issuer-published [production DShareFactory deployments](https://github.com/dinaricrypto/sbt-contracts/blob/main/releases/v0.4.0/dshare_factory.json), then live factory `isTokenDShare(exactAddress)` | One ERC-20 balance unit per share, only with 18 onchain decimals. [Issuer split handling](https://docs.dinari.com/docs/stock-split-handling) and [ERC20Rebasing source](https://github.com/dinaricrypto/sbt-contracts/blob/main/src/ERC20Rebasing.sol) establish that `balanceOf` and transfer amounts already apply splits. Applying internal `balancePerShare()` again would double-count. Staging factory deployments never authorize conversion. |

Every EVM read first verifies `eth_chainId` against the deployment's exact network, including when an RPC URL is overridden. Known registry symbols must agree with the product symbol; names, ticker prefixes and current price never authorize a contract. Invalid data, missing identity, duplicate matching records, failed reads and unsupported wrappers return null. Raw quotes remain usable in their original token units.

Default complete conversion observations are cached for 30 seconds with their original `conversionObservedAt`. Identity-list reads and RPC network checks are also cached for 30 seconds. Corporate-action multipliers are read onchain; token market prices and reference-feed timestamps do not stand in for unit conversions.

## Public live checks

On 23 October 2026 at approximately 10:25 UTC, direct issuer-list and public RPC checks returned the following for the catalog's exact NVDA deployments:

| Issuer | Network | Shares per raw token |
| --- | --- | ---: |
| Coinbase | Base | 1.0005379395763694 |
| bStocks | BNB Smart Chain | 1.0007782237528078 |
| Reality | Arbitrum | 1 |
| ST0x wtNVDA | Base | 1.000959069613277 |
| Robinhood | Robinhood Chain | 1.0007751591646306 |
| Backpack | Solana | 1 |
| Dinari | Arbitrum | 1 |

These values are captured observations, not constants in production. Local raw responses and test logs are in the gitignored `research/issuer-conversions/` directory, with the consolidated check in `live-results.json`.

## Deliberate limits

- Dinari support requires an exact production factory entry in the published v0.4.0 manifest. A token on another network is not authorized by copying a factory from another chain, using a staging entry, or trusting a matching symbol. Dinari wrappers are not normalized by this module.
- ST0x is the supported wrapper policy. xStocks and other arbitrary wrappers require separate official wrapper-to-underlying identity and unit evidence before normalization.
- Stove's [public token registry](https://docs.proto.stove.finance/developer/public/chain-tokens.html) was reachable and matched the catalog's Arbitrum NVDAs address. Its [current documentation](https://docs.proto.stove.finance/developer/maker/swap/quote.html) distinguishes zero-decimal StockTokens and 18-decimal fractional ShareTokens. The available evidence did not establish a readable current conversion for every corporate-action state of that ShareToken. Its `uiMultiplier()` call reverted. No 1:1 ratio was assumed.
- Anchored, legacy Remora rStocks, unsupported network types and unknown issuers remain in raw-token units unless another independently verified policy handles them.
- `docs.bstocker.finance` was rejected as a bStocks issuer source: its deployment page identifies a third-party demo rewards token. Official Binance sources above establish bStocks identity instead.
