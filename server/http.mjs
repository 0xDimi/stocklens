const cache = new Map();
const MAX_ENTRIES = 500;
export async function memo(key, ttl, load) {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  const promise = Promise.resolve().then(load);
  cache.set(key, { promise, expires: Date.now() + ttl });
  try {
    return await promise;
  } catch (error) {
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw error;
  }
}
const waiting = [];
let activeRequests = 0;
const MAX_ACTIVE_REQUESTS = 16;
const MAX_WAITING_REQUESTS = 64;
function acquireRequest(timeout) {
  if (activeRequests < MAX_ACTIVE_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_WAITING_REQUESTS)
    return Promise.reject(
      new Error("Data sources are busy. Please retry shortly."),
    );
  return new Promise((resolve, reject) => {
    const job = { resolve, timer: null };
    job.timer = setTimeout(() => {
      const index = waiting.indexOf(job);
      if (index >= 0) waiting.splice(index, 1);
      reject(new Error("Data source queue timed out. Please retry shortly."));
    }, timeout);
    waiting.push(job);
  });
}
function releaseRequest() {
  const job = waiting.shift();
  if (job) {
    clearTimeout(job.timer);
    job.resolve();
  } else activeRequests--;
}
export async function request(
  url,
  { json = true, timeout = 12_000, headers = {}, method = "GET", body } = {},
) {
  const deadline = Date.now() + timeout;
  await acquireRequest(timeout);
  try {
    const response = await fetch(url, {
      method,
      body,
      headers: {
        "User-Agent": "Stocklens/0.3",
        Accept: "application/json",
        ...headers,
      },
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      redirect: "follow",
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 429
          ? "Data provider rate limit reached. Please refresh shortly."
          : `Data provider returned HTTP ${response.status}.`,
      );
      error.status = response.status;
      throw error;
    }
    const reader = response.body.getReader();
    let length = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8_000_000)
          throw new Error("Data provider response is too large.");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return json ? JSON.parse(text) : text;
  } finally {
    releaseRequest();
  }
}
export async function rpc(url, method, params) {
  const result = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (result.error) {
    const error = new Error("Onchain data is unavailable for this contract.");
    error.rpcCode = result.error.code;
    throw error;
  }
  if (result.result == null) throw new Error("Onchain data is missing.");
  return result.result;
}
export async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        output[i] = await fn(items[i], i);
      }
    }),
  );
  return output;
}
