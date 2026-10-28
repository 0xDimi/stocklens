// One response carries independent source updates. A slow optional source must
// not hold back a price, and navigation cancels the reader through its signal.
export async function readMarketDetails(
  ids,
  {
    signal,
    onRows = () => {},
    company = false,
    buy = false,
    fetcher = fetch,
  } = {},
) {
  const query = new URLSearchParams({ ids: ids.join(",") });
  if (company) query.set("company", "1");
  if (buy) query.set("buy", "1");
  const response = await fetcher("/api/market-stream?" + query, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(40000)])
      : AbortSignal.timeout(40000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Market data request failed");
  }
  if (!response.body) throw new Error("Market data response is empty");
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    rows = new Map();
  let buffer = "",
    done = false;
  const accept = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error")
      throw new Error(event.error || "Market data refresh failed");
    if (event.type === "done") {
      done = true;
      return;
    }
    if (event.type !== "row" || !ids.includes(event.row?.id))
      throw new Error("Invalid market data update");
    rows.set(event.row.id, event.row);
    onRows([event.row]);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 2000000)
        throw new Error("Market update is too large");
      if (chunk.done) break;
    }
    if (buffer.trim()) accept(buffer);
    if (!done || ids.some((id) => !rows.has(id)))
      throw new Error("Market data response was incomplete; retry the refresh");
    return { rows: [...rows.values()], retrievedAt: new Date().toISOString() };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
