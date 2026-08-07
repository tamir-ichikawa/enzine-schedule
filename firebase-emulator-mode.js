export const LOCAL_FIREBASE_PROJECT_ID = "demo-enzine-schedule-local";

const EMULATOR_QUERY_KEY = "firebaseEmulators";
const EMULATOR_SESSION_KEY = "enzineFirebaseEmulators";
const EMULATOR_PORTS = {
  auth: {
    defaultValue: 9099,
    queryKey: "firebaseAuthPort",
    sessionKey: "enzineFirebaseAuthPort"
  },
  firestore: {
    defaultValue: 8080,
    queryKey: "firebaseFirestorePort",
    sessionKey: "enzineFirebaseFirestorePort"
  },
  functions: {
    defaultValue: 5001,
    queryKey: "firebaseFunctionsPort",
    sessionKey: "enzineFirebaseFunctionsPort"
  }
};
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

function parsePort(value) {
  if (!/^\d+$/.test(String(value || ""))) {
    return null;
  }

  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function clearSessionPorts(sessionStorage) {
  try {
    Object.values(EMULATOR_PORTS).forEach(({ sessionKey }) => {
      sessionStorage?.removeItem(sessionKey);
    });
  } catch (error) {
    console.warn("Firebase emulator ports could not be cleared.", error);
  }
}

function resolveEmulatorPorts(params, sessionStorage) {
  return Object.fromEntries(Object.entries(EMULATOR_PORTS).map(([service, config]) => {
    const requestedValue = params.get(config.queryKey);
    const requestedPort = parsePort(requestedValue);

    try {
      if (requestedPort !== null) {
        sessionStorage?.setItem(config.sessionKey, String(requestedPort));
      }
    } catch (error) {
      console.warn(`Firebase ${service} emulator port could not be saved.`, error);
    }

    let storedPort = null;
    try {
      storedPort = parsePort(sessionStorage?.getItem(config.sessionKey));
    } catch (error) {
      console.warn(`Firebase ${service} emulator port could not be read.`, error);
    }

    return [service, requestedPort ?? storedPort ?? config.defaultValue];
  }));
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
    clearSessionPorts(sessionStorage);
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
    projectId: LOCAL_FIREBASE_PROJECT_ID,
    emulatorPorts: resolveEmulatorPorts(params, sessionStorage)
  };
}
