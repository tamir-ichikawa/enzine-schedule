import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");

loginButton.addEventListener("click", async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    message.style.color = "red";
    message.textContent = "メールアドレスとパスワードを入力してください。";
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      message.style.color = "red";
      message.textContent = "ユーザー情報が登録されていません。管理者に確認してください。";
      return;
    }

    const userData = userDocSnap.data();

    if (userData.active !== true) {
      message.style.color = "red";
      message.textContent = "このアカウントは現在利用できません。";
      return;
    }

    if (userData.role === "staff") {
      window.location.href = "staff.html";
    } else {
      window.location.href = "user.html";
    }

  } catch (error) {
    console.error("ログインエラー:", error);
    message.style.color = "red";
    message.textContent = `ログインに失敗しました：${error.code || error.message}`;
  }
});