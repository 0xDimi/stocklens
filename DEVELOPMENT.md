# Development and data reference

Technical details for contributors. For a product overview and the live app, see the [README](README.md).

## Run locally

Use Node.js 22 or newer. The app has no runtime dependencies or build step.

```sh
npm start
```

Open [localhost:4173](http://127.0.0.1:4173). Optional source settings are listed in [.env.example](.env.example). Keep credentials in the server environment or an ignored `.env` file.

## The comparison workspace

- **Find an asset:** search companies, tickers, tokens and ISINs; filter stocks/ETFs or saved assets. Optional reference prices use loaded CoinGecko RWA pages. Missing prices stay unknown. Saved lists support JSON import/export.
- **Products:** compare issuer/token, price per token, 24h volume, structure and networks before expanding a row. Expand for rights, dividends, exit/access conditions, contracts and exact market/quote links. Use Select for terms on two or three products, then open the side-by-side terms matrix. Real circular logos distinguish companies, issuers, networks and venues. Wrapped versions are explicitly classified (including ST0x wtStock), hidden by default, and available through Include wrapped versions.
- **Buy comparison:** choose a USDC budget, network and issuer. The summary highlights the best fresh, verified share exposure and cost per equivalent share before network costs. Unknown conversion ratios stay unranked; expired quotes cannot win. Expand a quote for sources, costs and exact venue handoff.
- **Liquidity and exchanges:** inspect exact-contract pool reserves/volume or choose an issuer token for reported exchange prices, spreads, depth and timestamps. These are market observations, not fill guarantees. Exchange observations are token-wide even when the product selector is network-filtered.
- **History and detail:** Price history is collapsed below the comparison until requested. Explore hourly OHLC/volume for an exact-contract pool over a rolling 1D/7D window. A pool’s Chart action opens its history directly. Issuer terms and source/coverage details remain available without filling the first screen.

Markets stock names open an overview with listed and tokenized prices, a source-provided seven-day aggregate series, issuer terms, network contracts and explicitly loaded trading venues. Select two to five stocks in Markets or use Compare stocks to compare their metrics. This is separate from comparing two or three token products of one stock. Stock and comparison pages have shareable URLs.

`⌘/Ctrl K` or `/` opens security search. `1`–`5` switch panels; `W` toggles the watchlist; `R` refreshes the table and current chart. Shortcuts leave text-entry fields alone. The URL preserves page, stock, table, amount, chain and issuer. Sorting and CSV export are under More beside Refresh. CSV exports preserve units, sources and timestamps. Watchlists stay in the current browser; JSON import/export provides a portable list of asset IDs; import merges matching catalog IDs with the current watchlist.

Markets poll every ten minutes while the page is visible. Charts load on demand and refresh every 180 seconds while their section is open and the page is visible. Markets automatically loads subsequent source pages; all loaded screener pages refresh. Visible-page company data and spot/indicative premium observations refresh independently once a minute. Buy quotes expire after 30 seconds and require an explicit refresh; expired purchase links are disabled. Cached source fallbacks are labeled, retain their original timestamps and never become executable quotes.

## Data and identity

Primary integrations:

- CoinGecko [RWA catalog](https://docs.coingecko.com/demo/reference/rwas-list), [tokenized market reference](https://docs.coingecko.com/demo/reference/rwas-markets), [token markets](https://docs.coingecko.com/demo/reference/coins-markets) and [exchange tickers](https://docs.coingecko.com/demo/reference/coins-id-tickers).
- [GeckoTerminal public API](https://api.geckoterminal.com/docs/index.html): exact-contract pools, reserve values, volumes and OHLCV history. When public access is throttled or unavailable, a configured CoinGecko key enables the equivalent authenticated onchain API without changing the selected pool or token.
- [xStocks public API](https://docs.xstocks.fi/developers/quickstart) and [multiplier documentation](https://docs.xstocks.fi/developers/multipliers).
- Ondo's official CSV from its [contract registry](https://docs.ondo.finance/addresses#ondo-stocks), plus registered onchain conversion oracles.
- Nasdaq public quote/summary and analyst P/E endpoints: independently named listed-security references and company capitalization; P/E only if explicitly supplied. Name and symbol corroboration are required. These references are separate from the tokenized market.
- Jupiter V2 quote-only orders and Raydium for Solana; KyberSwap and Velora for supported EVM networks. Responses identify the quote provider separately from the exchanges supplying liquidity. Provider requests have independent deadlines and caches; a slow provider cannot hide completed quotes. Public chain RPCs verify supported conversion mechanics.
- DexScreener public exact-contract pool snapshots for representative share-normalized spot premiums, separate from size-specific order quotes.

The October 19, 2026 validated identity snapshot contains 1,961 catalog assets and 12 recognized product families. Registry assets remain searchable before token mapping is loaded; opening one requests its native RWA grouping. Sources and counts are audited in Coverage & sources. The configured directory covers 18 chains; quote adapters cover Solana, Ethereum, BNB Chain, Base and Arbitrum. Counts and available routes change. See [QA.md](QA.md) for the measured run and limits.

Canonical identifiers come from issuer records and corroborated CoinGecko underlying identity, symbols and contracts. A ticker alone does not assign an ISIN. Conflicting issuer mappings are quarantined. Ambiguous matches are held back. Wrappers are included as separate labeled versions and never inherit share-conversion assumptions. An Ondo record can acquire issuer provenance through exact-contract corroboration without assigning an uncorroborated ISIN to an existing CoinGecko asset ID. This mapping does not establish legal equivalence between products.

## Units and coverage

- Markets prices are an **aggregated tokenized market reference**, separate from Nasdaq listed-stock references. Product, exchange and pool prices are USD per **token unit**. They cannot establish the cheapest share exposure by themselves.
- Order ranking is `USDC input ÷ verified equivalent shares received`. Output reflects quote fees and price impact. Network costs, approvals, account creation, funding, bridging, taxes and future exit costs are separate. USDC is assumed available on each destination chain; BNB uses Binance-Peg USDC.
- xStocks EVM quote output is already adjusted. Solana conversions use the active multiplier. Other issuers do not inherit these assumptions. Conversion gaps are shown directly.
- GeckoTerminal stock-wide coverage is a filtered first search page; exact-token links query that deployment's top pools. Exchange tickers are paginated provider observations, not a complete executable order book. Pool reserves and reported depth do not guarantee fill size or slippage.
- Direct exchange links are shown only for validated supported hosts. Other market rows link to CoinGecko's markets page. This avoids incorrectly cased DEX contract URLs supplied by third-party tickers.
- Onchain premium prefers a representative exact-contract pool snapshot normalized with a verified share conversion. Eligible pools have at least $1,000 liquidity and nonzero 24h volume. A $1,000 indicative buy premium remains a separately labeled fallback. The aggregate tokenized market price is not used to infer share exposure. Outside market hours, a freshly retrieved official last close carries its original date. Date-only closing observations never become invented intraday timestamps. Retained source observations preserve their original dates and are marked older; missing data stays unavailable. Solana pools with undisclosed multiplier/indexer unit semantics are excluded from the spot calculation.
- Public API limits and provider outages can constrain coverage. Validated source observations and catalog snapshots persist to the application cache directory. Packaged dated seeds survive redeployment; the Render runtime cache is ephemeral. Catalog fallback uses the original observation time and expires after 72 hours. No account database, wallet, custody or transaction submission is included. Issuers and venues determine product eligibility.

## Deploy and verify

[DEPLOY.md](DEPLOY.md) covers production configuration, HTTPS/proxy setup, cache persistence, Docker/Compose and the Render manifest. A production process accepts the platform's assigned port:

```sh
NODE_ENV=production HOST=0.0.0.0 PORT=4173 npm start
```

```sh
npm test
npm run integration
npm run integration:terminal
npm run integration:access
npm run integration:markets
npm run integration:metrics
npm run smoke:production
```

For the public deployment, prefix an integration command with `STOCKLENS_URL=https://stocklens-osft.onrender.com`. The integration scripts contact real sources; live availability can cause a check to fail. `STOCKLENS_URL` selects an already running instance. The production smoke starts and stops its own production process and requires an actual usable catalog. CI covers Node 22/24 and a container job; local execution evidence is in QA.md.

Brand files and their retrieval provenance are in `assets/logos/`; trusted remote images use an explicit CSP/URL allowlist. `node scripts/sync-brand-assets.mjs` refreshes source-owned logos manually (it uses macOS `sips` for non-PNG conversion, and is not part of deployment). Failed image loads keep readable text fallbacks.

Modules remain small in purpose: `server/` owns catalog identity, providers, source resilience and HTTP boundaries; `src/model.mjs` owns numeric/search logic; `src/views.mjs` owns escaped rendering and exports; `src/chart.mjs` owns chart geometry/inspection; `src/terminal.mjs` owns comparison navigation and optional chart panels; `src/app.mjs` coordinates the selected security and table requests; `src/markets-page.mjs` owns the market overview; `src/brands.mjs` renders safe brand imagery; `server/fundamentals.mjs` owns identity-checked listed references; `server/coverage.mjs` derives coverage counts.

## Source resilience and manual data refresh

Cold starts serve a checksummed, dated identity snapshot immediately, then refresh issuer registries in the background. Bounded xStocks pagination prevents slow pages from dropping the entire issuer. Failed refreshes retain validated IDs and exact-contract mappings with their original source dates. Captured public observations ship for CoinGecko and Nasdaq; runtime successes update an atomic local cache. A public-feed rate limit can still occur. Cached observations remain explicitly dated, and source failure is never turned into a fabricated live value.

CoinGecko requests share conservative keyless pacing, coalesce and reuse USD price batches by exact coin ID. When server market observations are stale, the browser can read the same official public RWA feed directly. Requests carry no credentials or user input, use conservative pacing and a ten-minute local observation cache, and respect provider rate-limit cooldowns. Exact RWA IDs and the same normalizer are used on both paths. If both paths fail, original dated server observations remain visible. If token-market prices cannot refresh promptly, Products can show exact-contract $1,000 indicative buy estimates from the independent quote providers. These prices are labeled and do not invent market capitalization or volume.

Refresh the packaged public observations manually before a release:

```sh
node scripts/refresh-catalog-seed.mjs
node scripts/refresh-market-seed.mjs
node scripts/refresh-fundamentals-seed.mjs
```

These scripts contact actual public sources and retain provenance manifests. They are not scheduled jobs. The Render cost-monitor automation was removed at the owner's request.

## Portfolio status and operating limits

The public app requires no account or wallet connection to browse, compare, or open a venue. Stocklens never submits transactions. See [PORTFOLIO_REVIEW.md](PORTFOLIO_REVIEW.md) for the dated code review, fixes, actual integration checks and scope.

The CoinGecko Demo plan is a limited data budget. Its [published allowance](https://www.coingecko.com/en/api/pricing) is 10,000 calls per month as checked October 19, 2026. Under continuous demand, refreshing five market pages every ten minutes alone would require 21,600 calls in 30 days, before other data requests. Low-traffic portfolio use is the intended deployment scope; uninterrupted market-wide freshness under sustained traffic requires a separate quota/batching decision. Existing caches, coalescing, provider cooldowns and a public browser feed reduce repeated requests but do not remove upstream quotas. No paid data upgrade or scheduled monitoring is enabled.
