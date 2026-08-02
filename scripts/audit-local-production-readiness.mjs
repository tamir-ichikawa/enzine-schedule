import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "demo-enzine-schedule-local";
const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

if (!PROJECT_ID.startsWith("demo-")
  || !AUTH_EMULATOR_HOST.startsWith("127.0.0.1:")
  || !FIRESTORE_EMULATOR_HOST.startsWith("127.0.0.1:")) {
  throw new Error("安全のため、PC内のdemoプロジェクト以外は監査できません。");
}

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(projectRoot, "functions", "node_modules", "firebase-admin"));
const app = admin.initializeApp({ projectId: PROJECT_ID });
const auth = admin.auth(app);
const db = admin.firestore(app);

const [authResult, usersSnap, organizationsSnap, officesSnap, maintenanceSnap] = await Promise.all([
  auth.listUsers(1000),
  db.collection("users").get(),
  db.collection("organizations").get(),
  db.collection("offices").get(),
  db.collection("system").doc("maintenanceMode").get()
]);

const authUids = new Set(authResult.users.map((user) => user.uid));
const firestoreUids = new Set(usersSnap.docs.map((docSnap) => docSnap.id));
const organizations = new Map(organizationsSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() || {}]));
const offices = new Map(officesSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() || {}]));
const issues = new Map();
const warnings = new Map();
let activeGlobalAdmins = 0;

function record(target, code, documentId) {
  const ids = target.get(code) || [];
  ids.push(documentId);
  target.set(code, ids);
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

for (const userSnap of usersSnap.docs) {
  const user = userSnap.data() || {};
  const id = userSnap.id;
  const organizationId = String(user.organizationId || "").trim();
  const groupId = String(user.groupId || "").trim();
  const officeId = String(user.officeId || "").trim();
  const accessScope = String(user.accessScope || "").trim();

  if (user.active === true && user.role === "admin" && accessScope === "global") {
    activeGlobalAdmins += 1;
  }

  if (!authUids.has(id)) {
    record(warnings, "Firestoreプロフィールに対応するAuthアカウントがない", id);
  }
  if (!organizationId) {
    record(issues, "organizationIdがない", id);
  }
  if (!groupId) {
    record(issues, "groupIdがない", id);
  }
  if (organizationId && groupId && organizationId !== groupId) {
    record(issues, "organizationIdとgroupIdが一致しない", id);
  }
  if (!officeId) {
    record(issues, "officeIdがない", id);
  }
  if (!expectedAccessScope(user.role, accessScope)) {
    record(issues, "roleとaccessScopeの組み合わせが不正", id);
  }

  const organization = organizations.get(organizationId);
  const office = offices.get(officeId);

  if (organizationId && !organization) {
    record(issues, "参照先の運営会社がない", id);
  }
  if (officeId && !office) {
    record(issues, "参照先の事業所がない", id);
  }
  if (user.active === true && organization && organization.active !== true) {
    record(issues, "有効ユーザーの運営会社が無効", id);
  }
  if (user.active === true && office && office.active !== true) {
    record(issues, "有効ユーザーの事業所が無効", id);
  }
  if (office && organizationId
    && String(office.organizationId || office.groupId || "").trim() !== organizationId) {
    record(issues, "事業所とユーザーの運営会社が一致しない", id);
  }
}

for (const uid of authUids) {
  if (!firestoreUids.has(uid)) {
    record(warnings, "Authアカウントに対応するFirestoreプロフィールがない", uid);
  }
}

if (activeGlobalAdmins < 1) {
  record(issues, "有効な全体管理者が1名もいない", "system");
}

if (!maintenanceSnap.exists) {
  record(issues, "maintenanceModeドキュメントがない", "system/maintenanceMode");
} else {
  const maintenance = maintenanceSnap.data() || {};

  if (maintenance.active === true) {
    record(issues, "事前監査時点でメンテナンスが有効", "system/maintenanceMode");
  }
  if (String(maintenance.message || "").length > 400) {
    record(issues, "メンテナンス案内が上限を超えている", "system/maintenanceMode");
  }
}

function printFindings(label, findings) {
  if (!findings.size) {
    console.log(`${label}: なし`);
    return;
  }

  console.log(`${label}: ${findings.size}種類`);
  for (const [code, ids] of findings) {
    const examples = ids.slice(0, 5).join(", ");
    const suffix = ids.length > 5 ? ` ほか${ids.length - 5}件` : "";
    console.log(`- ${code}: ${ids.length}件 (${examples}${suffix})`);
  }
}

console.log(`監査対象: PC内 ${PROJECT_ID}`);
console.log(`Auth: ${authUids.size}件 / users: ${firestoreUids.size}件 / 運営会社: ${organizations.size}件 / 事業所: ${offices.size}件`);
console.log(`有効な全体管理者: ${activeGlobalAdmins}件`);
printFindings("警告", warnings);
printFindings("必須修正", issues);

await app.delete();

if (issues.size) {
  process.exitCode = 1;
} else {
  console.log("本番移行前の必須データ条件を満たしています（ローカル架空データ）。");
}
