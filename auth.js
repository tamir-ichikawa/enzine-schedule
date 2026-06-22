// STEP41_ADMIN_USER_MANAGEMENT_20260622_V71：adminログイン時は管理者ページへ遷移
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// STEP8_LOGIN_UNIFY_20260620_V37：ログイン画面統一・二重送信防止

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");

function setLoginMessage(text, color = "red") {
  message.style.color = color;
  message.textContent = text;
}

function setLoginLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "ログイン中..." : "ログイン";
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

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      setLoginMessage("ユーザー情報が登録されていません。管理者に確認してください。");
      return;
    }

    const userData = userDocSnap.data();

    if (userData.active !== true) {
      setLoginMessage("このアカウントは現在利用できません。");
      return;
    }

    if (userData.role === "admin") {
      window.location.href = "admin.html";
    } else if (userData.role === "staff") {
      window.location.href = "staff.html";
    } else {
      window.location.href = "user.html";
    }

  } catch (error) {
    console.error("ログインエラー:", error);
    setLoginMessage(`ログインに失敗しました：${error.code || error.message}`);
  } finally {
    setLoginLoading(false);
  }
});
