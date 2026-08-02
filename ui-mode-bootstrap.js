// CSSの初回描画より前に画面デザインを確定し、Muted SageからOcean Blueへのちらつきを防ぐ。
(() => {
  const storageKey = "enzineScheduleUiMode";
  let mode = "dashboard";

  try {
    if (window.localStorage.getItem(storageKey) === "classic") {
      mode = "classic";
    }
  } catch (error) {
    mode = "dashboard";
  }

  document.documentElement.dataset.uiMode = mode;
})();
