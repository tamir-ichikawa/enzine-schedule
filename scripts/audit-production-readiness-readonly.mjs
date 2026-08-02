import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番監査を実行できません。");
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

class SafeAuditError extends Error {
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
    throw new SafeAuditError("firebase-cli-authentication");
  }

  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      throw new SafeAuditError("firebase-cli-access-token");
    }

    return accessToken;
  } catch (error) {
    if (error instanceof SafeAuditError) {
      throw error;
    }
    throw new SafeAuditError("firebase-cli-access-token");
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
    throw new SafeAuditError(stage, "network");
  }

  if (allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new SafeAuditError(stage, String(response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new SafeAuditError(stage, "invalid-json");
  }
}

function decodeFirestoreValue(value = {}) {
  if ("booleanValue" in value) {
    return value.booleanValue === true;
  }
  if ("stringValue" in value) {
    return String(value.stringValue || "");
  }
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }
  if ("nullValue" in value) {
    return null;
  }
  return undefined;
}

function decodeFirestoreDocument(document = {}) {
  const values = {};

  for (const [field, value] of Object.entries(document.fields || {})) {
    values[field] = decodeFirestoreValue(value);
  }

  return {
    id: decodeURIComponent(String(document.name || "").split("/").pop() || ""),
    values
  };
}

async function listFirestoreDocuments(accessToken, collectionId, fieldPaths) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collectionId}`
    );
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("showMissing", "false");
    for (const fieldPath of fieldPaths) {
      url.searchParams.append("mask.fieldPaths", fieldPath);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await readJson(accessToken, url, `firestore-${collectionId}`);
    documents.push(...(payload.documents || []).map(decodeFirestoreDocument));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);

  return documents;
}

async function readMaintenanceDocument(accessToken) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/system/maintenanceMode`
  );
  for (const fieldPath of ["active", "message", "scheduledEndText"]) {
    url.searchParams.append("mask.fieldPaths", fieldPath);
  }
  const payload = await readJson(accessToken, url, "firestore-maintenance", { allowNotFound: true });
  return payload ? decodeFirestoreDocument(payload).values : null;
}

async function listAuthUsers(accessToken) {
  const users = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`
    );
    url.searchParams.set("maxResults", "500");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await readJson(accessToken, url, "authentication-users");
    users.push(...(payload.users || []).map((user) => ({
      uid: String(user.localId || ""),
      disabled: user.disabled === true
    })));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);

  return users;
}

function expectedAccessScope(role, accessScope) {
  if (role === "admin") {
    return accessScope === "global" || accessScope === "office";
  }
  if (role === "staff") {
    return accessScope === "office";
  }
  if (role === "user") {
    return accessScope === "self";
  }
  return false;
}

function increment(target, key, count = 1) {
  target.set(key, (target.get(key) || 0) + count);
}

function printCounts(title, counts) {
  console.log(title);
  if (!counts.size) {
    console.log("- なし");
    return;
  }
  for (const [label, count] of counts) {
    console.log(`- ${label}: ${count}件`);
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
    throw new SafeAuditError("project-confirmation", "not-active");
  }

  const [userDocs, organizationDocs, officeDocs, maintenance, authUsers] = await Promise.all([
    listFirestoreDocuments(accessToken, "users", [
      "active",
      "role",
      "accessScope",
      "organizationId",
      "groupId",
      "officeId"
    ]),
    listFirestoreDocuments(accessToken, "organizations", ["active", "groupId"]),
    listFirestoreDocuments(accessToken, "offices", ["active", "organizationId", "groupId", "officeId"]),
    readMaintenanceDocument(accessToken),
    listAuthUsers(accessToken)
  ]);

  const organizations = new Map(organizationDocs.map((doc) => [doc.id, doc.values]));
  const offices = new Map(officeDocs.map((doc) => [doc.id, doc.values]));
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const profileUids = new Set(userDocs.map((doc) => doc.id));
  const roles = new Map();
  const roleReadiness = new Map();
  const knownOfficeIds = new Map([
    ["enzine_chiba", 0],
    ["engine_chiba", 0],
    ["other", 0],
    ["missing", 0]
  ]);
  const knownGroupIds = new Map([
    ["enzine", 0],
    ["other", 0],
    ["missing", 0]
  ]);
  const issues = new Map();
  const warnings = new Map();
  let activeGlobalAdmins = 0;
  let activeAdmins = 0;

  for (const userDoc of userDocs) {
    const user = userDoc.values;
    const organizationId = String(user.organizationId || "").trim();
    const groupId = String(user.groupId || "").trim();
    const officeId = String(user.officeId || "").trim();
    const accessScope = String(user.accessScope || "").trim();
    const role = String(user.role || "").trim();
    const authUser = authByUid.get(userDoc.id);

    increment(roles, role || "role未設定");
    const roleKey = role || "role未設定";
    const readiness = roleReadiness.get(roleKey) || {
      total: 0,
      active: 0,
      missingOrganizationId: 0,
      missingGroupId: 0,
      missingOfficeId: 0,
      missingOrInvalidScope: 0
    };
    readiness.total += 1;
    readiness.active += user.active === true ? 1 : 0;
    readiness.missingOrganizationId += organizationId ? 0 : 1;
    readiness.missingGroupId += groupId ? 0 : 1;
    readiness.missingOfficeId += officeId ? 0 : 1;
    readiness.missingOrInvalidScope += expectedAccessScope(role, accessScope) ? 0 : 1;
    roleReadiness.set(roleKey, readiness);

    if (!officeId) {
      increment(knownOfficeIds, "missing");
    } else if (officeId === "enzine_chiba" || officeId === "engine_chiba") {
      increment(knownOfficeIds, officeId);
    } else {
      increment(knownOfficeIds, "other");
    }
    if (!groupId) {
      increment(knownGroupIds, "missing");
    } else if (groupId === "enzine") {
      increment(knownGroupIds, "enzine");
    } else {
      increment(knownGroupIds, "other");
    }

    if (user.active === true && role === "admin" && accessScope === "global") {
      activeGlobalAdmins += 1;
    }
    if (user.active === true && role === "admin") {
      activeAdmins += 1;
    }
    if (!authUser) {
      increment(warnings, "Firestoreプロフィールに対応するAuthアカウントがない");
    } else if (user.active === true && authUser.disabled) {
      increment(issues, "有効プロフィールに対するAuthアカウントが無効");
    }
    if (!organizationId) {
      increment(issues, "organizationIdがない");
    }
    if (!groupId) {
      increment(issues, "groupIdがない");
    }
    if (organizationId && groupId && organizationId !== groupId) {
      increment(issues, "organizationIdとgroupIdが一致しない");
    }
    if (!officeId) {
      increment(issues, "officeIdがない");
    }
    if (!expectedAccessScope(role, accessScope)) {
      increment(issues, "roleとaccessScopeの組み合わせが未設定または不正");
    }

    const organization = organizations.get(organizationId);
    const office = offices.get(officeId);

    if (organizationId && !organization) {
      increment(issues, "参照先の運営会社がない");
    }
    if (officeId && !office) {
      increment(issues, "参照先の事業所がない");
    }
    if (user.active === true && organization && organization.active !== true) {
      increment(issues, "有効ユーザーの運営会社が無効");
    }
    if (user.active === true && office && office.active !== true) {
      increment(issues, "有効ユーザーの事業所が無効");
    }
    if (office && organizationId
      && String(office.organizationId || office.groupId || "").trim() !== organizationId) {
      increment(issues, "事業所とユーザーの運営会社が一致しない");
    }
  }

  for (const authUser of authUsers) {
    if (!profileUids.has(authUser.uid)) {
      increment(warnings, "Authアカウントに対応するFirestoreプロフィールがない");
    }
  }

  if (activeGlobalAdmins < 1) {
    increment(issues, "有効な全体管理者がいない");
  }
  if (!maintenance) {
    increment(issues, "maintenanceModeドキュメントがない");
  } else {
    if (maintenance.active === true) {
      increment(issues, "監査時点でメンテナンスが有効");
    }
    if (String(maintenance.message || "").length > 400) {
      increment(issues, "メンテナンス案内が上限を超えている");
    }
  }

  console.log(`対象プロジェクト: ${PROJECT_ID}（ACTIVE・読み取り専用）`);
  console.log("実在名・メール・UID・本文・認証情報は表示していません。");
  console.log(`Authentication: ${authUsers.length}件`);
  console.log(`Firestore users: ${userDocs.length}件`);
  console.log(`運営会社: ${organizationDocs.length}件 / 事業所: ${officeDocs.length}件`);
  console.log(`有効な既存admin: ${activeAdmins}件 / 有効な全体管理者: ${activeGlobalAdmins}件`);
  printCounts("役割別件数", roles);
  console.log("役割別の補完必要数");
  for (const [role, readiness] of roleReadiness) {
    console.log(
      `- ${role}: 全${readiness.total} / 有効${readiness.active}`
      + ` / organizationId不足${readiness.missingOrganizationId}`
      + ` / groupId不足${readiness.missingGroupId}`
      + ` / officeId不足${readiness.missingOfficeId}`
      + ` / accessScope不足・不正${readiness.missingOrInvalidScope}`
    );
  }
  console.log("既存officeIdの互換状況");
  console.log(`- enzine_chiba: ${knownOfficeIds.get("enzine_chiba")}件`);
  console.log(`- engine_chiba: ${knownOfficeIds.get("engine_chiba")}件`);
  console.log(`- その他の設定値: ${knownOfficeIds.get("other")}件`);
  console.log(`- 未設定: ${knownOfficeIds.get("missing")}件`);
  console.log("既存groupIdの互換状況");
  console.log(`- enzine: ${knownGroupIds.get("enzine")}件`);
  console.log(`- その他の設定値: ${knownGroupIds.get("other")}件`);
  console.log(`- 未設定: ${knownGroupIds.get("missing")}件`);
  printCounts("警告", warnings);
  printCounts("本番候補反映前の必須補完", issues);

  if (issues.size) {
    process.exitCode = 2;
  } else {
    console.log("本番候補反映前の必須データ条件を満たしています。");
  }
}

main().catch((error) => {
  const stage = error instanceof SafeAuditError ? error.stage : "unexpected";
  const status = error instanceof SafeAuditError && error.status ? ` / ${error.status}` : "";
  console.error(`本番読み取り監査を安全に完了できませんでした（段階: ${stage}${status}）。`);
  process.exitCode = 1;
});
