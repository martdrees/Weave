//@ts-check
/**
 * Cosmos / Web API transport: retry, assert, get/post/put.
 */

const WeaveHttp = (() => {
  function playlistIdFromUri(uri) {
    if (!uri) return null;
    const parts = String(uri).split(":");
    return parts[parts.length - 1] || null;
  }

  /** CosmosAsync often resolves with `{ error }` instead of throwing. */
  function assertCosmosOk(response, context) {
    if (response == null) return response;
    if (typeof response !== "object") return response;
    if (!("error" in response)) return response;
    const err = response.error;
    // Empty-string / bare error bodies are common on 429 under client tokens.
    if (err === true || err === "" || err == null) {
      throw new Error(`${context}: 429 — request failed (likely rate limited)`);
    }
    if (typeof err === "string") {
      const text = err.trim() || "429 — request failed (likely rate limited)";
      throw new Error(`${context}: ${text}`);
    }
    const status = err?.status ?? err?.statusCode ?? err?.code;
    const message =
      err?.message ||
      err?.error_description ||
      (typeof err?.error === "string" ? err.error : null) ||
      (status === 429 ? "Too Many Requests" : null);
    if (status != null) {
      throw new Error(`${context}: ${status} — ${message || "request failed"}`);
    }
    // Client-token cosmos often returns `{ error: {} }` on 429 with no status.
    if (!message) {
      throw new Error(`${context}: 429 — request failed (likely rate limited)`);
    }
    throw new Error(`${context}: ${message}`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRateLimitError(err) {
    const msg = String(err?.message || err || "");
    return (
      msg.includes("429") ||
      /rate.?limit/i.test(msg) ||
      /too many requests/i.test(msg) ||
      /likely rate limited/i.test(msg)
    );
  }

  /** HTTP / cosmos errors that must not be retried (gone / forbidden). */
  function isNotFoundError(err) {
    const msg = String(err?.message || err || "");
    if (/\b404\b/.test(msg)) return true;
    if (/resource not found|playlist not found|not be found/i.test(msg)) {
      return true;
    }
    return false;
  }

  function isForbiddenError(err) {
    const msg = String(err?.message || err || "");
    return /\b403\b/.test(msg) || /forbidden|access denied/i.test(msg);
  }

  function isNonRetryableHttpError(err) {
    return (
      isNotFoundError(err) ||
      isForbiddenError(err) ||
      /\b401\b/.test(String(err?.message || err || ""))
    );
  }

  /** Serialize Cosmos calls so a meta+tracks stampede does not trip 429. */
  let cosmosTail = Promise.resolve();
  let lastCosmosAt = 0;
  const COSMOS_MIN_GAP_MS = 450;

  /** Shared cool-down after any 429 — stops parallel callers from stampeding. */
  let coolDownUntil = 0;
  let rateLimitNotifyAt = 0;

  function enqueueCosmos(fn) {
    const run = cosmosTail.then(async () => {
      const coolWait = coolDownUntil - Date.now();
      const gapWait = COSMOS_MIN_GAP_MS - (Date.now() - lastCosmosAt);
      const wait = Math.max(coolWait > 0 ? coolWait : 0, gapWait > 0 ? gapWait : 0);
      if (wait > 0) await sleep(wait);
      lastCosmosAt = Date.now();
      return fn();
    });
    cosmosTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function parseRetryAfterMs(err) {
    const msg = String(err?.message || err || "");
    const m = msg.match(/retry[- ]after[:\s]*(\d+)/i);
    if (m) {
      const sec = parseInt(m[1], 10);
      if (Number.isFinite(sec) && sec > 0) return Math.min(60000, sec * 1000);
    }
    return null;
  }

  function markRateLimited(delayMs) {
    const ms = Math.max(500, Number(delayMs) || 2000);
    coolDownUntil = Math.max(coolDownUntil, Date.now() + ms);
  }

  function isCoolingDown() {
    return Date.now() < coolDownUntil;
  }

  function coolDownRemainingMs() {
    return Math.max(0, coolDownUntil - Date.now());
  }

  async function withRetry(
    fn,
    {
      retries = 4,
      label = "request",
      notifyUser = true,
      failFastOnCooldown = false,
    } = {}
  ) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
      const remaining = coolDownRemainingMs();
      if (remaining > 0) {
        if (failFastOnCooldown) {
          throw new Error(
            `${label}: 429 — cooling down ${Math.ceil(remaining / 1000)}s`
          );
        }
        await sleep(Math.min(remaining, 20000));
      }
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (isNonRetryableHttpError(err)) throw err;
        if (!isRateLimitError(err)) throw err;

        const retryAfter = parseRetryAfterMs(err);
        const delay =
          retryAfter != null ? retryAfter : Math.min(20000, 800 * Math.pow(2, attempt));
        markRateLimited(delay);

        if (attempt === retries - 1) throw err;

        console.warn(`Weave: ${label} rate-limited, retry in ${delay}ms`);
        if (notifyUser && Date.now() - rateLimitNotifyAt > 4000) {
          rateLimitNotifyAt = Date.now();
          WeaveNotify.notify(
            WeaveI18n.t("notify.rateLimitBackoff", {
              seconds: Math.ceil(delay / 1000),
            }),
            true
          );
        }
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  async function cosmosGet(url, opts = {}) {
    return withRetry(
      () =>
        enqueueCosmos(async () => {
          const res = await Spicetify.CosmosAsync.get(url);
          return assertCosmosOk(res, url);
        }),
      {
        retries: opts.retries ?? 3,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
        failFastOnCooldown: !!opts.failFastOnCooldown,
      }
    );
  }

  async function cosmosPost(url, body, opts = {}) {
    return withRetry(
      () =>
        enqueueCosmos(async () => {
          const res = await Spicetify.CosmosAsync.post(url, body);
          return assertCosmosOk(res, url);
        }),
      {
        retries: opts.retries ?? 3,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
        failFastOnCooldown: !!opts.failFastOnCooldown,
      }
    );
  }

  async function cosmosPut(url, body, opts = {}) {
    return withRetry(
      () =>
        enqueueCosmos(async () => {
          const res = await Spicetify.CosmosAsync.put(url, body);
          return assertCosmosOk(res, url);
        }),
      {
        retries: opts.retries ?? 3,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
        failFastOnCooldown: !!opts.failFastOnCooldown,
      }
    );
  }

  /** Cached /v1/me — prefer Platform session; negative-cache on failure. */
  let meCache = null;
  let meInflight = null;
  const ME_TTL_MS = 30 * 60 * 1000;

  function readPlatformMe() {
    const session = Spicetify?.Platform?.Session;
    const id =
      session?.userID ||
      session?.userId ||
      session?.username ||
      Spicetify?.User?.id ||
      null;
    const country =
      session?.country || Spicetify?.Platform?.PlatformData?.country || null;
    return {
      id: id ? String(id) : null,
      country: country ? String(country) : null,
    };
  }

  /**
   * @returns {Promise<{ id: string|null, country: string, source: string }>}
   */
  async function getMeProfile() {
    if (meCache) {
      const ttl = meCache.source === "fallback" ? 60 * 1000 : ME_TTL_MS;
      if (Date.now() - meCache.at < ttl) return meCache;
    }
    if (meInflight) return meInflight;

    meInflight = (async () => {
      const plat = readPlatformMe();
      if (plat.id && plat.country) {
        meCache = {
          id: plat.id,
          country: plat.country,
          at: Date.now(),
          source: "platform",
        };
        return meCache;
      }

      if (!isCoolingDown()) {
        try {
          const me = await cosmosGet("https://api.spotify.com/v1/me", {
            retries: 1,
            label: "profile",
            notifyUser: false,
            failFastOnCooldown: true,
          });
          meCache = {
            id: me?.id || plat.id || null,
            country: me?.country || plat.country || "US",
            at: Date.now(),
            source: "api",
          };
          return meCache;
        } catch (err) {
          // Expected under 429 — avoid flooding the console every search.
          if (!isRateLimitError(err)) {
            console.warn("Weave: /me failed, using fallback", err);
          }
        }
      }

      // Negative-cache so callers stop hammering /v1/me.
      meCache = {
        id: plat.id || null,
        country: plat.country || "US",
        at: Date.now(),
        source: "fallback",
      };
      return meCache;
    })().finally(() => {
      meInflight = null;
    });

    return meInflight;
  }

  function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return {
    playlistIdFromUri,
    assertCosmosOk,
    sleep,
    isRateLimitError,
    isNotFoundError,
    isForbiddenError,
    isNonRetryableHttpError,
    parseRetryAfterMs,
    markRateLimited,
    isCoolingDown,
    coolDownRemainingMs,
    withRetry,
    cosmosGet,
    cosmosPost,
    cosmosPut,
    getMeProfile,
    formatDuration,
  };
})();
