import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";
const ORGANIZATION_ID = "enzine";
const OFFICE_ID = "enzine_chiba";
const EXPECTED_AUTH_USERS = 28;
const EXPECTED_FIRESTORE_USERS = 28;
const EXPECTED_WRITES = 31;
const VERIFIED_BACKUP_ID = "2026-08-02T08-01-46-184Z";
const COMMIT_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:commit`;
const REQUIRED_ARGUMENTS = new Set([
  "--apply",
  `--confirm-project=${PROJECT_ID}`,
  `--confirm-writes=${EXPECTED_WRITES}`,
  `--confirm-backup=${VERIFIED_BACKUP_ID}`
]);
const EXPECTED_ROLES = new Map([
  ["admin", { total: 1, active: 1, accessScope: "global" }],
  ["staff", { total: 1, active: 1, accessScope: "office" }],
  ["user", { total: 26, active: 24, accessScope: "self" }]
]);

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番補完を実行できません。");
  process.exit(1);
}
if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}
if ([...REQUIRED_ARGUMENTS].some((argument) => !process.argv.includes(argument))) {
  console.error("本番補完の対象・件数・バックアップを確認する全引数が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const firebaseAuth = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "auth"));
const scopes = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "scopes"));

class SafeApplyError extends Error {
  constructor(stage, status = "") {
    super(stage);
    this.stage = stage;
    this.status = status;
  }
}

async function verifyBackupManifest() {
  const manifestPath = path.join(
    projectRoot,
    ".production-backups",
    VERIFIED_BACKUP_ID,
    "backup-manifest.json"
  );
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new SafeApplyError("verified-backup-manifest", "unavailable");
  }
  if (
    manifest.projectId !== PROJECT_ID
    || manifest.authentication?.userCount !== EXPECTED_AUTH_USERS
    || manifest.authentication?.hashConfigPresent !== true
    || manifest.authentication?.signerKeyPresent !== true
    || manifest.firestore?.overallMetadataPresent !== true
    || Number(manifest.firestore?.objectCount || 0) < 1
  ) {
    throw new SafeApplyError("verified-backup-manifest", "unexpected-content");
  }
}

async function getCliAccessToken() {
  let account;
  try {
    account = firebaseAuth.getProjectDefaultAccount(projectRoot)
      || firebaseAuth.getGlobalDefaultAccount();
  } catch {
    throw new SafeApplyError("firebase-cli-authentication");
  }
  if (!account?.tokens?.refresh_token) {
    throw new SafeApplyError("firebase-cli-authentication");
  }
  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeApplyError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeApplyError) throw error;
    throw new SafeApplyError("firebase-cli-access-token");
  }
}

async function getJson(accessToken, url, stage, { allowNotFound = false } = {}) {
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
    throw new SafeApplyError(stage, "network");
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new SafeApplyError(stage, String(response.status));
  try {
    return await response.json();
  } catch {
    throw new SafeApplyError(stage, "invalid-json");
  }
}

async function commitWritesOnce(accessToken, writes) {
  let response;
  try {
    response = await fetch(COMMIT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({ writes })
    });
  } catch {
    throw new SafeApplyError("firestore-atomic-commit", "network-outcome-unknown");
  }
  if (!response.ok) {
    throw new SafeApplyError("firestore-atomic-commit", String(response.status));
  }
  try {
    return await response.json();
  } catch {
    throw new SafeApplyError("firestore-atomic-commit", "response-outcome-unknown");
  }
}

function decodeValue(value = {}) {
  if ("stringValue" in value) return String(value.stringValue || "");
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) return Number(value.integerValue);
  return undefined;
}

function decodeDocument(document = {}) {
  const values = {};
  const fieldNames = new Set(Object.keys(document.fields || {}));
  for (const [field, value] of Object.entries(document.fields || {})) {
    values[field] = decodeValue(value);
  }
  return {
    name: String(document.name || ""),
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
    for (const fieldPath of fieldPaths) url.searchParams.append("mask.fieldPaths", fieldPath);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await getJson(accessToken, url, `firestore-${collectionId}`);
    documents.push(...(payload.documents || []).map(decodeDocument));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);
  return documents;
}

async function getDocument(accessToken, documentPath, fieldPaths, stage) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${documentPath}`
  );
  for (const fieldPath of fieldPaths) url.searchParams.append("mask.fieldPaths", fieldPath);
  const payload = await getJson(accessToken, url, stage, { allowNotFound: true });
  return payload ? decodeDocument(payload) : null;
}

async function listAuthUsers(accessToken) {
  const users = [];
  let pageToken = "";
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await getJson(accessToken, url, "authentication-users");
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

function stringField(value) {
  return { stringValue: value };
}

function booleanField(value) {
  return { booleanValue: value };
}

function integerField(value) {
  return { integerValue: String(value) };
}

function canonicalDocumentName(documentPath) {
  return `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${documentPath}`;
}

function newDocumentWrite(documentPath, fields) {
  return {
    update: {
      name: canonicalDocumentName(documentPath),
      fields: {
        schemaVersion: integerField(1),
        ...fields,
        createdByUid: stringField(""),
        createdByName: stringField("初期データ補完"),
        updatedByUid: stringField(""),
        updatedByName: stringField("初期データ補完")
      }
    },
    updateTransforms: [
      { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
      { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }
    ],
    currentDocument: { exists: false }
  };
}

function addMissingField(document, field, expectedValue, fields, fieldPaths, additions, conflicts) {
  if (!document.fieldNames.has(field)) {
    fields[field] = stringField(expectedValue);
    fieldPaths.push(field);
    additions[field] += 1;
    return;
  }
  if (String(document.values[field] ?? "").trim() !== expectedValue) {
    increment(conflicts, `${field}に既存の異なる値または空値がある`);
  }
}

async function readBaseline(accessToken) {
  const [project, userDocs, organizationDocs, officeDocs, maintenance, authUsers] = await Promise.all([
    getJson(
      accessToken,
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
      "project-confirmation"
    ),
    listDocuments(accessToken, "users", [
      "active", "role", "accessScope", "organizationId", "groupId", "officeId"
    ]),
    listDocuments(accessToken, "organizations", ["active", "groupId"]),
    listDocuments(accessToken, "offices", ["active", "organizationId", "groupId", "officeId"]),
    getDocument(accessToken, "system/maintenanceMode", ["active"], "firestore-maintenance"),
    listAuthUsers(accessToken)
  ]);
  return { project, userDocs, organizationDocs, officeDocs, maintenance, authUsers };
}

function buildWrites(baseline) {
  const conflicts = new Map();
  const roleCounts = new Map();
  const activeRoleCounts = new Map();
  const additions = { organizationId: 0, groupId: 0, officeId: 0, accessScope: 0 };
  const authById = new Map(baseline.authUsers.map((user) => [user.id, user]));
  const profileIds = new Set(baseline.userDocs.map((document) => document.id));
  const originalUsers = new Map();
  const userWrites = [];

  if (baseline.project.projectId !== PROJECT_ID || baseline.project.lifecycleState !== "ACTIVE") {
    increment(conflicts, "対象プロジェクトがACTIVEではない");
  }
  if (baseline.authUsers.length !== EXPECTED_AUTH_USERS) increment(conflicts, "Authentication件数が基準値と異なる");
  if (baseline.userDocs.length !== EXPECTED_FIRESTORE_USERS) increment(conflicts, "Firestore users件数が基準値と異なる");
  if (baseline.organizationDocs.length !== 0) increment(conflicts, "organizationsが空ではない");
  if (baseline.officeDocs.length !== 0) increment(conflicts, "officesが空ではない");
  if (baseline.maintenance !== null) increment(conflicts, "maintenanceModeが既に存在する");

  for (const document of baseline.userDocs) {
    const role = String(document.values.role || "").trim();
    const roleExpectation = EXPECTED_ROLES.get(role);
    const active = document.values.active === true;
    increment(roleCounts, role || "role未設定");
    if (active) increment(activeRoleCounts, role || "role未設定");
    if (!roleExpectation) {
      increment(conflicts, "未対応roleがある");
      continue;
    }
    const authUser = authById.get(document.id);
    if (!authUser) increment(conflicts, "Firestoreプロフィールに対応するAuthアカウントがない");
    else if (active && authUser.disabled) increment(conflicts, "有効プロフィールに対するAuthアカウントが無効");
    if (!document.updateTime) {
      increment(conflicts, "更新時刻が取得できないusers文書がある");
      continue;
    }

    const fields = {};
    const fieldPaths = [];
    addMissingField(document, "organizationId", ORGANIZATION_ID, fields, fieldPaths, additions, conflicts);
    addMissingField(document, "groupId", ORGANIZATION_ID, fields, fieldPaths, additions, conflicts);
    addMissingField(document, "officeId", OFFICE_ID, fields, fieldPaths, additions, conflicts);
    addMissingField(document, "accessScope", roleExpectation.accessScope, fields, fieldPaths, additions, conflicts);
    if (fieldPaths.length) {
      userWrites.push({
        update: { name: document.name, fields },
        updateMask: { fieldPaths },
        currentDocument: { updateTime: document.updateTime }
      });
    }
    originalUsers.set(document.name, { role, active });
  }

  for (const authUser of baseline.authUsers) {
    if (!profileIds.has(authUser.id)) increment(conflicts, "Authアカウントに対応するFirestoreプロフィールがない");
  }
  for (const [role, expected] of EXPECTED_ROLES) {
    if (roleCounts.get(role) !== expected.total) increment(conflicts, `${role}件数が基準値と異なる`);
    if (activeRoleCounts.get(role) !== expected.active) increment(conflicts, `有効${role}件数が基準値と異なる`);
  }
  if ([...roleCounts.keys()].some((role) => !EXPECTED_ROLES.has(role))) increment(conflicts, "基準外roleがある");
  if (userWrites.length !== EXPECTED_FIRESTORE_USERS) increment(conflicts, "補完対象users件数が基準値と異なる");
  if (
    additions.organizationId !== 28
    || additions.groupId !== 18
    || additions.officeId !== 18
    || additions.accessScope !== 28
  ) {
    increment(conflicts, "不足フィールド件数が承認済み計画と異なる");
  }
  if (conflicts.size) {
    throw new SafeApplyError("baseline-validation", `${[...conflicts.values()].reduce((sum, count) => sum + count, 0)}-conflicts`);
  }

  const markerFields = {
    name: stringField(""),
    active: booleanField(true),
    groupId: stringField(ORGANIZATION_ID)
  };
  const writes = [
    newDocumentWrite(`organizations/${ORGANIZATION_ID}`, markerFields),
    newDocumentWrite(`offices/${OFFICE_ID}`, {
      name: stringField(""),
      active: booleanField(true),
      organizationId: stringField(ORGANIZATION_ID),
      groupId: stringField(ORGANIZATION_ID),
      officeId: stringField(OFFICE_ID)
    }),
    newDocumentWrite("system/maintenanceMode", {
      active: booleanField(false),
      message: stringField(""),
      scheduledEndText: stringField("")
    }),
    ...userWrites
  ];
  if (writes.length !== EXPECTED_WRITES) {
    throw new SafeApplyError("write-plan-validation", `expected-${EXPECTED_WRITES}`);
  }
  return { writes, originalUsers };
}

async function verifyAppliedState(accessToken, originalUsers) {
  const [userDocs, organization, office, maintenance] = await Promise.all([
    listDocuments(accessToken, "users", [
      "active", "role", "accessScope", "organizationId", "groupId", "officeId"
    ]),
    getDocument(accessToken, `organizations/${ORGANIZATION_ID}`, ["active", "groupId", "name"], "verify-organization"),
    getDocument(accessToken, `offices/${OFFICE_ID}`, ["active", "organizationId", "groupId", "officeId", "name"], "verify-office"),
    getDocument(accessToken, "system/maintenanceMode", ["active", "message", "scheduledEndText"], "verify-maintenance")
  ]);
  if (
    !organization
    || organization.values.active !== true
    || organization.values.groupId !== ORGANIZATION_ID
    || organization.values.name !== ""
    || !office
    || office.values.active !== true
    || office.values.organizationId !== ORGANIZATION_ID
    || office.values.groupId !== ORGANIZATION_ID
    || office.values.officeId !== OFFICE_ID
    || office.values.name !== ""
    || !maintenance
    || maintenance.values.active !== false
    || maintenance.values.message !== ""
    || maintenance.values.scheduledEndText !== ""
    || userDocs.length !== EXPECTED_FIRESTORE_USERS
  ) {
    throw new SafeApplyError("post-commit-verification", "foundation-mismatch");
  }
  for (const document of userDocs) {
    const original = originalUsers.get(document.name);
    const expected = EXPECTED_ROLES.get(String(document.values.role || ""));
    if (
      !original
      || !expected
      || document.values.role !== original.role
      || (document.values.active === true) !== original.active
      || document.values.organizationId !== ORGANIZATION_ID
      || document.values.groupId !== ORGANIZATION_ID
      || document.values.officeId !== OFFICE_ID
      || document.values.accessScope !== expected.accessScope
    ) {
      throw new SafeApplyError("post-commit-verification", "user-mismatch");
    }
  }
}

async function main() {
  await verifyBackupManifest();
  const accessToken = await getCliAccessToken();
  const baseline = await readBaseline(accessToken);
  const { writes, originalUsers } = buildWrites(baseline);

  console.log(`対象プロジェクト: ${PROJECT_ID}（承認済み本番所属補完）`);
  console.log(`直前基準確認: Auth ${baseline.authUsers.length} / Firestore users ${baseline.userDocs.length} / 競合なし`);
  console.log(`アトミックcommit予定: ${writes.length}書き込み（個人情報・UIDは非表示）`);
  const result = await commitWritesOnce(accessToken, writes);
  if (!Array.isArray(result.writeResults) || result.writeResults.length !== EXPECTED_WRITES || !result.commitTime) {
    throw new SafeApplyError("firestore-atomic-commit", "response-outcome-unknown");
  }
  await verifyAppliedState(accessToken, originalUsers);

  console.log(`Firestoreアトミックcommit: 完了（${result.writeResults.length}書き込み）`);
  console.log("書き込み後検証: 会社・事業所・maintenance=false・28ユーザーの所属とrole保持を確認");
  console.log("Authentication変更、メンテナンス有効化、Functions・Hosting・ルールのデプロイ: 実施なし");
}

main().catch((error) => {
  const stage = error instanceof SafeApplyError ? error.stage : "unexpected";
  const status = error instanceof SafeApplyError && error.status ? ` / ${error.status}` : "";
  console.error(`本番所属補完を安全に完了できませんでした（段階: ${stage}${status}）。`);
  if (String(error?.status || "").includes("outcome-unknown")) {
    console.error("commit結果が不明なため再実行せず、GET専用監査で状態を確認してください。");
  }
  console.error("秘密情報や利用者データは表示していません。デプロイやメンテナンス有効化は行っていません。");
  process.exitCode = 1;
});
