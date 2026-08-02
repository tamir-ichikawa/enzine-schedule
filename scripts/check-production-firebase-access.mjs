import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCliPath = path.join(
  projectRoot,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js"
);

function parseCliJson(output) {
  const text = String(output || "").trim();

  for (let index = text.indexOf("{"); index >= 0; index = text.indexOf("{", index + 1)) {
    try {
      return JSON.parse(text.slice(index));
    } catch {
      // Firebase CLIの進捗行を飛ばし、次のJSON開始候補を試す。
    }
  }

  throw new Error("Firebase CLI response was not JSON.");
}

function classifyFailure(text) {
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|certificate|CERT_|SSL|TLS/i.test(text)) {
    return "tls";
  }
  if (/login|authenticat|credential|OAuth|invalid_grant/i.test(text)) {
    return "authentication";
  }
  if (/permission|forbidden|PERMISSION_DENIED|403/i.test(text)) {
    return "permission";
  }
  if (/ENOTFOUND|ECONN|network|fetch failed/i.test(text)) {
    return "network";
  }
  return "unknown";
}

const result = spawnSync(
  process.execPath,
  ["--use-system-ca", firebaseCliPath, "projects:list", "--json"],
  {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true"
    }
  }
);

const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;

if (result.status !== 0) {
  console.error(`Firebase読み取り確認に失敗しました（分類: ${classifyFailure(combinedOutput)}）。`);
  process.exit(1);
}

let payload;

try {
  payload = parseCliJson(result.stdout);
} catch {
  console.error("Firebase CLIの応答を安全に解析できませんでした。");
  process.exit(1);
}

const projects = Array.isArray(payload.result)
  ? payload.result
  : Array.isArray(payload.result?.results)
    ? payload.result.results
    : [];
const project = projects.find((candidate) => candidate?.projectId === PROJECT_ID);

if (!project) {
  console.error(`対象プロジェクト ${PROJECT_ID} を現在のCLI権限で確認できませんでした。`);
  process.exit(1);
}

console.log("Firebase CLI認証: 確認済み（アカウント情報は非表示）");
console.log(`対象プロジェクト: ${PROJECT_ID}`);
console.log(`プロジェクト状態: ${project.state || "確認済み"}`);
console.log("実行内容: プロジェクト一覧の読み取りのみ");
