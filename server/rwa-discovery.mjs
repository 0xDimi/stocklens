import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { observationStore } from "./observation-store.mjs";
import { readRuntime } from "./runtime.mjs";
import {
  defaultSeedPath,
  readSnapshot,
  writeSnapshot,
} from "./catalog-snapshot.mjs";
import {
  attachKnownProducts,
  mergeDiscovery,
  parseRwaTokens,
} from "./coingecko-identities.mjs";
const DAY = 86400000,
  MAX_AGE = 3 * DAY;
const safeId = (value) =>
  typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);

// Low-priority discovery owns a durable request allowance and never blocks a catalog response.
// The daily allowance covers only these additional catalog calls, not market/quote requests.
export function createRwaDiscovery({
  read,
  cacheDir = readRuntime().cacheDir,
  seedPath = defaultSeedPath,
  now = Date.now,
  dailyLimit = 64,
  nativeLimit = 24,
  accessMode = process.env.COINGECKO_API_KEY
    ? process.env.COINGECKO_PLAN || "demo"
    : "public",
} = {}) {
  const file = join(cacheDir, "rwa-discovery-v1.json");
  let state = {
    version: 1,
    day: "",
    requests: 0,
    nativeRequests: 0,
    issuers: {},
    native: {},
    errors: [],
  };
  let initialized, work;
  const age = (value) => now() - Date.parse(value?.retrievedAt);
  const eligible = (value) =>
    Number.isFinite(age(value)) && age(value) >= 0 && age(value) <= MAX_AGE;
  const due = (value) => !eligible(value) || age(value) >= DAY;
  const save = () => writeSnapshot(file, state);
  const initialize = () =>
    (initialized ||= (async () => {
      let saved;
      try {
        saved = JSON.parse(await readFile(file, "utf8"));
      } catch {}
      if (!saved)
        saved = (await readSnapshot(seedPath, { seed: true }))?.sources
          ?.coingecko?.value?.discoveryState;
      if (
        saved?.version === 1 &&
        saved.issuers &&
        saved.native &&
        Number.isInteger(saved.requests) &&
        saved.requests >= 0 &&
        Number.isInteger(saved.nativeRequests) &&
        saved.nativeRequests >= 0
      )
        state = saved;
      // A captured public outage does not establish the health of an authenticated deployment.
      // Keep request accounting when access changes; only the provider cooldown is reset.
      if ((state.accessMode || "public") !== accessMode) {
        state.retryAt = 0;
        state.errors = [];
      }
      state.accessMode = accessMode;
      const observed = await observationStore(
        join(cacheDir, "coingecko-observations.json"),
        seedPath
          ? new URL("./data/coingecko-observations.json.gz", import.meta.url)
          : null,
      ).load();
      for (const [path, value] of observed) {
        const id = path.match(/^\/rwas\/([a-z0-9-]+)\?/u)?.[1];
        if (
          id &&
          eligible(value) &&
          value.data?.id === id &&
          Array.isArray(value.data.tokens) &&
          (!state.native[id] ||
            Date.parse(state.native[id].retrievedAt) <
              Date.parse(value.retrievedAt))
        )
          state.native[id] = {
            data: value.data,
            retrievedAt: value.retrievedAt,
          };
      }
    })());
  const fetchCatalog = async (path) => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (state.day < day)
      Object.assign(state, { day, requests: 0, nativeRequests: 0 });
    const native = !path.startsWith("/rwas/issuers/");
    if (
      state.day !== day ||
      state.requests >= dailyLimit ||
      (native && state.nativeRequests >= nativeLimit)
    )
      return null;
    state.requests++;
    if (native) state.nativeRequests++;
    // Charge before I/O: a failure or process restart cannot reuse the same allowance.
    const persistenceError = await save();
    if (persistenceError)
      throw new Error(
        "Background discovery paused because its request allowance could not be persisted.",
      );
    const value = await read(path, DAY, { waitForFresh: true });
    if (!eligible(value) || value.stale)
      throw new Error(
        "Background catalog returned an expired, retained or undated observation.",
      );
    return { data: value.data, retrievedAt: value.retrievedAt };
  };
  const resource = async (path) => {
    const previous = state.resourceErrors?.[path];
    if (previous?.retryAt > now()) {
      state.errors.push(previous);
      return undefined;
    }
    try {
      return await fetchCatalog(path);
    } catch (error) {
      if (![403, 404].includes(error.status)) throw error;
      const issue = {
        message: error.message,
        checkedAt: new Date(now()).toISOString(),
        retryAt: now() + DAY,
      };
      state.resourceErrors ||= {};
      state.resourceErrors[path] = issue;
      state.errors.push(issue);
      await save();
      return undefined;
    }
  };
  const run = async (base) => {
    await initialize();
    if (state.retryAt > now()) return;
    state.errors = [];
    try {
      if (due(state.list)) {
        const result = await fetchCatalog("/rwas/issuers/list");
        if (!result) return;
        if (
          !Array.isArray(result.data) ||
          result.data.some((v) => !safeId(v.id) || typeof v.name !== "string")
        )
          throw new Error("Unexpected CoinGecko issuer list.");
        state.list = result;
        await save();
      }
      for (const issuer of state.list.data.slice(0, 64)) {
        if (!due(state.issuers[issuer.id])) continue;
        const result = await resource("/rwas/issuers/" + issuer.id);
        if (result === null) break;
        if (!result) continue;
        if (result.data?.id !== issuer.id || !Array.isArray(result.data.tokens))
          throw new Error("CoinGecko returned an unrelated issuer catalog.");
        state.issuers[issuer.id] = result;
        await save();
      }
      const candidates = base.stocks
        .filter((s) => safeId(s.rwaId))
        .sort(
          (a, b) =>
            Number(!!a.products.length) - Number(!!b.products.length) ||
            (Date.parse(state.native[a.rwaId]?.retrievedAt) || 0) -
              (Date.parse(state.native[b.rwaId]?.retrievedAt) || 0) ||
            a.rwaId.localeCompare(b.rwaId),
        );
      for (const stock of candidates) {
        if (!due(state.native[stock.rwaId])) continue;
        const result = await resource(
          `/rwas/${stock.rwaId}?tokens=true&tokenized_market_data=true`,
        );
        if (result === null) break;
        if (!result) continue;
        parseRwaTokens(result.data, stock, {
          includeWrapped: true,
          retrievedAt: result.retrievedAt,
        });
        state.native[stock.rwaId] = result;
        await save();
      }
      state.retryAt = 0;
    } catch (error) {
      state.errors = [
        ...state.errors,
        { message: error.message, checkedAt: new Date(now()).toISOString() },
      ];
      state.retryAt = now() + 3600000;
      await save();
    }
  };
  const refresh = async (base) => {
    await initialize();
    if (!work)
      work = run(base).finally(() => {
        work = null;
      });
    return work;
  };
  const augment = async (base, { refresh: shouldRefresh = true } = {}) => {
    await initialize();
    const registry = new Map((base.registry || []).map((c) => [c.id, c]));
    const catalogs = Object.values(state.issuers).filter(eligible);
    for (const observation of catalogs)
      for (const token of observation.data.tokens) {
        if (
          !safeId(token?.id) ||
          typeof token.symbol !== "string" ||
          typeof token.name !== "string"
        )
          continue;
        const old = registry.get(token.id);
        registry.set(token.id, {
          ...old,
          ...token,
          sourceAt: observation.retrievedAt,
          issuer_details: {
            id: observation.data.id,
            name: observation.data.name,
          },
        });
      }
    let stocks = attachKnownProducts(
      base.stocks,
      [...registry.values()],
      base.retrievedAt,
    );
    let nativeMappings = 0;
    for (const stock of stocks) {
      const observation = state.native[stock.rwaId];
      if (!eligible(observation)) continue;
      try {
        const products = parseRwaTokens(observation.data, stock, {
          includeWrapped: true,
          retrievedAt: observation.retrievedAt,
        });
        const merged = mergeDiscovery(
          [stock],
          [{ ...stock, products, nativeCheckedAt: observation.retrievedAt }],
        )[0];
        Object.assign(stock, merged);
        nativeMappings++;
      } catch {
        /* A changed underlying must be fetched again before its mapping can apply. */
      }
    }
    const coverage = {
      issuerCatalogs: catalogs.length,
      nativeMappings,
      requestsToday: state.requests,
      requestLimit: dailyLimit,
      nativeLimit,
      day: state.day,
      refreshing: !!work,
      errors: state.errors || [],
    };
    const result = {
      ...base,
      stocks,
      registry: [...registry.values()],
      universe: {
        ...base.universe,
        issuerCatalogs: catalogs.length,
        nativeMappings,
      },
      discoveryState: structuredClone(state),
      discoveryCoverage: coverage,
    };
    if (shouldRefresh) refresh(base).catch(() => {});
    return result;
  };
  return {
    augment,
    refresh,
    async issuerObservations() {
      await initialize();
      return structuredClone(Object.values(state.issuers).filter(eligible));
    },
  };
}
