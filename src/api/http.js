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
    if (typeof err === "string") throw new Error(`${context}: ${err}`);
    const status = err?.status ?? err?.statusCode;
    const message = err?.message || err?.error_description || "request failed";
    throw new Error(
      status != null ? `${context}: ${status} — ${message}` : `${context}: ${message}`
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRateLimitError(err) {
    const msg = String(err?.message || err || "");
    return (
      msg.includes("429") ||
      /rate.?limit/i.test(msg) ||
      /too many requests/i.test(msg)
    );
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
        if (!isRateLimitError(err) || attempt === retries - 1) throw err;
        const retryAfter = parseRetryAfterMs(err);
        const delay =
          retryAfter != null
            ? retryAfter
            : Math.min(20000, 800 * Math.pow(2, attempt));
        console.warn(`MixApp: ${label} rate-limited, retry in ${delay}ms`);
        if (notifyUser && Date.now() - rateLimitNotifyAt > 4000) {
          rateLimitNotifyAt = Date.now();
          MixAppNotify.notify(
            "Spotify rate limit — backing off " +
              Math.ceil(delay / 1000) +
              "s…",
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
      async () => {
        const res = await Spicetify.CosmosAsync.get(url);
        return assertCosmosOk(res, url);
      },
      {
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
  }

  async function cosmosPost(url, body, opts = {}) {
    return withRetry(
      async () => {
        const res = await Spicetify.CosmosAsync.post(url, body);
        return assertCosmosOk(res, url);
      },
      {
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
  }

  async function cosmosPut(url, body, opts = {}) {
    return withRetry(
      async () => {
        const res = await Spicetify.CosmosAsync.put(url, body);
        return assertCosmosOk(res, url);
      },
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
    parseRetryAfterMs,
    withRetry,
    cosmosGet,
    cosmosPost,
    cosmosPut,
    formatDuration,
  };
})();
