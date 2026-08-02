import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

await import("./prepare-local-emulators.mjs");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCliPath = path.join(
  projectRoot,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js"
);
const configHome = path.join(projectRoot, ".firebase", "cli-config");
const emulatorCache = path.join(projectRoot, ".firebase", "emulators");

function getJavaMajorVersion(javaHome) {
  const executable = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");

  if (!existsSync(executable)) {
    return 0;
  }

  const result = spawnSync(executable, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const versionText = `${result.stdout || ""}\n${result.stderr || ""}`;
  const match = versionText.match(/version\s+"(?:1\.)?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function findJavaHome() {
  const candidates = [process.env.JAVA_HOME].filter(Boolean);

  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Android\\Android Studio\\jbr");

    for (const basePath of [
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Java"
    ]) {
      if (existsSync(basePath)) {
        for (const entry of readdirSync(basePath, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            candidates.push(path.join(basePath, entry.name));
          }
        }
      }
    }
  } else {
    candidates.push("/usr/lib/jvm/default-java", "/opt/homebrew/opt/openjdk");
  }

  return candidates.find((candidate) => getJavaMajorVersion(candidate) >= 21) || "";
}

const javaHome = findJavaHome();
const runVerificationAndExit = process.argv.includes("--verify");

if (!javaHome) {
  console.error("Firebase Emulator SuiteにはJDK 21以上が必要です。LOCAL_FIREBASE_EMULATORS.mdを確認してください。");
  process.exit(1);
}

const args = [
  firebaseCliPath,
  runVerificationAndExit ? "emulators:exec" : "emulators:start",
  "--config",
  "firebase.emulators.json",
  "--project",
  "demo-enzine-schedule-local",
  "--only",
  runVerificationAndExit ? "auth,firestore,functions" : "auth,firestore,functions,hosting"
];

if (runVerificationAndExit) {
  const verificationScript = path.join(projectRoot, "scripts", "run-local-verification.mjs");
  args.push(`"${process.execPath}" "${verificationScript}"`);
}

const childOptions = {
  cwd: projectRoot,
  env: {
    ...process.env,
    CI: "true",
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
    FIREBASE_EMULATORS_PATH: emulatorCache,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH || ""}`,
    XDG_CONFIG_HOME: configHome
  },
  stdio: "inherit"
};

if (runVerificationAndExit) {
  const result = spawnSync(process.execPath, args, childOptions);
  process.exitCode = result.status ?? 1;
} else {
  const child = spawn(process.execPath, args, childOptions);
let requestedExitCode = null;

function stopEmulators(signal) {
  if (requestedExitCode !== null || child.exitCode !== null) {
    return;
  }

  requestedExitCode = signal === "SIGINT" ? 130 : 143;

  if (process.platform === "win32") {
    spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill(signal);
}

process.once("SIGINT", () => stopEmulators("SIGINT"));
process.once("SIGTERM", () => stopEmulators("SIGTERM"));

child.on("error", (error) => {
  console.error(`Firebase Emulator Suiteを起動できませんでした: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (requestedExitCode !== null) {
    process.exitCode = requestedExitCode;
    return;
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
}
