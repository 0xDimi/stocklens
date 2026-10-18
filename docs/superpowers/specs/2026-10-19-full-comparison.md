# Stocklens complete comparison workspace

User direction: use CoinGecko / GeckoTerminal, broaden the tool, finish autonomously, preserve simplicity and clean code. This extends the existing surface and its visual system. No approval round: user expressly requested uninterrupted implementation.

## Outcome
Search an underlying stock/ETF; discover representations across CoinGecko-listed issuers and chains; compare token market data, real size-specific quotes, issuer terms and exits; inspect liquidity and historical pool prices; open exact token markets; save/share/export results. Buying remains external venue handoff. Do not create custody or execute financial transactions.

## Sources and identity
Use CoinGecko RWA list and coin list with platforms for broad catalog discovery. Prefer native /rwas/{id}?tokens=true grouping when available. Deterministic fallback mapping must require a recognized family suffix, exact underlying ID or normalized name, and compatible token symbol, never fuzzy ticker search. Label this CoinGecko catalog mapping, not issuer-verified legal identity. Merge issuer-backed ISIN records only with both name and ticker corroboration; keep existing ISIN URLs working. Preserve direct xStocks/Ondo inputs and quarantine conflicts.

CoinGecko /coins/markets supplies per-token aggregate prices, volume, cap and source timestamps. These are token-unit observations, not an underlying exchange-price feed or order quote. GeckoTerminal supplies exact-contract filtered pools, liquidity, volume and historical OHLCV; third-party pool names cannot authorize a token. Invalid/unknown conversions never become 1:1 exposure. No invented market statistics, legal rights or issuer risk scores.

## Workspaces
- Products: one row per issuer product, aggregate token price/24h/volume/cap, supported chains, sourced contract links, issuer documentation. Filter issuer/chain/type, sort, expand all deployments. Unknown legal fields stay explicit.
- Quotes: existing normalized execution comparison, extended to verified deployments on supported quote chains, input USDC, expiry and refresh; unknown conversion stays unranked.
- Markets: exact-contract pools, DEX, pair, USD/token, 24h volume, pool liquidity, last observed timestamps; top-pool historical price chart with proper unit/range labels. No liquidity-to-slippage inference.
- Terms: source-linked structure/rights/dividends/redemption comparison; only researched issuers get factual summaries, others link source records with fields unreviewed.

Clean utility-first interface inheriting daylight white/teal workspace. Tabs inside comparison, compact filters, flat tables, mobile row layout. No decorative hero additions. Native keyboard semantics, source status and recoverable errors. Race/cancellation guards cover every async surface. URL state and local favorites persist, CSV exports quote/market status and timestamps.

## Architecture
Node >=22 standard library + browser ES modules. Separate CoinGecko service, GeckoTerminal service, identity catalog, quote adapters, shared view helpers and UI controllers. Fixed-host external requests, explicit timeouts, response/cache bounds, source-level cooldown, optional local CoinGecko key, no credentials in responses. Public sources work without credentials where available; rate/access failures visible and cached. Static file allowlist and local listener retained.

## Acceptance
Real HTTP integration must retrieve broad CoinGecko issuer/chain products, market observations, exact-contract GeckoTerminal pools, OHLCV and existing stock quotes. Browser must exercise all tabs, filters, deep links, exports, async selection, expiry and mobile. Unit regressions cover identity ambiguity, contract matching/orientation, unknown conversions, source failures, invalid history addresses and stale observations. Independent whole-change review and meaningful fixes before final commit. Document exact observed coverage and limits; no global cheapest/complete coverage guarantee.
