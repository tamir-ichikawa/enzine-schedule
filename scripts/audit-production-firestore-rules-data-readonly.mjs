import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const DATABASE_ID = "(default)";
const LEGACY_OFFICE_ALIASES = new Map([["engine_chiba", "enzine_chiba"]]);
const COLLECTIONS = [
  { id: "organizations", master: "organization" },
  { id: "offices", master: "office" },
  { id: "monthlySchedules", requireMembership: true, requireUserId: true },
  { id: "weeklyReports", requireMembership: true, requireUserId: true },
  { id: "weeklyReportUserStatus", requireMembership: true, requireUserId: true },
  { id: "monthlyAnnouncements", requireMembership: true, requireUserId: false },
  { id: "staffMonthlyAnnouncements", requireMembership: true, requireUserId: false },
  { id: "schedules", legacy: true },
  { id: "announcements", legacy: true },
  { id: "system", system: true }
];

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

class SafeDataAuditError extends Error {
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
    throw new SafeDataAuditError("firebase-cli-authentication");
  }

  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeDataAuditError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeDataAuditError) {
      throw error;
    }
    throw new SafeDataAuditError("firebase-cli-access-token");
  }
}

async function readJson(accessToken, url, stage) {
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
    throw new SafeDataAuditError(stage, "network");
  }

  if (!response.ok) {
    throw new SafeDataAuditError(stage, String(response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new SafeDataAuditError(stage, "invalid-json");
  }
}

function stringField(document, fieldName) {
  const value = document?.fields?.[fieldName];
  return typeof value?.stringValue === "string" ? value.stringValue.trim() : "";
}

function documentId(document) {
  return decodeURIComponent(String(document?.name || "").split("/").pop() || "");
}

async function listDocuments(accessToken, collectionId) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collectionId}`
    );
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("showMissing", "false");
    for (const fieldPath of ["organizationId", "groupId", "officeId", "userId"]) {
      url.searchParams.append("mask.fieldPaths", fieldPath);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await readJson(accessToken, url, `firestore-${collectionId}`);
    documents.push(...(payload.documents || []));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);

  return documents;
}

function resolveRegisteredOfficeId(officeId, offices) {
  if (offices.has(officeId)) {
    return officeId;
  }

  const compatibleOfficeId = LEGACY_OFFICE_ALIASES.get(officeId);
  return compatibleOfficeId && offices.has(compatibleOfficeId) ? compatibleOfficeId : "";
}

function auditMembershipDocuments(spec, documents, organizations, offices) {
  const result = {
    collectionId: spec.id,
    documents: documents.length,
    missingMembership: 0,
    missingUserId: 0,
    unexpectedOrganization: 0,
    unexpectedOffice: 0,
    mismatchedOfficeOrganization: 0
  };

  for (const document of documents) {
    const organizationId = stringField(document, "organizationId") || stringField(document, "groupId");
    const officeId = stringField(document, "officeId");
    const userId = stringField(document, "userId");
    if (!organizationId || !officeId) {
      result.missingMembership += 1;
    }
    if (spec.requireUserId && !userId) {
      result.missingUserId += 1;
    }
    if (organizationId && !organizations.has(organizationId)) {
      result.unexpectedOrganization += 1;
    }
    const registeredOfficeId = resolveRegisteredOfficeId(officeId, offices);
    if (officeId && !registeredOfficeId) {
      result.unexpectedOffice += 1;
    }
    if (
      organizationId
      && registeredOfficeId
      && offices.get(registeredOfficeId)
      && offices.get(registeredOfficeId) !== organizationId
    ) {
      result.mismatchedOfficeOrganization += 1;
    }
  }

  return result;
}

function auditSystemDocuments(documents) {
  const officeScoped = documents.filter((document) => {
    const id = documentId(document);
    return id.startsWith("activeUsers_") || id.startsWith("workshopResources_");
  });
  return {
    documents: documents.length,
    officeScopedCaches: officeScoped.length,
    officeScopedCachesMissingMembership: officeScoped.filter((document) => {
      const organizationId = stringField(document, "organizationId") || stringField(document, "groupId");
      return !organizationId || !stringField(document, "officeId");
    }).length
  };
}

async function main() {
  const accessToken = await getCliAccessToken();
  const documentsByCollection = await Promise.all(
    COLLECTIONS.map(async (spec) => [spec, await listDocuments(accessToken, spec.id)])
  );
  const organizationDocuments = documentsByCollection
    .find(([spec]) => spec.master === "organization")?.[1] || [];
  const officeDocuments = documentsByCollection
    .find(([spec]) => spec.master === "office")?.[1] || [];
  const organizations = new Set(organizationDocuments.map(documentId).filter(Boolean));
  const offices = new Map(officeDocuments.map((document) => [
    documentId(document),
    stringField(document, "organizationId") || stringField(document, "groupId")
  ]).filter(([officeId]) => officeId));
  const membershipResults = documentsByCollection
    .filter(([spec]) => spec.requireMembership)
    .map(([spec, documents]) => auditMembershipDocuments(
      spec,
      documents,
      organizations,
      offices
    ));
  const legacyResults = documentsByCollection
    .filter(([spec]) => spec.legacy)
    .map(([spec, documents]) => auditMembershipDocuments(
      { ...spec, requireUserId: spec.id === "schedules" },
      documents,
      organizations,
      offices
    ));
  const systemDocuments = documentsByCollection.find(([spec]) => spec.system)?.[1] || [];
  const systemResult = auditSystemDocuments(systemDocuments);

  const blockingGaps = membershipResults.reduce(
    (sum, result) => sum
      + result.missingMembership
      + result.missingUserId
      + result.unexpectedOrganization
      + result.unexpectedOffice
      + result.mismatchedOfficeOrganization,
    0
  );

  console.log(`対象プロジェクト: ${PROJECT_ID}（Firestore GETのみ）`);
  console.log(`所属マスター: 運営会社${organizations.size}件 / 事業所${offices.size}件`);
  console.log("ルール適用対象コレクションの必須フィールド件数監査");
  for (const result of membershipResults) {
    console.log(
      `- ${result.collectionId}: 全${result.documents} / 所属不足${result.missingMembership}`
      + ` / userId不足${result.missingUserId} / 想定外会社${result.unexpectedOrganization}`
      + ` / 想定外事業所${result.unexpectedOffice}`
      + ` / 会社・事業所不一致${result.mismatchedOfficeOrganization}`
    );
  }
  console.log("旧コレクション（現在の画面コードから参照なし）");
  for (const result of legacyResults) {
    console.log(
      `- ${result.collectionId}: 全${result.documents} / 所属不足${result.missingMembership}`
      + ` / userId不足${result.missingUserId}`
    );
  }
  console.log(
    `system: 全${systemResult.documents} / 事業所別キャッシュ${systemResult.officeScopedCaches}`
    + ` / 所属不足${systemResult.officeScopedCachesMissingMembership}`
  );
  console.log("ドキュメントID・本文・実在名・UID・認証情報は表示していません。");

  if (blockingGaps > 0) {
    throw new SafeDataAuditError("firestore-rules-data-prerequisites", String(blockingGaps));
  }

  console.log("Firestoreルール候補の既存データ前提を満たしています。");
}

main().catch((error) => {
  const stage = error instanceof SafeDataAuditError ? error.stage : "unexpected-error";
  const status = error instanceof SafeDataAuditError && error.status ? ` (${error.status})` : "";
  console.error(`Firestoreルール用の本番データ監査に失敗しました: ${stage}${status}`);
  process.exitCode = 1;
});
