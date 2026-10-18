# Stocklens Terminal release

User direction: terminal for tokenized stocks, fully functional and ready to deploy. Complete autonomously; no design or implementation approval loops. This replaces the prior comparison-page visual world while retaining its working data and evidence constraints.

## Product
A full-screen dark market workstation: global command/search, live market strip, searchable sortable security universe with watchlist, selected-security market summary, persistent OHLC/volume chart, comparison tables and an inspector. Link all panels to the same underlying asset. Chart controls, keyboard navigation, side-by-side product shortlist, watchlist import/export and source status must work. Keep externally executed buying and explicit unknown conversions.

New market screener uses CoinGecko RWA aggregated tokenized market data; it is not a NASDAQ quote or an executable price. Stock/ETF discovery remains source-backed. Exchange ticker view adds CoinGecko reported venue prices/volumes/spreads and stale/anomaly flags. Purchase links must preserve verified pair addresses or use a clearly labeled source/venue page.

Persistent chart uses GT actual OHLCV with time range, exact pool/contract orientation and hover/keyboard inspection. If a pool has too little data or source fails, display that state; no invented candles. Aggregate RWA sparkline and pool chart must have distinct labels/units.

## Visual contract
User pins terminal convention. Dense charcoal workspace, fine structural dividers, restrained amber navigation/accent, green/red reserved for data changes. No marketing hero, floating cards or decorative gradients. Main content fills the viewport; chart is the central visual anchor. System UI type, mono numeric columns, 11–13px data and ≥12px body copy. At desktop: left universe, center chart+tables, right inspector. At smaller widths: stack panels, retain all functions, no page-wide overflow. Keyboard command palette, native dialogs/focus and reduced-motion support.

## Reliability and deployment
Production HOST/PORT/config validation, non-root container/compose and Render manifest, same-process readiness/liveness, graceful shutdown, per-client rate limits with explicit proxy trust, bounded source concurrency, timeouts and source cooldown. Cache directory configurable and metadata persistence cannot take the live service down if unwritable. Preserve last successful observations on refresh failure with timestamps and explicit stale flags. Static-file allowlist, CSP, security headers, secret isolation. Runtime remains Node standard library/browser ES modules. No user database/account/payments needed for comparison terminal.

Deploy-ready means clean checkout can start in production mode, bind assigned port, serve working assets/APIs, persist cache, report readiness, and stop cleanly, proven by real smoke/integration/browser checks. Provide exact instructions, .env.example and deployment files. No public deployment or purchase of infrastructure is requested.

## Acceptance
Real screener and exchange venue integration; actual pools/candles/quotes; screen/search/compare/watchlist/export/keyboard/refresh/link and mobile browser checks; production start/private-file/rate/config/readiness/shutdown tests. Independent whole-change and visual review, fix material findings. Never claim nonexistent prices, global cheapest execution, reviewed rights or source reliability guarantees.
