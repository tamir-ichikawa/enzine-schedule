import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { getMaintenanceState } from "./ui-common.js?v=84";

const maintenancePageTitle = document.getElementById("maintenancePageTitle");
const maintenancePageMessage = document.getElementById("maintenancePageMessage");
const maintenanceLogoutButton = document.getElementById("maintenanceLogoutButton");

function setElementHidden(element, hidden) {
  if (!element) {
    return;
  }

  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

function getRoleHomePath(userData = {}) {
  if (userData.role === "admin") {
    return "admin.html";
  }
  if (userData.role === "staff") {
    return "staff.html";
  }
  return "user.html";
}

function renderMaintenanceState(state) {
  maintenancePageTitle.textContent = "メンテナンス中です";
  const publicMessage = state.scheduledEndText || state.message || "";
  maintenancePageMessage.textContent = publicMessage;
  setElementHidden(maintenancePageMessage, !publicMessage);
}

maintenanceLogoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  const maintenanceState = await getMaintenanceState();

  if (maintenanceState.active !== true) {
    if (!user) {
      window.location.replace("index.html");
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      window.location.replace(userSnap.exists() ? getRoleHomePath(userSnap.data()) : "index.html");
    } catch (_error) {
      window.location.replace("index.html");
    }
    return;
  }

  renderMaintenanceState(maintenanceState);

  if (!user) {
    setElementHidden(maintenanceLogoutButton, true);
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.exists() ? userSnap.data() || {} : {};

    if (userData.role === "admin" && userData.active === true) {
      window.location.replace("admin.html");
      return;
    }

    setElementHidden(maintenanceLogoutButton, false);
  } catch (error) {
    console.warn("ログイン中アカウントを確認できませんでした。", error);
    setElementHidden(maintenanceLogoutButton, false);
  }
});
