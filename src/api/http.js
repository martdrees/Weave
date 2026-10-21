//@ts-check
/**
 * Cosmos / Web API transport: retry, assert, get/post/put.
 */

const MixAppHttp = (() => {
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
      throw new Error(
        `${context}: ${status} — ${message || "request failed"}`
      );
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
    return isNotFoundError(err) || isForbiddenError(err) || /\b401\b/.test(
      String(err?.message || err || "")
    );
  }

  /** Serialize Cosmos calls so a meta+tracks stampede does not trip 429. */
  let cosmosTail = Promise.resolve();
  let lastCosmosAt = 0;
  const COSMOS_MIN_GAP_MS = 400;

  function enqueueCosmos(fn) {
    const run = cosmosTail.then(async () => {
      const wait = COSMOS_MIN_GAP_MS - (Date.now() - lastCosmosAt);
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

  let rateLimitNotifyAt = 0;

  async function withRetry(
    fn,
    { retries = 6, label = "request", notifyUser = true } = {}
  ) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (isNonRetryableHttpError(err)) throw err;
        if (!isRateLimitError(err) || attempt === retries - 1) throw err;
        const retryAfter = parseRetryAfterMs(err);
        const delay =
          retryAfter != null ? retryAfter : Math.min(20000, 800 * Math.pow(2, attempt));
        console.warn(`Weave: ${label} rate-limited, retry in ${delay}ms`);
        if (notifyUser && Date.now() - rateLimitNotifyAt > 4000) {
          rateLimitNotifyAt = Date.now();
          MixAppNotify.notify(
            MixAppI18n.t("notify.rateLimitBackoff", {
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
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
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
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
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
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
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
    withRetry,
    cosmosGet,
    cosmosPost,
    cosmosPut,
    formatDuration,
  };
})();
