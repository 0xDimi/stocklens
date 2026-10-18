# Stocklens

Small tokenized-stock comparison demo. No runtime dependencies, build step, external fonts, analytics, or API keys. Node.js 22+.

```sh
cd /Users/dpechli/Desktop/Codex/Stocklens
npm start
```

Open http://127.0.0.1:4173. Override the port with `PORT=4174 npm start`.

## What works

Search NVIDIA, Apple, or Tesla; change the budget; filter by chain; compare modeled acquisition costs and equivalent exposure; expand sourced product notes; open official provider websites. No trades or wallet operations occur.

## Data boundary

Every reference price, conversion ratio, spread, impact coefficient, fee, and venue route is a synthetic scenario in `src/data.mjs`. Numerical outputs are calculated from those assumptions, not live quotes. The model assumes money is already on the destination chain and excludes bridging/funding costs, taxes, and future selling/redemption costs. It does not assess user eligibility or assert exhaustive coverage.

Provider documentation: https://xstocks.com/ and https://assets.backed.fi/legal-documentation; https://docs.ondo.finance/ondo-stocks/legal-and-regulatory; https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing. Structural source notes checked October 18, 2026. Product-specific documents remain authoritative.

## Files

- `src/data.mjs`: fixed catalog, sourced notes, and explicitly synthetic scenario inputs.
- `src/model.mjs`: pure cost normalization, filtering, and ranking.
- `src/app.mjs`: event handling and rendering.
- `src/styles.css`: responsive layout and accessible interaction states.
- `server.mjs`: local-only static server with an explicit public-file allowlist.

Run `npm test` for calculation invariants. Browser verification covers the actual UI separately. To add live data later, replace scenario inputs with a quote adapter that preserves timestamps, included/excluded costs, token units, source, and quote status. Do not relabel modeled data as live.
