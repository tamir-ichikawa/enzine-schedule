import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";
let currentStage = "startup";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番バックアップ準備を確認できません。");
  process.exit(1);
}

if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const firebaseAuth = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "auth"));
const scopes = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "scopes"));

class SafeInspectError extends Error {
  constructor(stage, status = "") {
    super(stage);
    this.stage = stage;
    this.status = status;
  }
}

async function getCliAccessToken() {
  const account = firebaseAuth.getProjectDefaultAccount(projectRoot)
    || firebaseAuth.getGlobalDefaultAccount();

  if (!account?.tokens?.refresh_token) {
    throw new SafeInspectError("firebase-cli-authentication");
  }

  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeInspectError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeInspectError) {
      throw error;
    }
    throw new SafeInspectError("firebase-cli-access-token");
  }
}

async function readJson(accessToken, url, stage, { allowNotFound = false } = {}) {
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json"
      }
    });
  } catch {
    throw new SafeInspectError(stage, "network");
  }

  if (allowNotFound && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new SafeInspectError(stage, String(response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new SafeInspectError(stage, "invalid-json");
  }
}

async function main() {
  currentStage = "firebase-cli-authentication";
  const accessToken = await getCliAccessToken();
  currentStage = "read-only-api-requests";
  const [project, database, billing, buckets, schedules, authConfig] = await Promise.all([
    readJson(
      accessToken,
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
      "project-confirmation"
    ),
    readJson(
      accessToken,
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}`,
      "firestore-database"
    ),
    readJson(
      accessToken,
      `https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`,
      "billing-info"
    ),
    readJson(
      accessToken,
      `https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}&projection=noAcl`,
      "storage-buckets"
    ),
    readJson(
      accessToken,
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/backupSchedules`,
      "firestore-backup-schedules",
      { allowNotFound: true }
    ),
    readJson(
      accessToken,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
      "authentication-config"
    )
  ]);

  currentStage = "project-validation";
  if (project.projectId !== PROJECT_ID || project.lifecycleState !== "ACTIVE") {
    throw new SafeInspectError("project-confirmation", "not-active");
  }

  currentStage = "storage-summary";
  const bucketItems = (buckets.items || []).map((bucket) => ({
    name: String(bucket.name || ""),
    location: String(bucket.location || ""),
    storageClass: String(bucket.storageClass || ""),
    uniformAccess: bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
    hasRetentionPolicy: Boolean(bucket.retentionPolicy),
    versioningEnabled: bucket.versioning?.enabled === true
  }));
  currentStage = "authentication-summary";
  const hashConfig = authConfig?.signIn?.hashConfig
    || authConfig?.signIn?.email?.hashConfig
    || null;

  currentStage = "safe-output";
  console.log(`対象プロジェクト: ${PROJECT_ID}（ACTIVE・読み取り専用）`);
  console.log(`課金有効: ${billing.billingEnabled === true ? "はい" : "いいえ"}`);
  console.log(`Firestoreロケーション: ${database.locationId || "不明"}`);
  console.log(`Firestore種別: ${database.type || "不明"}`);
  console.log(`PITR: ${database.pointInTimeRecoveryEnablement || "不明"}`);
  console.log(`削除保護: ${database.deleteProtectionState || "不明"}`);
  console.log(`Cloud Storageバケット: ${bucketItems.length}件`);
  for (const bucket of bucketItems) {
    console.log(
      `- ${bucket.name}: location=${bucket.location || "不明"}`
      + ` / class=${bucket.storageClass || "不明"}`
      + ` / uniformAccess=${bucket.uniformAccess ? "on" : "off"}`
      + ` / retention=${bucket.hasRetentionPolicy ? "on" : "off"}`
      + ` / versioning=${bucket.versioningEnabled ? "on" : "off"}`
    );
  }
  console.log(`Firestore管理バックアップスケジュール: ${(schedules?.backupSchedules || []).length}件`);
  console.log(`Authパスワードハッシュ設定: ${hashConfig ? "取得可" : "取得不可"}`);
  console.log(`Auth署名鍵: ${hashConfig?.signerKey ? "取得可（値は非表示）" : "取得不可"}`);
  console.log("実行内容: プロジェクト・課金・Firestore・Storage・バックアップ設定のGETのみ");
}

main().catch((error) => {
  const stage = error instanceof SafeInspectError ? error.stage : currentStage;
  const status = error instanceof SafeInspectError && error.status ? ` / ${error.status}` : "";
  console.error(`バックアップ準備を安全に確認できませんでした（段階: ${stage}${status}）。`);
  process.exitCode = 1;
});
