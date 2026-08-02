import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const SITE_ID = "enzine-schedule";
const HOSTING_CONFIG = "firebase.production.hosting.live.json";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番Hosting監査を実行できません。");
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

class SafeAuditError extends Error {
  constructor(stage, classification = "unknown") {
    super(stage);
    this.stage = stage;
    this.classification = classification;
  }
}

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

function runReadOnlyCommand(command, args) {
  const result = spawnSync(
    process.execPath,
    ["--use-system-ca", firebaseCliPath, command, ...args, "--project", PROJECT_ID, "--json"],
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
    throw new SafeAuditError(command, classifyFailure(combinedOutput));
  }
  try {
    return parseCliJson(result.stdout);
  } catch {
    throw new SafeAuditError(command, "invalid-json");
  }
}

function resourceId(entry) {
  return String(entry?.name || "").split("/").pop() || "";
}

function releaseVersionId(channel) {
  const candidates = [
    channel?.release?.version?.name,
    channel?.release?.version,
    channel?.version?.name,
    channel?.version
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return value ? value.split("/").pop() : "不明";
}

let sitesPayload;
let channelsPayload;
try {
  sitesPayload = runReadOnlyCommand("hosting:sites:list", []);
  channelsPayload = runReadOnlyCommand("hosting:channel:list", [
    "--site", SITE_ID,
    "--config", HOSTING_CONFIG
  ]);
} catch (error) {
  const stage = error instanceof SafeAuditError ? error.stage : "unknown";
  const classification = error instanceof SafeAuditError ? error.classification : "unknown";
  console.error(`本番Hosting一覧の読み取りに失敗しました（段階: ${stage}、分類: ${classification}）。`);
  process.exit(1);
}

const sites = Array.isArray(sitesPayload.result?.sites) ? sitesPayload.result.sites : [];
const siteIds = sites.map(resourceId).filter(Boolean).sort();
if (!siteIds.includes(SITE_ID)) {
  console.error("固定した本番Hostingサイトを一覧で確認できませんでした。");
  process.exit(1);
}

const channels = Array.isArray(channelsPayload.result?.channels)
  ? channelsPayload.result.channels
  : [];
const channelSummaries = channels
  .map((channel) => ({
    id: resourceId(channel),
    version: releaseVersionId(channel),
    expires: channel.expireTime ? String(channel.expireTime) : "期限なし",
    updated: channel.updateTime ? String(channel.updateTime) : "不明"
  }))
  .filter((channel) => channel.id)
  .sort((a, b) => a.id.localeCompare(b.id, "en"));

console.log(`対象プロジェクト: ${PROJECT_ID}（Hosting一覧の読み取りのみ）`);
console.log(`固定Hostingサイト: ${SITE_ID}`);
console.log(`Hostingサイト数: ${siteIds.length}件`);
for (const siteId of siteIds) console.log(`- site: ${siteId}`);
console.log(`Hostingチャンネル数: ${channelSummaries.length}件`);
for (const channel of channelSummaries) {
  console.log(`- channel: ${channel.id} / version: ${channel.version} / 更新: ${channel.updated} / 期限: ${channel.expires}`);
}
console.log("URL・App ID・アカウント・認証情報は表示していません。");
console.log("実行内容: hosting:sites:list と hosting:channel:list のみ。作成・更新・削除なし");
