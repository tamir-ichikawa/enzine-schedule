import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番スモークテストを実行できません。");
  process.exit(1);
}

if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseConfigSource = await readFile(path.join(projectRoot, "firebase-config.js"), "utf8");
const apiKeyMatch = firebaseConfigSource.match(/apiKey:\s*["']([^"']+)["']/);

if (!apiKeyMatch?.[1]) {
  console.error("公開クライアント設定からFirebase API keyを読み取れませんでした。");
  process.exit(1);
}

async function getStatus(documentPath) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${documentPath}`
  );
  url.searchParams.set("key", apiKeyMatch[1]);
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  await response.arrayBuffer();
  return response.status;
}

const checks = [
  { label: "maintenanceMode-public-get", path: "system/maintenanceMode", expected: [200] },
  { label: "users-unauthenticated-deny", path: "users/rules-smoke-missing-user", expected: [401, 403] },
  { label: "legacy-schedules-unauthenticated-deny", path: "schedules/rules-smoke-missing", expected: [401, 403] },
  { label: "legacy-announcements-unauthenticated-deny", path: "announcements/rules-smoke-missing", expected: [401, 403] }
];

for (const check of checks) {
  const status = await getStatus(check.path);
  if (!check.expected.includes(status)) {
    throw new Error(`${check.label}: unexpected-status-${status}`);
  }
  console.log(`- ${check.label}: ${status}`);
}

console.log("本番Firestore Rulesの未認証スモークテストに合格しました。");
console.log("API key・レスポンス本文・ユーザー情報・認証情報は表示していません。");
