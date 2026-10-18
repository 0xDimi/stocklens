# Stocklens

A local comparison workspace for tokenized stocks and ETFs. CoinGecko supplies broader product discovery and token market observations; GeckoTerminal supplies exact-contract pools and historical prices; issuer and onchain sources support share conversions and order quotes.

Node.js 22+, zero runtime dependencies, no build step.

```sh
cd /Users/dpechli/Desktop/Codex/Stocklens
npm start
```

Open [Stocklens](http://127.0.0.1:4173). The server listens on localhost. Public sources work without a key where available. Optional RPC and CoinGecko settings are in `.env.example`; keep credentials in `.env`, which is ignored and never served.

## Use

1. Search a company, ticker, token symbol or ISIN. Filter stocks/ETFs or saved assets.
2. **Products:** compare issuers, token-unit prices, 24h changes, volumes, caps and deployments. Expand for exact contracts, sources, terms and market/quote links.
3. **Order quotes:** set a USDC budget and compare equivalent-share output where conversion is verified. Choose a chain/issuer, inspect raw source responses, and open the exact token pair at the external venue.
4. **Markets:** inspect exact-contract pools, USD/token prices, pool reserve liquidity and 24h volume. Open an hourly chart for a rolling 1D/7D range or follow the pool link.
5. **Issuer terms:** compare source-linked structure, rights, dividend and exit notes. Unreviewed terms are explicitly labeled. Copy the current comparison URL or export visible rows to CSV.

Favorites persist in the browser; no account or database is needed. Tabs, chain, issuer, stock and amount are shareable. Export includes source timestamps and separates raw token observations from normalized order values.

## Data and identity

- [CoinGecko RWA list](https://docs.coingecko.com/demo/reference/rwas-list), [coin platform registry](https://docs.coingecko.com/demo/reference/coins-list), [market observations](https://docs.coingecko.com/demo/reference/coins-markets).
- [GeckoTerminal public API](https://api.geckoterminal.com/docs/index.html): pools, reserves, volumes and hourly OHLCV.
- [xStocks public API](https://docs.xstocks.fi/developers/quickstart), [conversion-unit documentation](https://docs.xstocks.fi/developers/multipliers).
- Ondo's official CSV from [contract addresses](https://docs.ondo.finance/addresses#ondo-stocks); onchain synthetic-shares oracles where registered.

Discovery recognizes 12 product families in current CoinGecko records: xStocks, Ondo, bStocks, Coinbase, Dinari, Robinhood, Backpack, Anchored, rStocks, Reality, ST0x and Stove. Native CoinGecko RWA grouping can be refreshed from Sources & coverage. It returned rate-limit errors initially and later recovered; ordinary discovery also uses conservative underlying ID/name and token-symbol corroboration. This is catalog mapping, not a legal identity guarantee. Wrapped and ambiguous products are excluded. A matching issuer, symbol and exact contract connects issuer products to CoinGecko IDs when names differ. ISIN URLs remain stable; no ticker-only merge assigns a security ID.

Ondo CSV rows that conflict with independent identity mappings are quarantined. The current catalog contains more assets than have active liquidity. Source counts are observations from the dated integration report, not exhaustive market coverage.

Contract registry covers 18 configured chains. Size-specific quote adapters cover Solana, Ethereum, BNB Chain, Base and Arbitrum. Other chains remain browsable and show an explicit unavailable quote state. GeckoTerminal search returns its first page filtered to known contracts; exact-token Markets links query that deployment's top pools. These are not all pools or all centralized exchanges.

## Financial units and freshness

**Order ranking:** nominal USDC input / equivalent underlying shares received. Output incorporates provider swap fees and impact. Gas, approvals, account creation, funding, bridging, tax and future exit costs are excluded. BNB uses Binance-Peg USDC. Funds are assumed already available on the destination chain; stablecoin/bridge risks are not priced.

Solana xStocks/Ondo use verified issuer or onchain multipliers. EVM xStocks amounts are already adjusted. Other issuers do not inherit these conversions; missing ratios stay unranked even if a token quote exists. bStocks and Robinhood documentation explicitly describes reinvested dividends, so assuming a permanent 1:1 ratio would misstate exposure.

CoinGecko and GeckoTerminal observations are USD per source token unit. They are not the stock's NASDAQ/NYSE price and do not predict order execution. Volume/cap refer to tokens; pool reserve liquidity is not a maximum order or slippage guarantee. Historical charts use actual hourly observations within the selected rolling window, preserve gaps and do not fabricate empty periods.

Swap quotes expire 30 seconds after local request start. Expired quotes lose the winner badge and purchase href. Market observations retain provider timestamps; older CoinGecko observations are labeled. Refresh respects upstream cache windows rather than inventing a new source timestamp.

## Resilience and API

Public metadata is cached locally for 12 hours; an outage may retain a labeled catalog snapshot up to 72 hours. Quotes are cached 10 seconds, token prices 60 seconds, pools 90 seconds, and history 5 minutes. Source calls are paced and coalesced. HTTP 429 triggers a source-wide cooldown; failures appear as partial data with recovery messages. No research fixtures or synthetic prices are used as runtime fallbacks.

Same-origin JSON endpoints:

- `GET /api/catalog`
- `GET /api/products?stock=NVDA&chain=all` (`enrich=true` refreshes native RWA mapping)
- `GET /api/compare?stock=NVDA&amount=1000&chain=all`
- `GET /api/markets?stock=NVDA&chain=all` (optional exact catalog `token` + chain)
- `GET /api/history?stock=NVDA&pool=<listed-row-id>&range=1d` (or `7d`)
- `GET /api/health`

History only accepts pools obtained for the selected stock. The server cannot proxy arbitrary URLs/contracts. API validation, response bounds, security headers, static allowlist and local rate limits remain enabled. Keys stay on the server.

## Code and validation

`server/coingecko.mjs` owns discovery/market mapping; `server/gecko.mjs` owns pool orientation/history; `server/catalog.mjs` joins identity and retained enrichment; `server/providers.mjs` owns quotes/conversions; `server/source-client.mjs` owns public-service pacing, cooldown and metadata persistence. `src/views.mjs` contains pure table/chart/CSV rendering; `src/app.mjs` coordinates state, requests and interactions.

```sh
npm test
# With the app running: actual issuer / CoinGecko / GeckoTerminal / RPC / quote integrations
npm run integration
```

The live script writes `test-results/live-integration.json`; real browser checks are recorded in `QA.md`. Public source availability and limits affect coverage.

Purchases happen on external venues and obtain a new quote there. No custody, wallet connection, order submission, jurisdiction screening or issuer-risk scoring is implemented. Public hosting, commercial data licensing/capacity, and distribution review remain deployment work; this deliverable runs locally.
