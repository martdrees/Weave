//@ts-check
/** User-facing notifications (Spicetify toast). */

const MixAppNotify = (() => {
  function notify(message, isError) {
    if (Spicetify?.showNotification) {
      Spicetify.showNotification(message, !!isError);
    }
  }

  return { notify };
})();
