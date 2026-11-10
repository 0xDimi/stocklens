# Live Comparison Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The user authorized building directly in this session. Track task completion here and in progress.md.

**Goal:** Replace the synthetic demo with a working stock-token comparison and external purchase handoff.
**Architecture:** Vanilla client, Node HTTP API, issuer-backed catalog, bounded external-service adapters. Keep live data and UI separate.
**Tech Stack:** Node >=22, browser ES modules, node:test.
**Spec:** ../specs/2026-10-18-live-comparison.md

## Global Constraints
- No invented prices, ratios, routes, costs, or eligibility.
- Preserve minimal UI; avoid unnecessary dependencies.
- Quote fields must state included and excluded costs and current validity.
- Provider failures produce useful partial results, never fabricated substitutes.

## Review Focus
- Incorrect raw/scaled unit conversion can mis-rank a route.
- API failure, malformed data, or invalid contracts must fail closed.
- Rapid selection/amount changes must not display an old quote as current.
- Stale quotes must lose their ranking and purchase status.
- Untrusted upstream text and query input must not enter HTML unsanitized.

### Task 1: Verified catalog and normalization
Files: server/catalog.mjs, server/http.mjs, src/model.mjs, tests/model.test.mjs.
Interfaces: loadCatalog() returns stocks with issuer products and verified deployments; normalizeQuote() uses explicit amount units and conversion data.
- [x] Write failing precision, unit normalization, stale/invalid quote tests; run and observe failure.
- [x] Implement validated catalog, bounded fetch/cache, decimal handling, and normalization.
- [x] Run tests and validate real issuer responses.

### Task 2: Live quote API
Files: server/providers.mjs, server/quotes.mjs, server.mjs, tests/api.test.mjs, scripts/integration.mjs.
Interfaces: GET /api/catalog; GET /api/compare?stock=US67066G1040&amount=1000&chain=all. Responses identify source, time, cost basis, normalized output, and error reasons per route.
- [x] Add failing input-validation and provider-normalization tests.
- [x] Add independent quote adapters and partial failure handling; fixed public upstreams only.
- [x] Verify API against actual live stock contracts and save a compact integration report.

### Task 3: Working browser flow
Files: src/app.mjs, src/data.mjs, src/styles.css, index.html.
Interfaces: consumes catalog and compare endpoints; no synthetic arithmetic in client.
- [x] Replace demo data with live catalog, async state, abort/stale guards, expiry, refresh, contract links, and exact purchase handoffs.
- [x] Add URL state and local favorites with graceful storage failure.
- [x] Verify actual browser flow, mobile, keyboard access, failures, and displayed source/time details.

### Task 4: Release verification
Files: README.md, PRODUCT.md, QA.md, docs/progress.md.
- [x] Run full unit/API tests, live integration, and browser checks.
- [x] Obtain one independent whole-change review; fix material findings and repeat affected checks.
- [x] Record real coverage, run instructions, environment configuration, limitations, and commit.
