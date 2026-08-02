export const LOCAL_FIREBASE_PROJECT_ID = "demo-enzine-schedule-local";

const EMULATOR_QUERY_KEY = "firebaseEmulators";
const EMULATOR_SESSION_KEY = "enzineFirebaseEmulators";
const LOCAL_HOSTNAMES = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function readSessionFlag(sessionStorage) {
  try {
    return sessionStorage?.getItem(EMULATOR_SESSION_KEY) === "1";
  } catch (error) {
    console.warn("Firebase emulator session flag could not be read.", error);
    return false;
  }
}

function writeSessionFlag(sessionStorage, enabled) {
  try {
    if (enabled) {
      sessionStorage?.setItem(EMULATOR_SESSION_KEY, "1");
    } else {
      sessionStorage?.removeItem(EMULATOR_SESSION_KEY);
    }
  } catch (error) {
    console.warn("Firebase emulator session flag could not be saved.", error);
  }
}

export function resolveFirebaseRuntime({ hostname, search = "", sessionStorage }) {
  const isLocalHost = LOCAL_HOSTNAMES.has(String(hostname || "").toLowerCase());
  const params = new URLSearchParams(search);
  const requestedValue = params.get(EMULATOR_QUERY_KEY);

  if (!isLocalHost) {
    return {
      mode: "production",
      ignoredEmulatorRequest: requestedValue === "1",
      projectId: "enzine-schedule"
    };
  }

  if (requestedValue === "0") {
    writeSessionFlag(sessionStorage, false);
  } else if (requestedValue === "1") {
    writeSessionFlag(sessionStorage, true);
  }

  const emulatorEnabled = requestedValue === "1"
    || (requestedValue !== "0" && readSessionFlag(sessionStorage));

  if (!emulatorEnabled) {
    return {
      mode: "blocked-local",
      ignoredEmulatorRequest: false,
      projectId: null
    };
  }

  return {
    mode: "emulator",
    ignoredEmulatorRequest: false,
    projectId: LOCAL_FIREBASE_PROJECT_ID
  };
}
