/**
 * Generator create boundary — i18n notify on failure (ADR 006).
 * Phase 4 UI should call this instead of bare createPlaylist + silent catch.
 */

import { api as WeaveApi } from "../api/spotify.ts";
import { t } from "../i18n/index.ts";

export type CreateGeneratedPlaylistDeps = {
  createPlaylist: (name: string, uris: string[]) => Promise<string>;
  notify: (message: unknown, isError?: boolean) => void;
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (msg != null && String(msg).trim()) return String(msg);
  }
  return fallback;
}

export async function createGeneratedPlaylist(
  name: string,
  uris: string[],
  deps: CreateGeneratedPlaylistDeps = {
    createPlaylist: async (n, u) => String(await WeaveApi.createPlaylist(n, u)),
    notify: WeaveApi.notify,
  }
): Promise<string> {
  const title = String(name || "").trim() || t("generator.defaultName");
  const list = (uris || []).filter(Boolean);
  try {
    const uri = await deps.createPlaylist(title, list);
    deps.notify(t("notify.generatorCreated", { name: title, count: list.length }));
    return uri;
  } catch (err: unknown) {
    console.error(err);
    const msg = errorMessage(err, t("notify.createFailed"));
    deps.notify(msg, true);
    throw err;
  }
}
