//@ts-check
/** User-facing notifications (Spicetify toast). */

const WeaveNotify = (() => {
  function notify(message, isError) {
    const text = String(message ?? "").trim();
    if (!text) return;
    if (Spicetify?.showNotification) {
      Spicetify.showNotification(text, !!isError);
    }
  }

  return { notify };
})();
