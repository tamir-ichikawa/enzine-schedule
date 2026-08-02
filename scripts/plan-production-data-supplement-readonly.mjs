import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";
const ORGANIZATION_ID = "enzine";
const OFFICE_ID = "enzine_chiba";
const EXPECTED_AUTH_USERS = 28;
const EXPECTED_FIRESTORE_USERS = 28;
const EXPECTED_ROLES = new Map([
  ["admin", { total: 1, active: 1 }],
  ["staff", { total: 1, active: 1 }],
  ["user", { total: 26, active: 24 }]
]);

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番補完dry-runを実行できません。");
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

class SafePlanError extends Error {
  constructor(stage, status = "") {
    super(stage);
    this.stage = stage;
    this.status = status;
  }
}

async function getCliAccessToken() {
  let account;
  try {
    account = firebaseAuth.getProjectDefaultAccount(projectRoot)
      || firebaseAuth.getGlobalDefaultAccount();
  } catch {
    throw new SafePlanError("firebase-cli-authentication");
  }
  if (!account?.tokens?.refresh_token) {
    throw new SafePlanError("firebase-cli-authentication");
  }
  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafePlanError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafePlanError) {
      throw error;
    }
    throw new SafePlanError("firebase-cli-access-token");
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
    throw new SafePlanError(stage, "network");
  }
  if (allowNotFound && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new SafePlanError(stage, String(response.status));
  }
  try {
    return await response.json();
  } catch {
    throw new SafePlanError(stage, "invalid-json");
  }
}

function decodeValue(value = {}) {
  if ("stringValue" in value) {
    return String(value.stringValue || "");
  }
  if ("booleanValue" in value) {
    return value.booleanValue === true;
  }
  return undefined;
}

function decodeDocument(document = {}) {
  const values = {};
  const fieldNames = new Set(Object.keys(document.fields || {}));
  for (const [field, value] of Object.entries(document.fields || {})) {
    values[field] = decodeValue(value);
  }
  return {
    id: decodeURIComponent(String(document.name || "").split("/").pop() || ""),
    updateTime: String(document.updateTime || ""),
    fieldNames,
    values
  };
}

async function listDocuments(accessToken, collectionId, fieldPaths) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collectionId}`
    );
    url.searchParams.set("pageSize", "300");
    for (const fieldPath of fieldPaths) {
      url.searchParams.append("mask.fieldPaths", fieldPath);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const payload = await readJson(accessToken, url, `firestore-${collectionId}`);
    documents.push(...(payload.documents || []).map(decodeDocument));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);
  return documents;
}

async function readMaintenance(accessToken) {
  return readJson(
    accessToken,
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/system/maintenanceMode?mask.fieldPaths=active`,
    "firestore-maintenance",
    { allowNotFound: true }
  );
}

async function listAuthUsers(accessToken) {
  const users = [];
  let pageToken = "";
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`);
    url.searchParams.set("maxResults", "500");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const payload = await readJson(accessToken, url, "authentication-users");
    users.push(...(payload.users || []).map((user) => ({
      id: String(user.localId || ""),
      disabled: user.disabled === true
    })));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);
  return users;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function expectedScope(role) {
  if (role === "admin") return "global";
  if (role === "staff") return "office";
  if (role === "user") return "self";
  return "";
}

function planMissingField(document, field, expectedValue, additions, conflicts) {
  if (!document.fieldNames.has(field)) {
    additions[field] += 1;
    return true;
  }
  if (String(document.values[field] ?? "").trim() !== expectedValue) {
    increment(conflicts, `${field}に既存の異なる値または空値がある`);
  }
  return false;
}

function assertBaseline(condition, label, conflicts) {
  if (!condition) {
    increment(conflicts, label);
  }
}

async function main() {
  const accessToken = await getCliAccessToken();
  const project = await readJson(
    accessToken,
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
    "project-confirmation"
  );
  if (project.projectId !== PROJECT_ID || project.lifecycleState !== "ACTIVE") {
    throw new SafePlanError("project-confirmation", "not-active");
  }

  const [userDocs, organizationDocs, officeDocs, maintenance, authUsers] = await Promise.all([
    listDocuments(accessToken, "users", [
      "active",
      "role",
      "accessScope",
      "organizationId",
      "groupId",
      "officeId"
    ]),
    listDocuments(accessToken, "organizations", ["active", "groupId"]),
    listDocuments(accessToken, "offices", ["active", "organizationId", "groupId", "officeId"]),
    readMaintenance(accessToken),
    listAuthUsers(accessToken)
  ]);

  const conflicts = new Map();
  const roleCounts = new Map();
  const activeRoleCounts = new Map();
  const additions = {
    organizationId: 0,
    groupId: 0,
    officeId: 0,
    accessScope: 0
  };
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const profileIds = new Set(userDocs.map((document) => document.id));
  let userWrites = 0;
  let updateTimeGuards = 0;

  assertBaseline(authUsers.length === EXPECTED_AUTH_USERS, "Authentication件数が基準値と異なる", conflicts);
  assertBaseline(userDocs.length === EXPECTED_FIRESTORE_USERS, "Firestore users件数が基準値と異なる", conflicts);
  assertBaseline(organizationDocs.length === 0, "organizationsが空ではない", conflicts);
  assertBaseline(officeDocs.length === 0, "officesが空ではない", conflicts);
  assertBaseline(maintenance === null, "maintenanceModeが既に存在する", conflicts);

  for (const document of userDocs) {
    const role = String(document.values.role || "").trim();
    const active = document.values.active === true;
    const scope = expectedScope(role);
    increment(roleCounts, role || "role未設定");
    if (active) increment(activeRoleCounts, role || "role未設定");
    if (!scope) {
      increment(conflicts, "未対応roleがある");
      continue;
    }
    const authUser = authById.get(document.id);
    if (!authUser) {
      increment(conflicts, "Firestoreプロフィールに対応するAuthアカウントがない");
    } else if (active && authUser.disabled) {
      increment(conflicts, "有効プロフィールに対するAuthアカウントが無効");
    }
    if (!document.updateTime) {
      increment(conflicts, "更新時刻が取得できないusers文書がある");
    } else {
      updateTimeGuards += 1;
    }

    const changed = [
      planMissingField(document, "organizationId", ORGANIZATION_ID, additions, conflicts),
      planMissingField(document, "groupId", ORGANIZATION_ID, additions, conflicts),
      planMissingField(document, "officeId", OFFICE_ID, additions, conflicts),
      planMissingField(document, "accessScope", scope, additions, conflicts)
    ].some(Boolean);
    if (changed) userWrites += 1;
  }

  for (const authUser of authUsers) {
    if (!profileIds.has(authUser.id)) {
      increment(conflicts, "Authアカウントに対応するFirestoreプロフィールがない");
    }
  }
  for (const [role, expected] of EXPECTED_ROLES) {
    assertBaseline(roleCounts.get(role) === expected.total, `${role}件数が基準値と異なる`, conflicts);
    assertBaseline(activeRoleCounts.get(role) === expected.active, `有効${role}件数が基準値と異なる`, conflicts);
  }
  assertBaseline(
    [...roleCounts.keys()].every((role) => EXPECTED_ROLES.has(role)),
    "基準外roleがある",
    conflicts
  );
  assertBaseline(userWrites === EXPECTED_FIRESTORE_USERS, "補完対象users件数が基準値と異なる", conflicts);
  assertBaseline(updateTimeGuards === EXPECTED_FIRESTORE_USERS, "更新時刻ガード数が不足している", conflicts);

  console.log(`対象プロジェクト: ${PROJECT_ID}（dry-run・GETのみ）`);
  console.log("実在名・メール・UID・本文・認証情報は表示していません。");
  console.log(`基準件数: Authentication ${authUsers.length} / Firestore users ${userDocs.length}`);
  console.log(`新規作成予定: organizations/${ORGANIZATION_ID}、offices/${OFFICE_ID}、system/maintenanceMode`);
  console.log(`users更新予定: ${userWrites}文書`);
  console.log("不足フィールド追加予定");
  console.log(`- organizationId=${ORGANIZATION_ID}: ${additions.organizationId}件`);
  console.log(`- groupId=${ORGANIZATION_ID}: ${additions.groupId}件`);
  console.log(`- officeId=${OFFICE_ID}: ${additions.officeId}件`);
  console.log(`- accessScope（role別固定）: ${additions.accessScope}件`);
  console.log(`将来の更新時刻前提条件: ${updateTimeGuards}文書`);
  console.log("将来の新規作成前提条件: 3文書すべて exists=false");
  console.log(`将来の単一アトミックcommit候補: ${userWrites + 3}書き込み`);

  if (conflicts.size) {
    console.log("停止条件");
    for (const [label, count] of conflicts) {
      console.log(`- ${label}: ${count}件`);
    }
    console.log("dry-run不合格: 本番補完を実行してはいけません。");
    process.exitCode = 2;
    return;
  }

  console.log("競合・想定外ID・基準差分: なし");
  console.log("dry-run合格: 既存フィールドを上書きせず、不足フィールドだけを補完できます。");
  console.log("実際のFirestore書き込み、Auth変更、メンテナンス切替、デプロイ: 実施なし");
}

main().catch((error) => {
  const stage = error instanceof SafePlanError ? error.stage : "unexpected";
  const status = error instanceof SafePlanError && error.status ? ` / ${error.status}` : "";
  console.error(`本番補完dry-runを安全に完了できませんでした（段階: ${stage}${status}）。`);
  console.error("秘密情報や利用者データは表示していません。本番データは変更していません。");
  process.exitCode = 1;
});
