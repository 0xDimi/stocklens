# Demo verification — October 18, 2026

## Real browser checks

Verified against the running local server in the Codex in-app browser:

- Default NVIDIA comparison renders six modeled routes.
- Changing $1,000 to $10,000 recalculates all values and changes the leading scenario from xStocks/Solana to Ondo/Ethereum.
- Selecting Solana filters the list to two routes.
- Expanding Ondo shows structural notes, sources, fee assumptions, and the official provider link.
- Apple and Tesla selection update the company and comparison. Keyboard focus remains on the selected stock button after selection.
- An empty budget displays a validation message and removes numeric results; a preset restores valid results.
- An unmatched search displays a useful empty state; searching a company name finds its stock.
- The assumptions dialog opens, traps focus using native dialog behavior, and closes with Escape.
- Reviewed desktop and phone layouts at 390px and 320px. Stock rail scrolls internally on narrow phones; the document has no horizontal overflow.
- Browser error/warning log was empty at final inspection.

## Automated checks

- `npm test`: five passing tests for all-in fee accounting, share conversion, ranking, size-dependent ranking, invalid budgets, filtering, and search.
- JavaScript syntax checks pass.
- Static server returns HTTP 200 for the app and JavaScript module, and HTTP 404 for private product documentation.
- Impeccable detector reported no findings.
- Independent code review identified summary-name and stock-focus accessibility issues; both were corrected and checked in the browser.

## Limit

These checks validate the interactive demo and its explicitly synthetic calculation model. They do not validate live prices, market coverage, actual venue liquidity, individual eligibility, or trade execution. No live quote integration exists in this demo.
