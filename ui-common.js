// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる共通処理

export function setupSettingsMenuClose() {
  const settingsMenus = Array.from(document.querySelectorAll(".app-settings-menu"));

  if (!settingsMenus.length) {
    return;
  }

  function closeOtherMenus(currentMenu) {
    settingsMenus.forEach((menu) => {
      if (menu !== currentMenu) {
        menu.open = false;
      }
    });
  }

  settingsMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) {
        closeOtherMenus(menu);
      }
    });
  });

  document.addEventListener("click", (event) => {
    settingsMenus.forEach((menu) => {
      if (menu.open && !menu.contains(event.target)) {
        menu.open = false;
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    settingsMenus.forEach((menu) => {
      menu.open = false;
    });
  });
}
