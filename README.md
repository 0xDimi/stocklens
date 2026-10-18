# Stocklens

Live tokenized-stock comparison with external purchase handoff. Node.js 22+, no runtime dependencies or build step. Uses public sources; no API keys required.

```sh
cd /Users/dpechli/Desktop/Codex/Stocklens
npm start
```

Open [Stocklens](http://127.0.0.1:4173). The server listens on localhost only. Optional `.env` settings are documented in `.env.example`.

## Working flow

Search a company, ticker, token symbol, or ISIN. Enter 10–1,000,000 USDC, select a chain, and compare current quotes. Expand a product for legal documents, conversion sources, contract explorers, and original quote responses. Save favorites locally, copy comparison URLs, refresh prices, or open the exact token pair on its venue.

## Sources and coverage

- Canonical securities and xStocks deployments: [public xStocks API](https://docs.xstocks.fi/developers/quickstart).
- Ondo deployments: official CSV linked from [Ondo addresses](https://docs.ondo.finance/addresses#ondo-stocks).
- Quotes: Raydium on Solana; KyberSwap on Ethereum and BNB Chain.
- Conversion: xStocks issuer multipliers / adjusted EVM units; Solana mint extensions; Ondo synthetic-shares oracles where available.

The October 18, 2026 integration run returned 1,163 assets. This is catalog coverage, not a claim that every asset has liquidity. The catalog includes ETFs and other listed securities supplied by the issuer. Ondo records join only when both ISIN and ticker corroborate the canonical xStocks record; 206 unconfirmed or inconsistent records were held back in that run. If the canonical identity source fails, the catalog fails closed. Other provider failures appear as partial results with reasons. No synthetic fallback data is used.

## Comparison basis

Effective price = nominal input USDC / equivalent underlying shares received. Provider output already reflects swap fees and price impact. Ranking excludes gas, approvals, account creation, funding, bridging, tax, and future exit/redemption costs. Gas estimates appear separately where supplied. BNB uses **Binance-Peg USDC**; ranking assumes the same nominal USDC budget on the destination chain, without adjusting stablecoin or bridge risk.

One raw token need not equal one share. Missing conversion data is shown without normalized ranking. xStocks EVM transfer amounts are already adjusted and must not be multiplied twice. Quotes expire after 30 seconds from the local request start; expired rows lose their winner status and purchase links. The venue obtains a new quote before any purchase.

Coverage is limited to these issuers, chains, and quote providers. The app does not compare against an exchange stock-price feed or claim the globally cheapest execution. Structural notes link original issuer documents; product-specific terms and user eligibility require checking with the issuer/venue. No wallet, custody, in-app trading, jurisdiction screening, or risk scoring is included.

## Code

- `server/catalog.mjs`: issuer ingestion, identity matching, quarantine.
- `server/providers.mjs`: quotes, units, conversion sources, purchase URLs.
- `server/quotes.mjs`: comparison request validation and ranking.
- `server/http.mjs`: timeouts, bounded responses/cache, RPC, concurrency limits.
- `src/model.mjs`: pure precision, normalization, freshness, search logic.
- `src/app.mjs`: async UI, expiry, URL state, local favorites.
- `src/data.mjs`: sourced structural notes only.
- `server.mjs`: same-origin API, static allowlist, security headers, local rate limits.

```sh
npm test
# With npm start running, checks actual issuer/RPC/quote integrations:
npm run integration
# Optional alternate server:
STOCKLENS_URL=http://127.0.0.1:4174 npm run integration
```

Live checks depend on upstream availability and write a dated report to `test-results/live-integration.json`. Unit/API tests isolate parsing and failure cases; they are supplementary to the real integration and browser checks recorded in `QA.md`.

Public deployment will need suitable hosting, provider usage review, production RPC capacity, monitoring, and jurisdiction-specific product review. This repository runs locally and keeps no server-side user database.
