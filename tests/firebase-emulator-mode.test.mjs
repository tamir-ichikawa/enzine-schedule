import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_FIREBASE_PROJECT_ID,
  resolveFirebaseRuntime
} from "../firebase-emulator-mode.js";

function createSessionStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("production host ignores emulator opt-in", () => {
  const runtime = resolveFirebaseRuntime({
    hostname: "example.com",
    search: "?firebaseEmulators=1",
    sessionStorage: createSessionStorage()
  });

  assert.equal(runtime.mode, "production");
  assert.equal(runtime.ignoredEmulatorRequest, true);
  assert.equal(runtime.projectId, "enzine-schedule");
});

test("local host fails closed without explicit opt-in", () => {
  const runtime = resolveFirebaseRuntime({
    hostname: "127.0.0.1",
    sessionStorage: createSessionStorage()
  });

  assert.equal(runtime.mode, "blocked-local");
  assert.equal(runtime.projectId, null);
});

test("file-style empty hostname also fails closed", () => {
  const runtime = resolveFirebaseRuntime({
    hostname: "",
    sessionStorage: createSessionStorage()
  });

  assert.equal(runtime.mode, "blocked-local");
});

test("local explicit opt-in selects demo project and persists for navigation", () => {
  const sessionStorage = createSessionStorage();
  const firstRuntime = resolveFirebaseRuntime({
    hostname: "127.0.0.1",
    search: "?firebaseEmulators=1",
    sessionStorage
  });
  const navigatedRuntime = resolveFirebaseRuntime({
    hostname: "127.0.0.1",
    sessionStorage
  });

  assert.equal(firstRuntime.mode, "emulator");
  assert.equal(firstRuntime.projectId, LOCAL_FIREBASE_PROJECT_ID);
  assert.equal(navigatedRuntime.mode, "emulator");
});

test("local explicit opt-out clears the emulator session", () => {
  const sessionStorage = createSessionStorage({ enzineFirebaseEmulators: "1" });
  const runtime = resolveFirebaseRuntime({
    hostname: "localhost",
    search: "?firebaseEmulators=0",
    sessionStorage
  });

  assert.equal(runtime.mode, "blocked-local");
  assert.equal(sessionStorage.getItem("enzineFirebaseEmulators"), null);
});
