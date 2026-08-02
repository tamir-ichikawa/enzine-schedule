// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる共通処理
// UI_THEME_SWITCHER_20260803_V88：Ocean Blueを既定にし、Muted Sageとの端末単位切替を提供

import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

import { db, functions } from "./firebase-config.js";

const DEFAULT_BRAND_NAME = "enzine";
const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const MAINTENANCE_DOC_ID = "maintenanceMode";
const UI_MODE_STORAGE_KEY = "enzineScheduleUiMode";
const UI_MODE_CLASSIC = "classic";
const UI_MODE_DASHBOARD = "dashboard";
const WEEKLY_REPORT_NAV_COUNT_KEY_PREFIX = "enzineWeeklyReportNavCount:";
const VALID_UI_MODES = new Set([UI_MODE_CLASSIC, UI_MODE_DASHBOARD]);
const uiModeNavigationPlacements = new Map();
let maintenanceWatcherStarted = false;
const getCurrentOfficeBrand = httpsCallable(functions, "getCurrentOfficeBrand");

function renderWeeklyReportNavPendingCount(count) {
  const normalizedCount = Math.max(0, Number.parseInt(count, 10) || 0);

  document.querySelectorAll("[data-weekly-report-nav-badge]").forEach((badge) => {
    const hidden = normalizedCount === 0;
    badge.textContent = normalizedCount > 99 ? "99+" : String(normalizedCount);
    badge.hidden = hidden;
    badge.classList.toggle("hidden", hidden);
    badge.setAttribute("aria-label", hidden ? "" : `未確認の週一報告 ${normalizedCount}件`);
  });

  return normalizedCount;
}

export function setWeeklyReportNavPendingCount(count, userId) {
  const normalizedCount = renderWeeklyReportNavPendingCount(count);
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return normalizedCount;
  }

  try {
    window.sessionStorage.setItem(`${WEEKLY_REPORT_NAV_COUNT_KEY_PREFIX}${normalizedUserId}`, String(normalizedCount));
  } catch (error) {
    console.warn("週一報告のメニュー通知を保存できませんでした。", error);
  }

  return normalizedCount;
}

export function restoreWeeklyReportNavPendingCount(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return renderWeeklyReportNavPendingCount(0);
  }

  try {
    return renderWeeklyReportNavPendingCount(
      window.sessionStorage.getItem(`${WEEKLY_REPORT_NAV_COUNT_KEY_PREFIX}${normalizedUserId}`) || 0
    );
  } catch (error) {
    console.warn("週一報告のメニュー通知を読み込めませんでした。", error);
    return renderWeeklyReportNavPendingCount(0);
  }
}

function normalizeUiMode(mode) {
  return VALID_UI_MODES.has(mode) ? mode : UI_MODE_DASHBOARD;
}

function readStoredUiMode() {
  try {
    return normalizeUiMode(window.localStorage.getItem(UI_MODE_STORAGE_KEY));
  } catch (error) {
    console.warn("画面デザイン設定を読み込めないためOcean Blueを使用します。", error);
    return UI_MODE_DASHBOARD;
  }
}

function updateUiModeButtons(mode) {
  document.querySelectorAll("[data-ui-mode-option]").forEach((button) => {
    const isSelected = button.dataset.uiModeOption === mode;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function syncPageNavigationPosition(mode) {
  if (mode === UI_MODE_DASHBOARD) {
    document.querySelectorAll(".app-main-shell > .page-tab-nav").forEach((navigation) => {
      if (!uiModeNavigationPlacements.has(navigation)) {
        const placeholder = document.createComment("page-tab-nav-original-position");
        navigation.parentNode?.insertBefore(placeholder, navigation);
        uiModeNavigationPlacements.set(navigation, placeholder);
      }
    });
  }

  uiModeNavigationPlacements.forEach((placeholder, navigation) => {
    if (mode === UI_MODE_DASHBOARD) {
      const shell = placeholder.parentElement;
      const topbarActions = shell?.querySelector(".app-topbar-actions");
      const settingsMenu = topbarActions?.querySelector(".app-settings-menu");

      if (topbarActions) {
        topbarActions.insertBefore(navigation, settingsMenu || null);
      }
      return;
    }

    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(navigation, placeholder.nextSibling);
    }
  });
}

export function applyUiMode(mode) {
  const normalizedMode = normalizeUiMode(mode);
  document.documentElement.dataset.uiMode = normalizedMode;
  syncPageNavigationPosition(normalizedMode);
  updateUiModeButtons(normalizedMode);
  return normalizedMode;
}

function saveUiMode(mode) {
  const normalizedMode = applyUiMode(mode);

  try {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, normalizedMode);
  } catch (error) {
    console.warn("画面デザイン設定を保存できませんでした。", error);
  }
}

export function setupUiModeSwitcher() {
  const settingsPanels = Array.from(document.querySelectorAll(".app-settings-panel"));
  const currentMode = applyUiMode(readStoredUiMode());

  settingsPanels.forEach((panel) => {
    if (panel.querySelector(".ui-mode-switcher")) {
      return;
    }

    const switcher = document.createElement("div");
    switcher.className = "ui-mode-switcher";
    switcher.innerHTML = `
      <div class="ui-mode-switcher-label">画面デザイン</div>
      <div class="ui-mode-switcher-options" role="group" aria-label="画面デザインを選択">
        <button type="button" class="ui-mode-option" data-ui-mode-option="dashboard" aria-pressed="false">
          Ocean Blue
        </button>
        <button type="button" class="ui-mode-option" data-ui-mode-option="classic" aria-pressed="false">
          Muted Sage
        </button>
      </div>
    `;

    const logoutButton = panel.querySelector(".app-settings-logout-button");
    panel.insertBefore(switcher, logoutButton || null);

    switcher.querySelectorAll("[data-ui-mode-option]").forEach((button) => {
      button.addEventListener("click", () => {
        saveUiMode(button.dataset.uiModeOption);

        const settingsMenu = button.closest(".app-settings-menu");
        if (settingsMenu) {
          settingsMenu.open = false;
        }
      });
    });
  });

  updateUiModeButtons(currentMode);
}

function initializeUiMode() {
  setupUiModeSwitcher();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeUiMode, { once: true });
} else {
  initializeUiMode();
}

function getOfficeDocumentCandidates(officeId) {
  const value = String(officeId || "").trim();

  if (!value || value === DEFAULT_OFFICE_ID || LEGACY_OFFICE_IDS.includes(value)) {
    return [DEFAULT_OFFICE_ID, ...LEGACY_OFFICE_IDS];
  }

  return [value];
}

function setOfficeBrandText(officeName) {
  const brandName = String(officeName || "").trim() || DEFAULT_BRAND_NAME;

  document.querySelectorAll(".app-brand-title").forEach((element) => {
    const officeNameElement = document.createElement("span");
    officeNameElement.className = "app-brand-office-name";
    officeNameElement.textContent = brandName;

    const scheduleLabelElement = document.createElement("span");
    scheduleLabelElement.className = "app-brand-schedule-label";
    scheduleLabelElement.textContent = "スケジュール";

    const displayUnits = Array.from(brandName).reduce(
      (total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.58 : 1),
      0
    );
    const officeNameFontSize = Math.max(10, Math.min(17, Math.floor(166 / Math.max(displayUnits, 1))));
    element.style.setProperty("--office-brand-font-size", `${officeNameFontSize}px`);
    element.replaceChildren(officeNameElement, scheduleLabelElement);
  });

  return brandName;
}

export async function applyOfficeBrandName(userData = {}) {
  const embeddedOfficeName = String(
    userData.officeName || userData.officeDisplayName || ""
  ).trim();

  if (embeddedOfficeName) {
    return setOfficeBrandText(embeddedOfficeName);
  }

  for (const officeId of getOfficeDocumentCandidates(userData.officeId)) {
    try {
      const officeSnap = await getDoc(doc(db, "offices", officeId));

      if (officeSnap.exists()) {
        const officeName = String(officeSnap.data()?.name || "").trim();

        if (officeName) {
          return setOfficeBrandText(officeName);
        }
      }
    } catch (error) {
      console.warn("Firestoreから事業所名を直接取得できませんでした。", error);
      break;
    }
  }

  try {
    const result = await getCurrentOfficeBrand({});
    const officeName = String(result?.data?.name || "").trim();

    if (officeName) {
      return setOfficeBrandText(officeName);
    }
  } catch (error) {
    console.warn("所属事業所名を取得できないため従来のブランド名を表示します。", error);
  }

  return setOfficeBrandText(DEFAULT_BRAND_NAME);
}

export async function getMaintenanceState() {
  try {
    const maintenanceSnap = await getDoc(doc(db, "system", MAINTENANCE_DOC_ID));

    if (!maintenanceSnap.exists()) {
      return { active: false, message: "", scheduledEndText: "" };
    }

    const data = maintenanceSnap.data() || {};
    return {
      active: data.active === true,
      message: String(data.message || "").trim(),
      scheduledEndText: String(data.scheduledEndText || "").trim(),
      updatedAt: data.updatedAt || null,
      updatedByName: String(data.updatedByName || "").trim()
    };
  } catch (error) {
    // 既存本番へ画面だけが先に反映されても停止させない。実際の遮断はFirestoreルールでも行う。
    console.warn("メンテナンス状態を取得できないため通常表示を継続します。", error);
    return { active: false, message: "", scheduledEndText: "", unavailable: true };
  }
}

export async function enforceMaintenanceAccess(userData = {}) {
  const maintenanceState = await getMaintenanceState();

  if (maintenanceState.active === true && userData.role !== "admin") {
    window.location.replace("maintenance.html");
    return false;
  }

  if (userData.role !== "admin" && !maintenanceWatcherStarted) {
    maintenanceWatcherStarted = true;
    onSnapshot(
      doc(db, "system", MAINTENANCE_DOC_ID),
      (maintenanceSnap) => {
        if (maintenanceSnap.exists() && maintenanceSnap.data()?.active === true) {
          window.location.replace("maintenance.html");
        }
      },
      (error) => {
        console.warn("メンテナンス状態の監視を開始できませんでした。", error);
      }
    );
  }

  return true;
}

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
