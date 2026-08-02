import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { getMaintenanceState } from "./ui-common.js?v=84";

const loginMain = document.getElementById("maintenanceAdminLoginMain");
const loginForm = document.getElementById("maintenanceAdminLoginForm");
const emailInput = document.getElementById("maintenanceAdminEmail");
const passwordInput = document.getElementById("maintenanceAdminPassword");
const loginButton = document.getElementById("maintenanceAdminLoginSubmit");
const message = document.getElementById("maintenanceAdminLoginMessage");

function setElementHidden(element, hidden) {
  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

function setLoginMessage(text, color = "red") {
  message.style.color = color;
  message.textContent = text;
}

function setLoginLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "確認中..." : "ログイン";
}

function waitForInitialAuthState() {
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, () => {
      unsubscribe();
      resolve(null);
    });
  });
}

async function maintenanceIsActive() {
  const state = await getMaintenanceState();
  return state.active === true;
}

async function openAdminPageIfAuthorized(user) {
  if (!user) {
    return false;
  }

  if (!(await maintenanceIsActive())) {
    await signOut(auth);
    window.location.replace("index.html");
    return true;
  }

  const profileSnap = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() || {} : {};

  if (profile.active !== true || profile.role !== "admin") {
    return false;
  }

  // 確認中に解除された場合も、この専用入口からは通常ログインへ戻す。
  if (!(await maintenanceIsActive())) {
    await signOut(auth);
    window.location.replace("index.html");
    return true;
  }

  window.location.replace("admin.html");
  return true;
}

async function rejectCurrentSession(text) {
  if (auth.currentUser) {
    await signOut(auth);
  }
  setLoginMessage(text);
}

async function initializeMaintenanceAdminLogin() {
  try {
    if (!(await maintenanceIsActive())) {
      window.location.replace("index.html");
      return;
    }

    setElementHidden(loginMain, false);
    const currentUser = await waitForInitialAuthState();

    if (currentUser && !(await openAdminPageIfAuthorized(currentUser))) {
      await rejectCurrentSession("管理者アカウントでログインしてください。");
    }
  } catch (error) {
    console.error("管理者専用入口の初期化エラー:", error);
    window.location.replace("index.html");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setLoginMessage("メールアドレスとパスワードを入力してください。");
    return;
  }

  try {
    setLoginLoading(true);
    setLoginMessage("");

    if (!(await maintenanceIsActive())) {
      window.location.replace("index.html");
      return;
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!(await openAdminPageIfAuthorized(credential.user))) {
      await rejectCurrentSession("この入口からログインできるのは管理者アカウントだけです。");
    }
  } catch (error) {
    console.error("管理者専用ログインエラー:", error);
    await rejectCurrentSession("ログイン情報または管理者権限を確認してください。");
  } finally {
    setLoginLoading(false);
  }
});

initializeMaintenanceAdminLogin();

onSnapshot(
  doc(db, "system", "maintenanceMode"),
  (maintenanceSnap) => {
    if (!maintenanceSnap.exists() || maintenanceSnap.data()?.active !== true) {
      window.location.replace("index.html");
    }
  },
  (error) => {
    console.warn("管理者専用入口でメンテナンス状態を監視できませんでした。", error);
  }
);
