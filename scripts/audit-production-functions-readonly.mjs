import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番Functions監査を実行できません。");
  process.exit(1);
}
if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

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
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|certificate|CERT_|SSL|TLS/i.test(text)) return "tls";
  if (/login|authenticat|credential|OAuth|invalid_grant/i.test(text)) return "authentication";
  if (/permission|forbidden|PERMISSION_DENIED|403/i.test(text)) return "permission";
  if (/ENOTFOUND|ECONN|network|fetch failed/i.test(text)) return "network";
  return "unknown";
}

function functionId(entry) {
  const fullName = String(entry?.name || "");
  return String(entry?.id || entry?.entryPoint || fullName.split("/").pop() || "").trim();
}

const result = spawnSync(
  process.execPath,
  ["--use-system-ca", firebaseCliPath, "functions:list", "--project", PROJECT_ID, "--json"],
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
  console.error(`本番Functions一覧の読み取りに失敗しました（分類: ${classifyFailure(combinedOutput)}）。`);
  process.exit(1);
}

let payload;
try {
  payload = parseCliJson(result.stdout);
} catch {
  console.error("Firebase CLIのFunctions応答を安全に解析できませんでした。");
  process.exit(1);
}

const rawFunctions = Array.isArray(payload.result)
  ? payload.result
  : Array.isArray(payload.result?.functions)
    ? payload.result.functions
    : [];
const productionFunctions = rawFunctions
  .map((entry) => functionId(entry))
  .filter(Boolean)
  .sort();
const indexSource = await fs.readFile(path.join(projectRoot, "functions", "index.js"), "utf8");
const localFunctions = [...indexSource.matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm)]
  .map((match) => match[1])
  .sort();
const productionSet = new Set(productionFunctions);
const localSet = new Set(localFunctions);
const unchangedNames = localFunctions.filter((name) => productionSet.has(name));
const localOnlyNames = localFunctions.filter((name) => !productionSet.has(name));
const productionOnlyNames = productionFunctions.filter((name) => !localSet.has(name));

console.log(`対象プロジェクト: ${PROJECT_ID}（Functions一覧の読み取りのみ）`);
console.log("URL・サービスアカウント・環境変数・秘密情報は表示していません。");
console.log(`本番Functions: ${productionFunctions.length}件`);
for (const name of productionFunctions) console.log(`- ${name}`);
console.log(`候補にも存在するFunctions: ${unchangedNames.length}件`);
for (const name of unchangedNames) console.log(`- ${name}`);
console.log(`候補で追加されるFunctions: ${localOnlyNames.length}件`);
for (const name of localOnlyNames) console.log(`- ${name}`);
console.log(`候補から消える本番Functions: ${productionOnlyNames.length}件`);
for (const name of productionOnlyNames) console.log(`- ${name}`);
console.log("実行内容: functions:listのみ。デプロイ・更新・削除なし");
