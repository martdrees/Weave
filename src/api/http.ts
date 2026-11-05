/**
 * Cosmos / Web API transport: retry, assert, get/post/put.
 * Wrapper-first for identity (Platform session); /v1/me only as last resort (ADR 009).
 */

import { notify } from "./notify.ts";
import { t } from "../i18n/index.ts";

export function playlistIdFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const parts = String(uri).split(":");
  return parts[parts.length - 1] || null;
}

/** CosmosAsync often resolves with `{ error }` instead of throwing. */
export function assertCosmosOk<T>(response: T, context: string): T {
  if (response == null) return response;
  if (typeof response !== "object") return response;
  if (!("error" in (response as object))) return response;
  const err = (response as unknown as { error: unknown }).error;
  // Empty-string / bare error bodies are common on 429 under client tokens.
  if (err === true || err === "" || err == null) {
    throw new Error(`${context}: 429 — request failed (likely rate limited)`);
  }
  if (typeof err === "string") {
    const text = err.trim() || "429 — request failed (likely rate limited)";
    throw new Error(`${context}: ${text}`);
  }
  const errObj = err as {
    status?: number;
    statusCode?: number;
    code?: number | string;
    message?: string;
    error_description?: string;
    error?: string;
  };
  const status = errObj?.status ?? errObj?.statusCode ?? errObj?.code;
  const message =
    errObj?.message ||
    errObj?.error_description ||
    (typeof errObj?.error === "string" ? errObj.error : null) ||
    (status === 429 ? "Too Many Requests" : null);
  if (status != null) {
    throw new Error(`${context}: ${status} — ${message || "request failed"}`);
  }
  if (!message) {
    throw new Error(`${context}: 429 — request failed (likely rate limited)`);
  }
  throw new Error(`${context}: ${message}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return (
    msg.includes("429") ||
    /rate.?limit/i.test(msg) ||
    /too many requests/i.test(msg) ||
    /likely rate limited/i.test(msg)
  );
}

/** HTTP / cosmos errors that must not be retried (gone / forbidden). */
export function isNotFoundError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  if (/\b404\b/.test(msg)) return true;
  if (/resource not found|playlist not found|not be found/i.test(msg)) {
    return true;
  }
  return false;
}

export function isForbiddenError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return /\b403\b/.test(msg) || /forbidden|access denied/i.test(msg);
}

export function isNonRetryableHttpError(err: unknown): boolean {
  return (
    isNotFoundError(err) ||
    isForbiddenError(err) ||
    /\b401\b/.test(String((err as { message?: string })?.message || err || ""))
  );
}

/** Serialize Cosmos calls so a meta+tracks stampede does not trip 429. */
let cosmosTail: Promise<unknown> = Promise.resolve();
let lastCosmosAt = 0;
const COSMOS_MIN_GAP_MS = 450;

/** Shared cool-down after any 429 — stops parallel callers from stampeding. */
let coolDownUntil = 0;
let rateLimitNotifyAt = 0;

function enqueueCosmos<T>(fn: () => Promise<T>): Promise<T> {
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

export function parseRetryAfterMs(err: unknown): number | null {
  const msg = String((err as { message?: string })?.message || err || "");
  const m = msg.match(/retry[- ]after[:\s]*(\d+)/i);
  if (m) {
    const sec = parseInt(m[1], 10);
    if (Number.isFinite(sec) && sec > 0) return Math.min(60000, sec * 1000);
  }
  return null;
}

export function markRateLimited(delayMs: number): void {
  const ms = Math.max(500, Number(delayMs) || 2000);
  coolDownUntil = Math.max(coolDownUntil, Date.now() + ms);
}

export function isCoolingDown(): boolean {
  return Date.now() < coolDownUntil;
}

export function coolDownRemainingMs(): number {
  return Math.max(0, coolDownUntil - Date.now());
}

export type RetryOpts = {
  retries?: number;
  label?: string;
  notifyUser?: boolean;
  failFastOnCooldown?: boolean;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 4,
    label = "request",
    notifyUser = true,
    failFastOnCooldown = false,
  }: RetryOpts = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const remaining = coolDownRemainingMs();
    if (remaining > 0) {
      if (failFastOnCooldown) {
        throw new Error(`${label}: 429 — cooling down ${Math.ceil(remaining / 1000)}s`);
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
        notify(
          t("notify.rateLimitBackoff", {
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

export type CosmosOpts = RetryOpts;

export async function cosmosGet(url: string, opts: CosmosOpts = {}): Promise<any> {
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

export async function cosmosPost(
  url: string,
  body: unknown,
  opts: CosmosOpts = {}
): Promise<any> {
  return withRetry(
    () =>
      enqueueCosmos(async () => {
        const res = await Spicetify.CosmosAsync.post(
          url,
          body as Record<string, unknown>
        );
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

export async function cosmosPut(
  url: string,
  body: unknown,
  opts: CosmosOpts = {}
): Promise<any> {
  return withRetry(
    () =>
      enqueueCosmos(async () => {
        const res = await Spicetify.CosmosAsync.put(
          url,
          body as Record<string, unknown>
        );
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
let meCache: {
  id: string | null;
  country: string;
  at: number;
  source: string;
} | null = null;
let meInflight: Promise<{
  id: string | null;
  country: string;
  source: string;
  at: number;
}> | null = null;
const ME_TTL_MS = 30 * 60 * 1000;

function readPlatformMe(): { id: string | null; country: string | null } {
  const session = Spicetify?.Platform?.Session as
    | {
        userID?: string;
        userId?: string;
        username?: string;
        country?: string;
      }
    | undefined;
  const id =
    session?.userID ||
    session?.userId ||
    session?.username ||
    (Spicetify as { User?: { id?: string } })?.User?.id ||
    null;
  const country =
    session?.country ||
    (Spicetify?.Platform as { PlatformData?: { country?: string } } | undefined)
      ?.PlatformData?.country ||
    null;
  return {
    id: id ? String(id) : null,
    country: country ? String(country) : null,
  };
}

/**
 * Prefer Platform session; Web API /v1/me only as last resort when Platform
 * lacks id+country (ADR 009).
 */
export async function getMeProfile(): Promise<{
  id: string | null;
  country: string;
  source: string;
}> {
  if (meCache) {
    const ttl = meCache.source === "fallback" ? 60 * 1000 : ME_TTL_MS;
    if (Date.now() - meCache.at < ttl) return meCache;
  }
  if (meInflight) return meInflight;

  const inflight = (async () => {
    try {
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
          // Last resort: Web API /v1/me when Platform session is incomplete (ADR 009).
          const me = (await cosmosGet("https://api.spotify.com/v1/me", {
            retries: 1,
            label: "profile",
            notifyUser: false,
            failFastOnCooldown: true,
          })) as { id?: string; country?: string };
          meCache = {
            id: me?.id || plat.id || null,
            country: me?.country || plat.country || "US",
            at: Date.now(),
            source: "api",
          };
          return meCache;
        } catch (err) {
          if (!isRateLimitError(err)) {
            console.warn("Weave: /me failed, using fallback", err);
          }
        }
      }

      meCache = {
        id: plat.id || null,
        country: plat.country || "US",
        at: Date.now(),
        source: "fallback",
      };
      return meCache;
    } finally {
      meInflight = null;
    }
  })();
  meInflight = inflight;
  return inflight;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
