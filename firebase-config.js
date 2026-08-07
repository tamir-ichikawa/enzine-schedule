// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  connectFirestoreEmulator,
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  connectFunctionsEmulator,
  getFunctions
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

import {
  LOCAL_FIREBASE_PROJECT_ID,
  resolveFirebaseRuntime
} from "./firebase-emulator-mode.js";

// Firebase Consoleでコピーした設定に置き換える
const productionFirebaseConfig = {
  apiKey: "AIzaSyAkM1V5nXT-zRkXdZDYcIFow-RBk_XtmPU",
  authDomain: "enzine-schedule.firebaseapp.com",
  projectId: "enzine-schedule",
  storageBucket: "enzine-schedule.firebasestorage.app",
  messagingSenderId: "486612480549",
  appId: "1:486612480549:web:0de909db699a682779c5cc"
};

const emulatorFirebaseConfig = {
  apiKey: "local-emulator-only",
  authDomain: `${LOCAL_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: LOCAL_FIREBASE_PROJECT_ID,
  storageBucket: `${LOCAL_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:local-emulator-only"
};

const runtime = resolveFirebaseRuntime({
  hostname: window.location.hostname,
  search: window.location.search,
  sessionStorage: window.sessionStorage
});

if (runtime.mode === "blocked-local") {
  const message = "ローカルではFirebaseへの接続を停止しています。エミュレーター起動後、?firebaseEmulators=1 を付けて開いてください。";
  const messageElement = document.getElementById("message");

  if (messageElement) {
    messageElement.textContent = message;
  }

  throw new Error(message);
}

if (runtime.ignoredEmulatorRequest) {
  console.warn("firebaseEmulators=1 was ignored because this is not a local host.");
}

const firebaseConfig = runtime.mode === "emulator"
  ? emulatorFirebaseConfig
  : productionFirebaseConfig;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-northeast1");
export const isFirebaseEmulator = runtime.mode === "emulator";

if (isFirebaseEmulator) {
  connectAuthEmulator(auth, `http://127.0.0.1:${runtime.emulatorPorts.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", runtime.emulatorPorts.firestore);
  connectFunctionsEmulator(functions, "127.0.0.1", runtime.emulatorPorts.functions);
  document.documentElement.dataset.firebaseEnvironment = "emulator";
  console.info("Firebase Emulator Suite connected", {
    projectId: LOCAL_FIREBASE_PROJECT_ID,
    ports: runtime.emulatorPorts
  });
}
