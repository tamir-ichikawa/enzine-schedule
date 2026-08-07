import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "demo-enzine-schedule-local";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const FUNCTIONS_EMULATOR_HOST = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
const AUTH_ORIGIN = `http://${AUTH_EMULATOR_HOST}`;
const FUNCTIONS_ORIGIN = `http://${FUNCTIONS_EMULATOR_HOST}`;
const FIRESTORE_ORIGIN = `http://${FIRESTORE_EMULATOR_HOST}`;
const TEST_PASSWORD = "LocalTest!2026";

if (!PROJECT_ID.startsWith("demo-")) {
  throw new Error("安全のため demo- で始まるプロジェクトID以外は検証できません。");
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

async function parseJsonResponse(response, label) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label}: JSON以外の応答です (${response.status})`);
  }
}

async function signIn(email) {
  const response = await fetch(
    `${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator-only`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        returnSecureToken: true
      })
    }
  );
  const payload = await parseJsonResponse(response, `Authentication sign-in (${email})`);

  if (!response.ok) {
    throw new Error(`Authentication sign-in (${email}): ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function callCallable(idToken, functionName, data = {}) {
  const response = await fetch(
    `${FUNCTIONS_ORIGIN}/${PROJECT_ID}/asia-northeast1/${functionName}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ data })
    }
  );
  const payload = await parseJsonResponse(response, functionName);
  return { response, payload };
}

async function expectCallableSuccess(idToken, functionName, data = {}) {
  const { response, payload } = await callCallable(idToken, functionName, data);

  if (!response.ok || (!("result" in payload) && !("data" in payload))) {
    throw new Error(`${functionName}: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.result ?? payload.data;
}

async function expectPermissionDenied(idToken, functionName, data = {}) {
  const { response, payload } = await callCallable(idToken, functionName, data);
  const status = payload?.error?.status || "";

  if (response.ok || status !== "PERMISSION_DENIED") {
    throw new Error(`${functionName}: 権限拒否を確認できませんでした ${response.status} ${JSON.stringify(payload)}`);
  }
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

async function firestoreDocumentRequest(idToken, method, documentPath, data) {
  const response = await fetch(
    `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
    {
      method,
      headers: {
        ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
        "content-type": "application/json"
      },
      body: data === undefined ? undefined : JSON.stringify({ fields: toFirestoreFields(data) })
    }
  );
  const payload = await parseJsonResponse(response, `Firestore ${method} ${documentPath}`);
  return { response, payload };
}

async function expectFirestoreAllowed(idToken, method, documentPath, data) {
  const { response, payload } = await firestoreDocumentRequest(idToken, method, documentPath, data);

  if (!response.ok) {
    throw new Error(`Firestore許可確認失敗 ${method} ${documentPath}: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function expectFirestoreDenied(idToken, method, documentPath, data) {
  const { response, payload } = await firestoreDocumentRequest(idToken, method, documentPath, data);

  if (response.status !== 401 && response.status !== 403) {
    throw new Error(`Firestore拒否確認失敗 ${method} ${documentPath}: ${response.status} ${JSON.stringify(payload)}`);
  }
}

function fieldFilter(fieldPath, op, value) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op,
      value: toFirestoreValue(value)
    }
  };
}

async function firestoreQueryRequest(idToken, structuredQuery) {
  const response = await fetch(
    `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ structuredQuery })
    }
  );
  const payload = await parseJsonResponse(response, "Firestore runQuery");
  return { response, payload };
}

async function expectFirestoreQueryAllowed(idToken, structuredQuery) {
  const { response, payload } = await firestoreQueryRequest(idToken, structuredQuery);

  if (!response.ok) {
    throw new Error(`Firestoreクエリ許可確認失敗: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function expectFirestoreQueryDenied(idToken, structuredQuery) {
  const { response, payload } = await firestoreQueryRequest(idToken, structuredQuery);

  if (response.status !== 401 && response.status !== 403) {
    throw new Error(`Firestoreクエリ拒否確認失敗: ${response.status} ${JSON.stringify(payload)}`);
  }
}

async function removeTestAccount(email) {
  try {
    const user = await auth.getUserByEmail(email);
    await db.collection("users").doc(user.uid).delete();
    await auth.deleteUser(user.uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }
  }
}

async function clearAdminAuditLogs() {
  const snapshot = await db.collection("adminAuditLogs").get();
  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 400).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
}

async function waitForAdminAuditAction(idToken, action) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await expectCallableSuccess(idToken, "getAdminAuditLogs", { limit: 100 });
    if ((result.logs || []).some((log) => log.action === action)) {
      return result.logs;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`管理監査ログに ${action} が記録されませんでした。`);
}

async function main() {
  const authUsers = await auth.listUsers(100);
  const emails = new Set(authUsers.users.map((user) => user.email));

  for (const requiredEmail of [
    "global.admin@example.test",
    "office.admin@example.test",
    "staff@example.test",
    "user.a@example.test"
  ]) {
    assert(emails.has(requiredEmail), `Authentication Emulator: ${requiredEmail} がありません。`);
  }

  const firestoreUsers = await db.collection("users").get();
  assert(firestoreUsers.size >= 4, "Firestore Emulator: users が4件未満です。");

  const globalAdminProfile = firestoreUsers.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((user) => user.email === "global.admin@example.test");
  const officeAdminProfile = firestoreUsers.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((user) => user.email === "office.admin@example.test");
  const staffProfile = firestoreUsers.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((user) => user.email === "staff@example.test");
  const userAProfile = firestoreUsers.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((user) => user.email === "user.a@example.test");
  const userBProfile = firestoreUsers.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((user) => user.email === "user.b@example.test");

  assert.equal(globalAdminProfile?.accessScope, "global");
  assert.equal(officeAdminProfile?.accessScope, "office");
  assert.equal(officeAdminProfile?.organizationId, "demo-operator");
  assert.equal(officeAdminProfile?.officeId, "demo-office-a");
  assert(staffProfile?.id && userAProfile?.id && userBProfile?.id);

  await clearAdminAuditLogs();
  await db.collection("system").doc("billingSafety").delete();
  await db.collection("offices").doc("verification-office").delete();
  await db.collection("organizations").doc("verification-operator").delete();

  const staffSignIn = await signIn("staff@example.test");
  const userASignIn = await signIn("user.a@example.test");
  const userBSignIn = await signIn("user.b@example.test");
  await expectCallableSuccess(staffSignIn.idToken, "getChatworkConsoleData", { includeConfig: false });

  await removeTestAccount("verification.office.admin@example.test");
  await removeTestAccount("forced.staff@example.test");
  await removeTestAccount("forced.user@example.test");

  const globalSignIn = await signIn("global.admin@example.test");
  const officeAdminSignIn = await signIn("office.admin@example.test");
  await expectPermissionDenied(officeAdminSignIn.idToken, "getAdminAuditLogs", { limit: 50 });
  await expectFirestoreDenied(globalSignIn.idToken, "GET", "adminAuditLogs/not-directly-readable");
  await expectFirestoreQueryDenied(globalSignIn.idToken, {
    from: [{ collectionId: "adminAuditLogs" }]
  });
  const [globalBrand, officeAdminBrand, staffBrand, userABrand, userBBrand] = await Promise.all([
    expectCallableSuccess(globalSignIn.idToken, "getCurrentOfficeBrand", {}),
    expectCallableSuccess(officeAdminSignIn.idToken, "getCurrentOfficeBrand", {}),
    expectCallableSuccess(staffSignIn.idToken, "getCurrentOfficeBrand", {}),
    expectCallableSuccess(userASignIn.idToken, "getCurrentOfficeBrand", {}),
    expectCallableSuccess(userBSignIn.idToken, "getCurrentOfficeBrand", {})
  ]);

  assert.deepEqual(globalBrand, { officeId: "demo-office-a", name: "ローカル事業所A" });
  assert.deepEqual(officeAdminBrand, { officeId: "demo-office-a", name: "ローカル事業所A" });
  assert.deepEqual(staffBrand, { officeId: "demo-office-a", name: "ローカル事業所A" });
  assert.deepEqual(userABrand, { officeId: "demo-office-a", name: "ローカル事業所A" });
  assert.deepEqual(userBBrand, { officeId: "demo-office-b", name: "ローカル事業所B" });

  await expectCallableSuccess(globalSignIn.idToken, "upsertOrganization", {
    organizationId: "verification-operator",
    name: "検証用運営会社",
    active: true
  });
  await expectCallableSuccess(globalSignIn.idToken, "upsertOffice", {
    organizationId: "verification-operator",
    officeId: "verification-office",
    name: "検証用事業所",
    active: true
  });
  const createdOfficeAdmin = await expectCallableSuccess(
    globalSignIn.idToken,
    "createOfficeAdminAccount",
    {
      organizationId: "verification-operator",
      officeId: "verification-office",
      name: "検証用事業所管理者",
      nameKana: "けんしょうようじぎょうしょかんりしゃ",
      email: "verification.office.admin@example.test",
      password: TEST_PASSWORD
    }
  );
  const createdOfficeAdminSnap = await db.collection("users").doc(createdOfficeAdmin.uid).get();
  const createdOfficeAdminProfile = createdOfficeAdminSnap.data() || {};

  assert.equal(createdOfficeAdminProfile.role, "admin");
  assert.equal(createdOfficeAdminProfile.accessScope, "office");
  assert.equal(createdOfficeAdminProfile.organizationId, "verification-operator");
  assert.equal(createdOfficeAdminProfile.officeId, "verification-office");
  assert.equal(createdOfficeAdminProfile.groupId, "verification-operator");

  const userCreateAuditLogs = await waitForAdminAuditAction(globalSignIn.idToken, "user.create");
  const createdUserAudit = userCreateAuditLogs.find(
    (log) => log.action === "user.create" && log.targetId === createdOfficeAdmin.uid
  );
  assert(createdUserAudit, "事業所管理者発行の監査ログがありません。");
  assert.equal(createdUserAudit.actorUid, globalAdminProfile.id);
  assert.equal(createdUserAudit.targetRole, "admin");
  assert(!Object.hasOwn(createdUserAudit, "actorEmail"));
  assert(!Object.hasOwn(createdUserAudit, "targetEmail"));
  assert(!Object.hasOwn(createdUserAudit, "message"));

  const managementData = await expectCallableSuccess(
    globalSignIn.idToken,
    "getOrganizationManagementData",
    {}
  );
  assert(managementData.organizations.some((organization) => organization.id === "verification-operator"));
  assert(managementData.offices.some((office) => office.id === "verification-office"));
  assert(managementData.officeAdmins.some((user) => user.id === createdOfficeAdmin.uid));

  await expectCallableSuccess(globalSignIn.idToken, "upsertOrganization", {
    organizationId: "verification-operator",
    name: "名称変更後の検証用運営会社",
    active: true
  });
  const renamedManagementData = await expectCallableSuccess(
    globalSignIn.idToken,
    "getOrganizationManagementData",
    {}
  );
  const renamedOrganization = renamedManagementData.organizations.find(
    (organization) => organization.id === "verification-operator"
  );
  const unchangedOffice = renamedManagementData.offices.find(
    (office) => office.id === "verification-office"
  );
  const unchangedOfficeAdmin = renamedManagementData.officeAdmins.find(
    (user) => user.id === createdOfficeAdmin.uid
  );

  assert.equal(renamedOrganization?.name, "名称変更後の検証用運営会社");
  assert.equal(unchangedOffice?.organizationId, "verification-operator");
  assert.equal(unchangedOfficeAdmin?.organizationId, "verification-operator");

  const managementAudit = await expectCallableSuccess(
    globalSignIn.idToken,
    "getAdminAuditLogs",
    { limit: 100 }
  );
  const managementActions = new Set((managementAudit.logs || []).map((log) => log.action));
  assert(managementActions.has("organization.created"));
  assert(managementActions.has("organization.updated"));
  assert(managementActions.has("office.created"));

  await expectPermissionDenied(officeAdminSignIn.idToken, "upsertOrganization", {
    organizationId: "unauthorized-operator",
    name: "作成されてはいけない会社",
    active: true
  });
  await expectPermissionDenied(
    officeAdminSignIn.idToken,
    "migrateLegacyOfficeIdToEnzineChiba",
    {}
  );
  await expectPermissionDenied(officeAdminSignIn.idToken, "createAuthUserAndProfile", {
    name: "作成されてはいけない管理者",
    email: "denied.admin@example.test",
    password: TEST_PASSWORD,
    role: "admin",
    officeId: "demo-office-b",
    groupId: "unauthorized-operator"
  });

  const forcedStaff = await expectCallableSuccess(
    officeAdminSignIn.idToken,
    "createAuthUserAndProfile",
    {
      name: "固定先検証支援員",
      nameKana: "こていさきけんしょうしえんいん",
      email: "forced.staff@example.test",
      password: TEST_PASSWORD,
      role: "staff",
      active: true,
      organizationId: "unauthorized-operator",
      officeId: "demo-office-b",
      groupId: "unauthorized-operator"
    }
  );
  const forcedStaffSnap = await db.collection("users").doc(forcedStaff.uid).get();
  const forcedStaffProfile = forcedStaffSnap.data() || {};

  assert.equal(forcedStaffProfile.role, "staff");
  assert.equal(forcedStaffProfile.accessScope, "office");
  assert.equal(forcedStaffProfile.organizationId, "demo-operator");
  assert.equal(forcedStaffProfile.officeId, "demo-office-a");
  assert.equal(forcedStaffProfile.groupId, "demo-operator");

  const forcedUser = await expectCallableSuccess(
    officeAdminSignIn.idToken,
    "createAuthUserAndProfile",
    {
      name: "固定先検証利用者",
      nameKana: "こていさきけんしょうりようしゃ",
      email: "forced.user@example.test",
      password: TEST_PASSWORD,
      role: "user",
      active: true,
      organizationId: "unauthorized-operator",
      officeId: "demo-office-b",
      groupId: "unauthorized-operator"
    }
  );
  const forcedUserSnap = await db.collection("users").doc(forcedUser.uid).get();
  const forcedUserProfile = forcedUserSnap.data() || {};

  assert.equal(forcedUserProfile.organizationId, "demo-operator");
  assert.equal(forcedUserProfile.officeId, "demo-office-a");
  assert.equal(forcedUserProfile.groupId, "demo-operator");

  const activeUsersCacheSnap = await db.collection("system").doc("activeUsers").get();
  const activeUsersCache = activeUsersCacheSnap.data() || {};
  const officeAUsers = activeUsersCache.offices?.["demo-office-a"]?.users || [];
  const officeBUsers = activeUsersCache.offices?.["demo-office-b"]?.users || [];

  assert(officeAUsers.some((user) => user.uid === forcedUser.uid));
  assert(!officeBUsers.some((user) => user.uid === forcedUser.uid));

  await db.collection("monthlySchedules").doc(`${userAProfile.id}_rules-test`).delete();
  await db.collection("monthlySchedules").doc(`${userBProfile.id}_rules-test`).delete();
  await db.collection("weeklyReports").doc(`${userAProfile.id}_rules-test`).delete();

  await expectFirestoreDenied("", "GET", `users/${userAProfile.id}`);
  await expectFirestoreAllowed(userASignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreDenied(userASignIn.idToken, "GET", `users/${userBProfile.id}`);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreDenied(staffSignIn.idToken, "GET", `users/${userBProfile.id}`);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreDenied(officeAdminSignIn.idToken, "GET", `users/${userBProfile.id}`);
  await expectFirestoreAllowed(globalSignIn.idToken, "GET", `users/${userBProfile.id}`);
  await expectFirestoreAllowed(userASignIn.idToken, "GET", "offices/demo-office-a");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "offices/demo-office-b");

  const managedStaffA = {
    name: "ルール検証支援員A",
    email: "rules.staff.a@example.test",
    role: "staff",
    accessScope: "office",
    active: true,
    organizationId: "demo-operator",
    groupId: "demo-operator",
    officeId: "demo-office-a"
  };
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "PATCH", "users/rules-managed-staff-a", managedStaffA);
  await expectFirestoreDenied(staffSignIn.idToken, "PATCH", "users/rules-staff-cannot-write", managedStaffA);
  await expectFirestoreDenied(officeAdminSignIn.idToken, "PATCH", "users/rules-admin-cannot-create", {
    ...managedStaffA,
    role: "admin",
    accessScope: "office"
  });
  await expectFirestoreDenied(officeAdminSignIn.idToken, "PATCH", "users/rules-other-office-cannot-create", {
    ...managedStaffA,
    officeId: "demo-office-b"
  });

  await expectFirestoreDenied(globalSignIn.idToken, "PATCH", "organizations/direct-write-denied", {
    name: "Callableを経由しない会社",
    active: true,
    groupId: "direct-write-denied"
  });

  const userASchedule = {
    userId: userAProfile.id,
    userName: userAProfile.name,
    officeId: "demo-office-a",
    groupId: "demo-operator",
    month: "rules-test",
    days: {}
  };
  const userBSchedule = {
    userId: userBProfile.id,
    userName: userBProfile.name,
    officeId: "demo-office-b",
    groupId: "demo-operator",
    month: "rules-test",
    days: {}
  };

  await expectFirestoreAllowed(
    userASignIn.idToken,
    "PATCH",
    `monthlySchedules/${userAProfile.id}_rules-test`,
    userASchedule
  );
  await expectFirestoreDenied(
    userASignIn.idToken,
    "PATCH",
    `monthlySchedules/${userBProfile.id}_rules-test`,
    userBSchedule
  );
  await expectFirestoreAllowed(
    staffSignIn.idToken,
    "PATCH",
    `monthlySchedules/${userAProfile.id}_rules-test`,
    userASchedule
  );
  await expectFirestoreDenied(
    staffSignIn.idToken,
    "PATCH",
    `monthlySchedules/${userBProfile.id}_rules-test`,
    userBSchedule
  );

  await expectFirestoreAllowed(userASignIn.idToken, "PATCH", `weeklyReports/${userAProfile.id}_rules-test`, {
    userId: userAProfile.id,
    userName: userAProfile.name,
    officeId: "demo-office-a",
    groupId: "demo-operator",
    weekStartDate: "rules-test",
    submitted: true
  });
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", `weeklyReports/${userAProfile.id}_rules-test`);
  await expectFirestoreDenied(userBSignIn.idToken, "GET", `weeklyReports/${userAProfile.id}_rules-test`);

  const statusA = {
    userId: userAProfile.id,
    userName: userAProfile.name,
    officeId: "demo-office-a",
    groupId: "demo-operator",
    schemaVersion: 1,
    submittedWeeks: { "rules-test": true }
  };
  const statusB = {
    userId: userBProfile.id,
    userName: userBProfile.name,
    officeId: "demo-office-b",
    groupId: "demo-operator",
    schemaVersion: 1,
    submittedWeeks: { "rules-test": true }
  };
  await expectFirestoreAllowed(userASignIn.idToken, "PATCH", `weeklyReportUserStatus/${userAProfile.id}`, statusA);
  await expectFirestoreDenied(userASignIn.idToken, "PATCH", `weeklyReportUserStatus/${userBProfile.id}`, statusB);
  await db.collection("weeklyReportUserStatus").doc(userBProfile.id).set(statusB);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", `weeklyReportUserStatus/${userAProfile.id}`);
  await expectFirestoreDenied(staffSignIn.idToken, "GET", `weeklyReportUserStatus/${userBProfile.id}`);

  const announcementA = {
    officeId: "demo-office-a",
    groupId: "demo-operator",
    month: "rules-test",
    items: []
  };
  const announcementB = {
    officeId: "demo-office-b",
    groupId: "demo-operator",
    month: "rules-test",
    items: []
  };
  await db.collection("monthlyAnnouncements").doc("rules-announcement-a").set(announcementA);
  await db.collection("monthlyAnnouncements").doc("rules-announcement-b").set(announcementB);
  await expectFirestoreAllowed(userASignIn.idToken, "GET", "monthlyAnnouncements/rules-announcement-a");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "monthlyAnnouncements/rules-announcement-b");
  await expectFirestoreDenied(userASignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-a_rules-user-cannot-write", announcementA);
  await expectFirestoreAllowed(staffSignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-a_rules-staff-a", announcementA);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-a_rules-office-admin-a", announcementA);
  await expectFirestoreDenied(staffSignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-b_rules-wrong-document-id", announcementA);
  await expectFirestoreDenied(officeAdminSignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-b_rules-office-admin-b", announcementB);
  await expectFirestoreAllowed(globalSignIn.idToken, "PATCH", "monthlyAnnouncements/demo-office-b_rules-global", announcementB);

  const staffAnnouncementA = {
    ...announcementA,
    visibility: "staff",
    days: {
      "2026-08-07": [{
        id: "rules-private-attendance",
        category: "attendance",
        visibility: "staff",
        title: "勤怠",
        staffAssignments: [{ staffId: "support-a", staffName: "支援員A", note: "午後" }]
      }]
    }
  };
  const staffAnnouncementB = {
    ...staffAnnouncementA,
    officeId: "demo-office-b"
  };
  await db.collection("staffMonthlyAnnouncements").doc("demo-office-a_rules-private-a").set(staffAnnouncementA);
  await db.collection("staffMonthlyAnnouncements").doc("demo-office-b_rules-private-b").set(staffAnnouncementB);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", "staffMonthlyAnnouncements/demo-office-a_rules-private-a");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "staffMonthlyAnnouncements/demo-office-a_rules-private-a");
  await expectFirestoreDenied(staffSignIn.idToken, "GET", "staffMonthlyAnnouncements/demo-office-b_rules-private-b");
  await expectFirestoreAllowed(staffSignIn.idToken, "PATCH", "staffMonthlyAnnouncements/demo-office-a_rules-staff-a", staffAnnouncementA);
  await expectFirestoreDenied(staffSignIn.idToken, "PATCH", "staffMonthlyAnnouncements/demo-office-b_rules-staff-b", staffAnnouncementB);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "PATCH", "staffMonthlyAnnouncements/demo-office-a_rules-office-admin-a", staffAnnouncementA);
  await expectFirestoreAllowed(globalSignIn.idToken, "PATCH", "staffMonthlyAnnouncements/demo-office-b_rules-global", staffAnnouncementB);

  const workshopA = {
    officeId: "demo-office-a",
    organizationId: "demo-operator",
    groupId: "demo-operator",
    workshops: [],
    cases: []
  };
  const workshopB = {
    ...workshopA,
    officeId: "demo-office-b"
  };
  await db.collection("system").doc("workshopResources_demo-office-a").set(workshopA);
  await db.collection("system").doc("workshopResources_demo-office-b").set(workshopB);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", "system/workshopResources_demo-office-a");
  await expectFirestoreDenied(staffSignIn.idToken, "GET", "system/workshopResources_demo-office-b");
  await expectFirestoreAllowed(staffSignIn.idToken, "PATCH", "system/workshopResources_demo-office-a", workshopA);
  await expectFirestoreDenied(staffSignIn.idToken, "PATCH", "system/workshopResources_demo-office-b", workshopB);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "PATCH", "system/workshopResources_demo-office-a", workshopA);
  await expectFirestoreDenied(officeAdminSignIn.idToken, "PATCH", "system/workshopResources_demo-office-b", workshopB);
  await expectFirestoreAllowed(globalSignIn.idToken, "PATCH", "system/workshopResources_demo-office-b", workshopB);

  const supportStaffA = {
    schemaVersion: 1,
    officeId: "demo-office-a",
    organizationId: "demo-operator",
    groupId: "demo-operator",
    staffMembers: [{ id: "support-a", name: "支援員A" }]
  };
  const supportStaffB = {
    ...supportStaffA,
    officeId: "demo-office-b",
    staffMembers: [{ id: "support-b", name: "支援員B" }]
  };
  await db.collection("system").doc("supportStaff_demo-office-a").set(supportStaffA);
  await db.collection("system").doc("supportStaff_demo-office-b").set(supportStaffB);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", "system/supportStaff_demo-office-a");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "system/supportStaff_demo-office-a");
  await expectFirestoreDenied(staffSignIn.idToken, "GET", "system/supportStaff_demo-office-b");
  await expectFirestoreAllowed(staffSignIn.idToken, "PATCH", "system/supportStaff_demo-office-a", supportStaffA);
  await expectFirestoreDenied(staffSignIn.idToken, "PATCH", "system/supportStaff_demo-office-b", supportStaffB);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "PATCH", "system/supportStaff_demo-office-a", supportStaffA);
  await expectFirestoreDenied(officeAdminSignIn.idToken, "PATCH", "system/supportStaff_demo-office-b", supportStaffB);
  await expectFirestoreAllowed(globalSignIn.idToken, "PATCH", "system/supportStaff_demo-office-b", supportStaffB);

  await expectFirestoreAllowed(staffSignIn.idToken, "GET", "system/activeUsers_demo-office-a");
  await expectFirestoreDenied(staffSignIn.idToken, "GET", "system/activeUsers_demo-office-b");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "system/activeUsers_demo-office-a");
  await expectFirestoreDenied(officeAdminSignIn.idToken, "GET", "system/activeUsers");
  await expectFirestoreAllowed(
    officeAdminSignIn.idToken,
    "PATCH",
    "system/activeUsers_demo-office-a",
    {
      schemaVersion: 1,
      organizationId: "demo-operator",
      groupId: "demo-operator",
      officeId: "demo-office-a",
      users: officeAUsers
    }
  );

  await expectFirestoreAllowed(globalSignIn.idToken, "PATCH", "system/billingSafety", {
    locked: false,
    warning: true,
    level: "warning",
    reason: "rules-test",
    updatedByUid: globalAdminProfile.id
  });
  await expectFirestoreAllowed(globalSignIn.idToken, "GET", "system/billingSafety");
  await expectFirestoreDenied(officeAdminSignIn.idToken, "GET", "system/billingSafety");
  await expectFirestoreDenied(staffSignIn.idToken, "GET", "system/billingSafety");
  await expectFirestoreDenied(userASignIn.idToken, "GET", "system/billingSafety");
  const billingAuditLogs = await waitForAdminAuditAction(
    globalSignIn.idToken,
    "billing_safety.create"
  );
  const billingAudit = billingAuditLogs.find((log) => log.action === "billing_safety.create");
  assert(billingAudit);
  assert.deepEqual(
    [...billingAudit.changedFields].sort(),
    ["level", "locked", "reason", "warning"]
  );
  assert(!Object.hasOwn(billingAudit, "reason"));

  await expectFirestoreQueryAllowed(globalSignIn.idToken, {
    from: [{ collectionId: "users" }]
  });
  await expectFirestoreQueryDenied(officeAdminSignIn.idToken, {
    from: [{ collectionId: "users" }]
  });
  await expectFirestoreQueryAllowed(officeAdminSignIn.idToken, {
    from: [{ collectionId: "users" }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          fieldFilter("groupId", "EQUAL", "demo-operator"),
          fieldFilter("officeId", "EQUAL", "demo-office-a"),
          fieldFilter("role", "IN", ["staff", "user"])
        ]
      }
    }
  });
  await expectFirestoreQueryAllowed(staffSignIn.idToken, {
    from: [{ collectionId: "monthlySchedules" }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          fieldFilter("groupId", "EQUAL", "demo-operator"),
          fieldFilter("officeId", "EQUAL", "demo-office-a"),
          fieldFilter("month", "EQUAL", "rules-test")
        ]
      }
    }
  });

  await expectFirestoreAllowed("", "GET", "system/maintenanceMode");
  await expectFirestoreDenied(globalSignIn.idToken, "DELETE", "system/maintenanceMode");
  await expectPermissionDenied(officeAdminSignIn.idToken, "setMaintenanceMode", {
    active: true,
    message: "実行されてはいけないメンテナンス",
    scheduledEndText: ""
  });
  await expectCallableSuccess(globalSignIn.idToken, "setMaintenanceMode", {
    active: true,
    message: "任意の案内文",
    scheduledEndText: ""
  });

  const maintenanceSnap = await db.collection("system").doc("maintenanceMode").get();
  assert.equal(maintenanceSnap.data()?.active, true);
  assert.equal(maintenanceSnap.data()?.message, "任意の案内文");

  await expectFirestoreAllowed(globalSignIn.idToken, "GET", `users/${userBProfile.id}`);
  await expectFirestoreAllowed(officeAdminSignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreAllowed(staffSignIn.idToken, "GET", `users/${staffProfile.id}`);
  await expectFirestoreAllowed(userASignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreDenied(staffSignIn.idToken, "GET", `users/${userAProfile.id}`);
  await expectFirestoreDenied(userASignIn.idToken, "GET", "offices/demo-office-a");
  await expectFirestoreDenied(
    userASignIn.idToken,
    "GET",
    `monthlySchedules/${userAProfile.id}_rules-test`
  );
  await expectFirestoreDenied(
    staffSignIn.idToken,
    "GET",
    "system/activeUsers_demo-office-a"
  );
  await expectPermissionDenied(
    staffSignIn.idToken,
    "getChatworkConsoleData",
    { includeConfig: false }
  );
  await expectCallableSuccess(
    officeAdminSignIn.idToken,
    "getChatworkConsoleData",
    { includeConfig: false }
  );
  await expectFirestoreDenied(globalSignIn.idToken, "PATCH", "system/maintenanceMode", {
    active: false
  });

  await expectCallableSuccess(globalSignIn.idToken, "setMaintenanceMode", {
    active: false,
    message: "",
    scheduledEndText: ""
  });
  const releasedMaintenanceSnap = await db.collection("system").doc("maintenanceMode").get();
  assert.equal(releasedMaintenanceSnap.data()?.active, false);
  assert.equal(releasedMaintenanceSnap.data()?.message, "");
  await expectFirestoreAllowed(
    userASignIn.idToken,
    "GET",
    `monthlySchedules/${userAProfile.id}_rules-test`
  );

  const finalAuditData = await expectCallableSuccess(
    globalSignIn.idToken,
    "getAdminAuditLogs",
    { limit: 100 }
  );
  const finalAuditActions = new Set((finalAuditData.logs || []).map((log) => log.action));
  assert(finalAuditActions.has("maintenance.started"));
  assert(finalAuditActions.has("maintenance.ended"));
  assert((finalAuditData.logs || []).every((log) => !Object.hasOwn(log, "email")));
  assert((finalAuditData.logs || []).every((log) => !Object.hasOwn(log, "password")));
  assert((finalAuditData.logs || []).every((log) => !Object.hasOwn(log, "message")));

  console.log(`Authentication確認済み: ${authUsers.users.length}件以上の架空アカウント`);
  console.log(`Firestore確認済み: ${firestoreUsers.size}件以上のusersと会社・事業所データ`);
  console.log("全体管理者確認済み: 会社作成 → 事業所作成 → 事業所管理者発行");
  console.log("運営会社名変更確認済み: IDと事業所・事業所管理者の所属を変えずに表示名だけを更新");
  console.log("事業所管理者確認済み: 会社管理・admin発行・旧事業所ID移行を拒否、支援員・利用者の所属先を本人の会社・事業所へ強制固定");
  console.log("事業所分離確認済み: 利用者一覧キャッシュを事業所別に更新");
  console.log("Firestoreルール確認済み: users・予定・週報・お知らせ・支援員専用予定・支援員名簿・教材・事業所別キャッシュで未認証／他事業所アクセスを拒否");
  console.log("事業所名確認済み: 同一事業所の表示名だけを読み取り、他事業所は拒否");
  console.log("メンテナンス確認済み: 全体管理者だけが切替、管理者は継続利用、支援員・利用者は業務データとCallableを拒否");
  console.log("Firestoreクエリ確認済み: 全件取得を拒否し、会社・事業所・役割で絞った一覧だけを許可");
  console.log("既存連携確認済み: 支援員認証付きCallableからFirestoreを読み取り");
  console.log("管理監査ログ確認済み: 全体管理者限定、追記型、管理操作とユーザー・課金安全変更を記録、機密値は返却しない");
  console.log("検証対象はすべてPC内の demo-enzine-schedule-local です。");
}

main()
  .catch((error) => {
    console.error(`ローカル検証に失敗しました: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app.delete();
  });
