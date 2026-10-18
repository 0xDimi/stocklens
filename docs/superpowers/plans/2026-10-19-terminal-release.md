# Terminal Release Implementation Plan
> Use superpowers:executing-plans inline, with final independent code and visual reviews. User requested uninterrupted completion.

**Goal:** Ship a working tokenized-equity terminal and production deployment package.
**Architecture:** Extend source services; retain issuer/quote adapters; replace page shell/styles; separate terminal state/rendering and chart geometry. Standard-library Node server.
**Spec:** ../specs/2026-10-19-terminal-release.md

## Constraints
No fabricated data or rights; explicit market/quote units and freshness. Unknown conversions remain unranked. No custody or in-app transactions. Public APIs paced/cached. Zero runtime dependencies. Existing local checkout/URL retained; deployment is prepared, not publicly published.

## Review Focus
- Screener aggregate market price must not be labeled as exchange stock price or raw-token order output.
- Watchlists/comparison and asynchronous chart/table requests must remain tied to the selected security.
- Production proxies must not give every user one rate bucket or permit arbitrary spoofed rate identity.
- Unwritable cache, upstream cooldown and expired quotes must not silently become fresh data.
- Exchange links/labels and chart OHLC orientation/ranges must not invent tradable prices.

### 1. Data and production runtime
- [ ] Red→green tests for screener matching, venue stale flags/links, OHLC, config/proxy/rate/cache behavior.
- [ ] Implement screener and exchange sources, production config/readiness/persistence/shutdown, add actual integration coverage.

### 2. Terminal workstation
- [ ] Replace DESIGN.md, shell and CSS with terminal contract; preserve working tools.
- [ ] Add linked market universe/tape, persistent chart, command palette, comparison shortlist and live polling; source/expiry-aware states.
- [ ] Browser check every view, keyboard/search/compare/watchlist/export, races, mobile and error/expiry behavior.

### 3. Release package and verification
- [ ] Docker/compose, Render, production smoke script, CI, deployment instructions.
- [ ] Run unit, actual integration and production smoke checks; independent code/visual review and fixes.
- [ ] Record exact observed limits and leave running, committed terminal.
