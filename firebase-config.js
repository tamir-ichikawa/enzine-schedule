// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase Consoleでコピーした設定に置き換える
const firebaseConfig = {
  apiKey: "AIzaSyAkM1V5nXT-zRkXdZDYcIFow-RBk_XtmPU",
  authDomain: "enzine-schedule.firebaseapp.com",
  projectId: "enzine-schedule",
  storageBucket: "enzine-schedule.firebasestorage.app",
  messagingSenderId: "486612480549",
  appId: "1:486612480549:web:0de909db699a682779c5cc"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);