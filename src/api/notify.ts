/** User-facing notifications (Spicetify toast). */

export function notify(message: unknown, isError?: boolean): void {
  const text = String(message ?? "").trim();
  if (!text) return;
  if (Spicetify?.showNotification) {
    Spicetify.showNotification(text, !!isError);
  }
}
