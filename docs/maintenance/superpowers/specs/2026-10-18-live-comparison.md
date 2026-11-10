# Live comparison product

Replace illustrative scenarios with a working, source-backed tokenized-equity comparison app. Preserve the accepted minimal interface. Buying means handing off to a verified, token-specific trading venue; the app does not custody funds or execute transactions.

## Scope
- Real stock catalog and token contracts from issuer sources. Initially cover xStocks and Ondo across Solana, Ethereum, and BNB Chain where verified deployments and data exist. Search, chain filters, order amount, source links, legal/exit summaries, and contract explorers work.
- Retrieve public quote responses from independent adapters. Only normalize equivalent exposure when token decimals and applicable chain-specific conversion units are verified. Quote retrieval failure never creates synthetic data.
- Compare same-chain USDC inputs. Funding and gas assumptions must be explicit. Route output includes embedded trading fees; external network cost is separate unless verifiably available. Rank a comparable cost basis, not a falsely complete all-in amount.
- Quote timestamps, freshness expiry, refresh, loading/empty/error states, and unavailable routes are first-class states. Prevent old responses overwriting a new selection.
- Source-fed reference prices are labeled with source and timestamp; absent underlying prices remain absent. No invented spread, liquidity, risk ranking, availability, or eligibility.
- Country restrictions are linked issuer facts, not a claim that selecting a country establishes suitability. Product notes and verified-source dates remain accessible from each row.
- Responsive and keyboard-accessible. Local favorites may persist without login. Shareable stock/amount/chain URL.

## Architecture
Keep vanilla client modules and Node's standard library server. Backend modules own fixed-host HTTP requests, bounded caches, catalog validation, issuer conversion data, and quote adapters. Browser never receives credentials. No runtime dependencies unless an actual integration requires them.

## Acceptance
Real integration checks must obtain and normalize actual stock-token quote responses, exercise the HTTP API, and verify the served app in a browser. Unit checks validate precision, unit conversion, expiry, input validation, and partial failures. Document exact coverage and unavailable upstream capabilities. No sample-data fallback in production.
