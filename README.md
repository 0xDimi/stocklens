# Stocklens

A comparison tool for tokenized stocks and ETFs. Start with a company, then inspect its issuer products, onchain pools, exchange markets and share-normalized order quotes.

**Node.js 22+ · zero runtime dependencies · no build step.**

```sh
npm start
```

Open [Stocklens](http://127.0.0.1:4173). Optional source settings live in `.env.example`. Public sources work without a key where the provider permits access. Credentials belong in the server environment or ignored `.env` file.

## Home and Markets

Home follows one flow: search a stock → inspect source-mapped issuer versions and exact contracts → compare issuers/networks → compare supported size-specific quotes → open the venue.

Markets (`?page=markets`) presents the entire connected asset registry as a sortable, searchable table. It has tokenized price/change, tokenized capitalization and volume, chain/version/issuer counts, shared watchlist, CSV export and optional Nasdaq company references for the current page. A stock row opens Home for that exact canonical asset.

## The comparison workspace

- **Find an asset:** search companies, tickers, tokens and ISINs; filter stocks/ETFs or saved assets. Optional reference prices use loaded CoinGecko RWA pages. Missing prices stay unknown. Saved lists support JSON import/export.
- **Products:** compare issuer/token, price per token, 24h volume, structure and networks before expanding a row. Expand for rights, dividends, exit/access conditions, contracts and exact market/quote links. Select up to three products with Compare, then open the side-by-side terms matrix. Real circular logos distinguish companies, issuers, networks and venues. Wrapped versions are explicitly classified (including ST0x wtStock), hidden by default, and available through Include wrapped versions.
- **Buy comparison:** choose a USDC budget, network and issuer. The summary highlights the best fresh, verified share exposure and cost per equivalent share before network costs. Unknown conversion ratios stay unranked; expired quotes cannot win. Expand a quote for sources, costs and exact venue handoff.
- **Liquidity and exchanges:** inspect exact-contract pool reserves/volume or choose an issuer token for reported exchange prices, spreads, depth and timestamps. These are market observations, not fill guarantees. Exchange observations are token-wide even when the product selector is network-filtered.
- **History and detail:** Price history is collapsed below the comparison until requested. Explore hourly OHLC/volume for an exact-contract pool over a rolling 1D/7D window. A pool’s Chart action opens its history directly. Issuer terms and source/coverage details remain available without filling the first screen.

`⌘/Ctrl K` or `/` opens security search. `1`–`5` switch panels; `W` toggles the watchlist; `R` refreshes the table and current chart. Shortcuts leave text-entry fields alone. The URL preserves page, stock, table, amount, chain and issuer. Sorting and CSV export are under More beside Refresh. CSV exports preserve units, sources and timestamps. Watchlists stay in the current browser; JSON import/export provides a portable list of asset IDs; import merges matching catalog IDs with the current watchlist.

Markets poll every ten minutes while the page is visible. Charts load on demand and refresh every 180 seconds while their section is open and the page is visible. All loaded screener pages refresh. Buy quotes expire after 30 seconds and require an explicit refresh; expired purchase links are disabled. Cached source fallbacks are labeled, retain their original timestamps and never become executable quotes.

## Data and identity

Primary integrations:

- CoinGecko [RWA catalog](https://docs.coingecko.com/demo/reference/rwas-list), [tokenized market reference](https://docs.coingecko.com/demo/reference/rwas-markets), [token markets](https://docs.coingecko.com/demo/reference/coins-markets) and [exchange tickers](https://docs.coingecko.com/demo/reference/coins-id-tickers).
- [GeckoTerminal public API](https://api.geckoterminal.com/docs/index.html): exact-contract pools, reserve values, volumes and OHLCV history.
- [xStocks public API](https://docs.xstocks.fi/developers/quickstart) and [multiplier documentation](https://docs.xstocks.fi/developers/multipliers).
- Ondo's official CSV from its [contract registry](https://docs.ondo.finance/addresses#ondo-stocks), plus registered onchain conversion oracles.
- Nasdaq public quote/summary endpoints: independently named listed-security references and company capitalization; P/E only if explicitly supplied. Name and symbol corroboration are required. These references are separate from the tokenized market.
- Raydium and KyberSwap size-specific quotes; public chain RPCs for supported conversion mechanics.

The October 19, 2026 update integration observed 1,963 catalog assets and 12 recognized product families. Registry assets remain searchable before token mapping is loaded; opening one requests its native RWA grouping. Sources and counts are audited in Coverage & sources. The configured directory covers 18 chains; quote adapters cover Solana, Ethereum, BNB Chain, Base and Arbitrum. Counts and available routes change. See [QA.md](QA.md) for the measured run and limits.

Canonical identifiers come from issuer records and corroborated CoinGecko underlying identity, symbols and contracts. A ticker alone does not assign an ISIN. Conflicting issuer mappings are quarantined. Ambiguous matches are held back. Wrappers are included as separate labeled versions and never inherit share-conversion assumptions. An Ondo record can acquire issuer provenance through exact-contract corroboration without assigning an uncorroborated ISIN to an existing CoinGecko asset ID. This mapping does not establish legal equivalence between products.

## Units and coverage

- Markets prices are an **aggregated tokenized market reference**, separate from Nasdaq listed-stock references. Product, exchange and pool prices are USD per **token unit**. They cannot establish the cheapest share exposure by themselves.
- Order ranking is `USDC input ÷ verified equivalent shares received`. Output reflects quote fees and price impact. Network costs, approvals, account creation, funding, bridging, taxes and future exit costs are separate. USDC is assumed available on each destination chain; BNB uses Binance-Peg USDC.
- xStocks EVM quote output is already adjusted. Solana conversions use the active multiplier. Other issuers do not inherit these assumptions. Conversion gaps are shown directly.
- GeckoTerminal stock-wide coverage is a filtered first search page; exact-token links query that deployment's top pools. Exchange tickers are paginated provider observations, not a complete executable order book. Pool reserves and reported depth do not guarantee fill size or slippage.
- Direct exchange links are shown only for validated supported hosts. Other market rows link to CoinGecko's markets page. This avoids incorrectly cased DEX contract URLs supplied by third-party tickers.
- Markets “Onchain premium” is the latest compared supported order versus a fresh Nasdaq reference, before gas and assuming USDC equals $1. It requires verified share conversion, reference timestamps within five minutes and two-minute alignment, and an unexpired quote. It is not a market-wide spot premium. Missing P/E, company cap, prices and conversions remain unavailable rather than estimated.
- Public API limits and provider outages can constrain coverage. Last-good market observations are process-local; catalog snapshots persist to disk. No account database, wallet, custody or transaction submission is included. Issuers and venues determine product eligibility.

## Deploy and verify

[DEPLOY.md](DEPLOY.md) covers production configuration, HTTPS/proxy setup, cache persistence, Docker/Compose and the Render manifest. A production process accepts the platform's assigned port:

```sh
NODE_ENV=production HOST=0.0.0.0 PORT=4173 npm start
```

```sh
npm test
npm run integration
npm run integration:terminal
npm run smoke:production
```

The integration scripts contact real sources; live availability can cause a check to fail. `STOCKLENS_URL` selects an already running instance. The production smoke starts and stops its own production process and requires an actual usable catalog. CI covers Node 22/24 and a container job; local execution evidence is in QA.md.

Brand files and their retrieval provenance are in `assets/logos/`; trusted remote images use an explicit CSP/URL allowlist. `node scripts/sync-brand-assets.mjs` refreshes source-owned logos manually (it uses macOS `sips` for non-PNG conversion, and is not part of deployment). Failed image loads keep readable text fallbacks.

Modules remain small in purpose: `server/` owns catalog identity, providers, source resilience and HTTP boundaries; `src/model.mjs` owns numeric/search logic; `src/views.mjs` owns escaped rendering and exports; `src/chart.mjs` owns chart geometry/inspection; `src/terminal.mjs` owns comparison navigation and optional chart panels; `src/app.mjs` coordinates the selected security and table requests; `src/markets-page.mjs` owns the market overview; `src/brands.mjs` renders safe brand imagery; `server/fundamentals.mjs` owns identity-checked listed references; `server/coverage.mjs` derives coverage counts.
