# Stocklens Comparison Release Implementation Plan

> **For agentic workers:** Use focused parallel implementation for independent provider, reference and stock-page modules; the parent integrates Home and Markets and verifies the whole release.

**Goal:** Clear comparison choices, broader real quotes, useful prices/premiums and stock research/comparison pages.

**Architecture:** Keep the existing Node server and browser modules. Extend source adapters and additive market-detail fields, with isolated stock-page and comparison presentation modules. Parent owns routing, Home, Markets and static-module integration.

**Tech Stack:** Node 22+, browser ES modules, native CSS, zero runtime dependencies.

**Spec:** ../specs/2026-10-20-comparison-release.md

## Global Constraints
- Preserve the daylight Stocklens identity.
- Keep the single existing Render service and free sources; no paid upgrades or new credentials.
- No custody, wallet infrastructure or transaction submission.
- Unknown data stays unknown; source identity, units and dates remain explicit.

## Review Focus
- Date-only closing prices must not appear as a fabricated midnight trade.
- Multiple providers for one deployment must not inflate version/coverage counts.
- Quotes can expire during slow source calls; timestamps and rank eligibility remain honest.
- Rapid page/stock switching must not allow stale asynchronous results to replace current state.
- Selecting stocks differs from selecting token products; both remain usable on mobile and by keyboard.

## Tasks
- [x] Quote coverage: reproduce missing routes; test/implement public Jupiter and Velora adapters, expose actual liquidity sources; bound latency and preserve original expiry. Owned server/providers, quotes and new adapter/tests.
- [x] References: reproduce missing closed price; test/repair source timestamp parsing; add exact-contract, share-normalized spot premiums with disclosed provenance. Owned fundamentals, market-details and new source/tests.
- [x] Stock pages: test bounded asset selection/chart semantics; implement isolated overview, issuer/network details and multi-stock comparison modules. Parent wires route/shell.
- [x] Home/Markets: regress deployment counting, quote/provider presentation and date precision; implement explicit labels, failed-route disclosure, side-by-side prices, stock selection and history navigation.
- [x] Verify: run full regressions and strict production smoke; real HTTP integrations; actual desktop/mobile CUA flows; independent review; CI and public rollout checks. Update release docs with observed limits.
