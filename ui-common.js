// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる共通処理

import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

import { db, functions } from "./firebase-config.js";

const DEFAULT_BRAND_NAME = "enzine";
const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const MAINTENANCE_DOC_ID = "maintenanceMode";
let maintenanceWatcherStarted = false;
const getCurrentOfficeBrand = httpsCallable(functions, "getCurrentOfficeBrand");

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
    element.textContent = `${brandName} スケジュール`;
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
