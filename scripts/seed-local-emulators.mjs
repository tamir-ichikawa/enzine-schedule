import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "demo-enzine-schedule-local";
const TEST_PASSWORD = "LocalTest!2026";
const ORGANIZATION_ID = "demo-operator";

if (!PROJECT_ID.startsWith("demo-")) {
  throw new Error("安全のため demo- で始まるプロジェクトID以外には投入できません。");
}

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(projectRoot, "functions", "node_modules", "firebase-admin"));
const app = admin.initializeApp({ projectId: PROJECT_ID });
const auth = admin.auth(app);
const db = admin.firestore(app);

const accounts = [
  {
    key: "global-admin",
    email: "global.admin@example.test",
    name: "ローカル全体管理者",
    nameKana: "ろーかるぜんたいかんりしゃ",
    role: "admin",
    accessScope: "global",
    officeId: "demo-office-a"
  },
  {
    key: "office-admin",
    email: "office.admin@example.test",
    name: "ローカル事業所管理者",
    nameKana: "ろーかるじぎょうしょかんりしゃ",
    role: "admin",
    accessScope: "office",
    officeId: "demo-office-a"
  },
  {
    key: "staff",
    email: "staff@example.test",
    name: "ローカル支援員",
    nameKana: "ろーかるしえんいん",
    role: "staff",
    accessScope: "office",
    officeId: "demo-office-a"
  },
  {
    key: "user-a",
    email: "user.a@example.test",
    name: "ローカル利用者A",
    nameKana: "ろーかるりようしゃえー",
    role: "user",
    accessScope: "self",
    officeId: "demo-office-a"
  },
  {
    key: "user-b",
    email: "user.b@example.test",
    name: "ローカル利用者B",
    nameKana: "ろーかるりようしゃびー",
    role: "user",
    accessScope: "self",
    officeId: "demo-office-b"
  }
];

async function ensureAuthAccount(account) {
  try {
    return await auth.getUserByEmail(account.email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }
  }

  return auth.createUser({
    email: account.email,
    password: TEST_PASSWORD,
    displayName: account.name,
    disabled: false,
    emailVerified: false
  });
}

async function main() {
  const now = new Date().toISOString();
  const seededAccounts = [];

  for (const account of accounts) {
    const authUser = await ensureAuthAccount(account);
    const uid = authUser.uid;
    const userProfile = {
      uid,
      name: account.name,
      nameKana: account.nameKana,
      sortName: account.nameKana,
      email: account.email,
      role: account.role,
      active: true,
      organizationId: ORGANIZATION_ID,
      officeId: account.officeId,
      groupId: ORGANIZATION_ID,
      accessScope: account.accessScope,
      weeklyReportStartWeek: "2026-06-15",
      localFixture: true,
      createdAt: now,
      updatedAt: now
    };

    await db.collection("users").doc(uid).set(userProfile);
    seededAccounts.push({ ...account, uid, userProfile });
  }

  await db.collection("organizations").doc(ORGANIZATION_ID).set({
    name: "ローカル検証運営会社",
    active: true,
    groupId: ORGANIZATION_ID,
    schemaVersion: 1,
    localFixture: true,
    createdAt: now,
    updatedAt: now
  });

  await db.collection("system").doc("maintenanceMode").set({
    schemaVersion: 1,
    active: false,
    message: "",
    scheduledEndText: "",
    localFixture: true,
    updatedAt: now
  });

  await db.collection("offices").doc("demo-office-a").set({
    officeId: "demo-office-a",
    organizationId: ORGANIZATION_ID,
    groupId: ORGANIZATION_ID,
    name: "ローカル事業所A",
    active: true,
    localFixture: true,
    createdAt: now,
    updatedAt: now
  });

  await db.collection("offices").doc("demo-office-b").set({
    officeId: "demo-office-b",
    organizationId: ORGANIZATION_ID,
    groupId: ORGANIZATION_ID,
    name: "ローカル事業所B",
    active: true,
    localFixture: true,
    createdAt: now,
    updatedAt: now
  });

  const usersByOffice = Object.fromEntries(
    ["demo-office-a", "demo-office-b"].map((officeId) => [
      officeId,
      {
        users: seededAccounts
          .filter((account) => account.role === "user" && account.officeId === officeId)
          .map((account) => ({
            id: account.uid,
            uid: account.uid,
            name: account.name,
            nameKana: account.nameKana,
            sortName: account.nameKana,
            email: account.email,
            role: account.role,
            active: true,
            organizationId: ORGANIZATION_ID,
            officeId,
            groupId: ORGANIZATION_ID
          }))
      }
    ])
  );

  await db.collection("system").doc("activeUsers").set({
    schemaVersion: 2,
    organizationId: ORGANIZATION_ID,
    offices: usersByOffice,
    localFixture: true,
    updatedAt: now
  });

  for (const [officeId, officeBucket] of Object.entries(usersByOffice)) {
    await db.collection("system").doc(`activeUsers_${officeId}`).set({
      schemaVersion: 1,
      organizationId: ORGANIZATION_ID,
      groupId: ORGANIZATION_ID,
      officeId,
      users: officeBucket.users,
      localFixture: true,
      updatedAt: now
    });
  }

  await db.collection("system").doc("localMultiOfficeFixture").set({
    organizationId: ORGANIZATION_ID,
    officeIds: ["demo-office-a", "demo-office-b"],
    accountKeys: accounts.map((account) => account.key),
    purpose: "future-multi-office-development",
    localFixture: true,
    updatedAt: now
  });

  console.log(`ローカル用データを投入しました（Auth ${seededAccounts.length}件 / 事業所 2件）。`);
  console.log("ログイン情報は LOCAL_FIREBASE_EMULATORS.md を確認してください。");
}

main()
  .catch((error) => {
    console.error(`ローカルシードに失敗しました: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app.delete();
  });
