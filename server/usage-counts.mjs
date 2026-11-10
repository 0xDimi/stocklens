export function createUsageCounts(server) {
  const counts = new Map();
  function flush() {
    if (!counts.size) return;
    console.info("Stocklens usage", JSON.stringify(Object.fromEntries(counts)));
    counts.clear();
  }
  const timer = setInterval(flush, 60000);
  timer.unref();
  server.once("close", () => {
    clearInterval(timer);
    flush();
  });
  return (event, value) => {
    const key = event + ":" + value;
    if (counts.has(key) || counts.size < 500)
      counts.set(key, (counts.get(key) || 0) + 1);
  };
}
