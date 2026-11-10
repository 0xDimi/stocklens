# Full Comparison Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User explicitly requested no questions and completion. One independent whole-change review follows implementation.

**Goal:** Complete the multi-issuer comparison workspace using CoinGecko and GeckoTerminal.
**Architecture:** Preserve vanilla client and Node standard library. New source services expose catalog/markets/pools/history separately from size-specific quotes. Each tab can fail independently.
**Tech Stack:** Node >=22, browser ES modules, node:test.
**Spec:** ../specs/2026-10-19-full-comparison.md

## Global Constraints
No invented prices, unit ratios, identity links or legal rights. Native issuer mappings preferred; conservative deterministic discovery fallback labeled. Runtime dependency count stays zero. Source credentials local only. External purchase handoff; no transactions. Inherit existing visual system and keep UI concise.

## Review Focus
- Same ticker / similar company / wrapped product must not merge independent securities.
- Arbitrary GT search hits must never become trusted products; quote/base orientation must follow exact contracts.
- Broader issuers must not accidentally inherit Ondo oracle or xStocks conversion logic.
- Rate limits/expired caches and rapid selections must not claim fresh executable data.
- History endpoints cannot proxy arbitrary addresses/hosts or mix token units in a chart.

### Task 1: Source services and expanded catalog
Files: server/coingecko.mjs, server/gecko.mjs, server/catalog.mjs, server/config.mjs, tests/sources.test.mjs.
Interfaces: CoinGecko getDiscovery(), getTokenMarkets(ids), getRwa(id); catalog loadCatalog()/resolveStock(id); Gecko getPools(stock, chain)/getHistory(stock, poolId, range).
- [x] Write and run failing identity, raw pool validation/orientation, stale market, malformed source tests.
- [x] Implement paced/cached fixed-host sources, strict catalog expansion and chain metadata.
- [x] Verify against actual broad listings and pools; commit.

### Task 2: Complete HTTP/API and quote behavior
Files: server.mjs, server/quotes.mjs, server/providers.mjs, tests/api.test.mjs, tests/providers.test.mjs.
Interfaces: GET /api/products?stock=&chain=; /api/markets?stock=&chain=; /api/history?stock=&pool=&range=; existing /api/catalog and /api/compare.
- [x] Write/run failing identifier, source failure, history scope and unknown-issuer conversion tests.
- [x] Implement per-view responses and expanded quote-chain support without assumed ratios.
- [x] Real integration of products, markets, history, quotes and API boundaries; commit.

### Task 3: Complete user flow
Files: index.html, src/app.mjs, src/views.mjs, src/styles.css, src/data.mjs.
Interfaces: tab state, issuer/type/chain filtering, source status, URL state, CSV, source-linked product/market/terms rows, historical chart.
- [x] Implement all surfaces and independent async loading/error/empty states, safe HTML and URL handling.
- [x] Verify actual desktop/mobile browser: all tabs, filters, favorite/share/export, contracts/handoffs, race guards and quote expiry.
- [x] Run detector and independent review, address material findings, commit.

### Task 4: Final validation and documentation
Files: scripts/integration.mjs, README.md, QA.md, PRODUCT.md, docs/progress.md.
- [x] Run full tests and final real integrations; record actual coverage and source limits.
- [x] Update run/configuration docs, leave app running and final clean commit.
