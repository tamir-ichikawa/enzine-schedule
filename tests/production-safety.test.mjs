import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production candidate deploys only the generated allowlist directory", async () => {
  const [candidateText, packageText, prepareScript] = await Promise.all([
    readSource("../firebase.production.candidate.json"),
    readSource("../package.json"),
    readSource("../scripts/prepare-production-hosting.mjs")
  ]);
  const candidate = JSON.parse(candidateText);
  const packageData = JSON.parse(packageText);

  assert.equal(candidate.hosting.public, ".firebase-deploy/public");
  assert.equal(candidate.functions[0].source, ".firebase-deploy/functions");
  assert.equal(candidate.firestore.rules, ".firebase-deploy/firestore.production.candidate.rules");
  assert.match(prepareScript, /const publicFiles = \[/);
  assert.match(prepareScript, /"ui-mode-bootstrap\.js"/);
  assert.doesNotMatch(prepareScript, /copyPublicFile\("scripts|copyPublicFile\("tests/);
  assert.ok(!Object.keys(packageData.scripts).some((name) => name.includes("deploy")));
  assert.ok(!Object.values(packageData.scripts).some((command) => /firebase\s+deploy/.test(command)));
});

test("production Functions candidate is built from a four-file allowlist", async () => {
  const [prepareScript, auditScript] = await Promise.all([
    readSource("../scripts/prepare-production-functions.mjs"),
    readSource("../scripts/audit-production-functions-candidate.mjs")
  ]);

  assert.match(prepareScript, /const allowedFiles = \["chatwork\.js", "index\.js", "package-lock\.json", "package\.json"\]/);
  assert.match(prepareScript, /for \(const file of allowedFiles\)/);
  assert.match(prepareScript, /await rm\(candidateRoot/);
  assert.match(auditScript, /const EXPECTED_FILES = \["chatwork\.js", "index\.js", "package-lock\.json", "package\.json"\]/);
  assert.match(auditScript, /"getCurrentOfficeBrand"/);
  assert.match(auditScript, /"getAdminAuditLogs"/);
  assert.match(auditScript, /"auditManagedUserWrite"/);
  assert.match(auditScript, /"auditBillingSafetyWrite"/);
  assert.match(auditScript, /secret・env・ローカル設定: 候補に含まれず、node_modules: upload ignore対象/);
});

test("production Functions deploy and rollback configs are isolated from Hosting and rules", async () => {
  const [candidateText, rollbackText, rollbackScript] = await Promise.all([
    readSource("../firebase.production.functions.candidate.json"),
    readSource("../firebase.production.functions.rollback.json"),
    readSource("../scripts/prepare-production-functions-rollback.mjs")
  ]);
  const candidate = JSON.parse(candidateText);
  const rollback = JSON.parse(rollbackText);

  assert.deepEqual(Object.keys(candidate), ["functions"]);
  assert.deepEqual(Object.keys(rollback), ["functions"]);
  assert.equal(candidate.functions[0].source, ".firebase-deploy/functions");
  assert.equal(rollback.functions[0].source, ".firebase-deploy/functions-rollback");
  assert.ok(candidate.functions[0].ignore.includes("node_modules"));
  assert.ok(candidate.functions[0].ignore.includes(".secret*"));
  assert.ok(rollback.functions[0].ignore.includes("node_modules"));
  assert.ok(rollback.functions[0].ignore.includes(".secret*"));
  assert.match(rollbackScript, /const allowedFiles = \["chatwork\.js", "index\.js", "package-lock\.json", "package\.json"\]/);
  assert.match(rollbackScript, /\["show", `\$\{commit\}:functions\/\$\{file\}`\]/);
  assert.doesNotMatch(rollbackScript, /firebase\s+deploy|"deploy"/);
});

test("production Firestore Rules candidate and rollback configs are Rules-only", async () => {
  const [candidateText, rollbackText, candidateAudit] = await Promise.all([
    readSource("../firebase.production.firestore.rules.candidate.json"),
    readSource("../firebase.production.firestore.rules.rollback.json"),
    readSource("../scripts/audit-production-rules.mjs")
  ]);
  const candidate = JSON.parse(candidateText);
  const rollback = JSON.parse(rollbackText);

  assert.deepEqual(Object.keys(candidate), ["firestore"]);
  assert.deepEqual(Object.keys(rollback), ["firestore"]);
  assert.equal(candidate.firestore.rules, ".firebase-deploy/firestore.production.candidate.rules");
  assert.equal(rollback.firestore.rules, ".firebase-deploy/firestore.production.rollback.rules");
  assert.match(candidateAudit, /firebase\.production\.firestore\.rules\.candidate\.json/);
  assert.match(candidateAudit, /Object\.keys\(candidateConfig\)/);
});

test("Firestore Rules keep billing safety global-only and maintenance settings callable-only", async () => {
  const [rules, verifier] = await Promise.all([
    readSource("../firestore.emulator.rules"),
    readSource("../scripts/verify-local-emulators.mjs")
  ]);

  assert.doesNotMatch(rules, /systemId == 'billingSafety'/);
  assert.match(rules, /allow delete: if systemId != 'maintenanceMode' && isGlobalAdmin\(\);/);
  assert.match(verifier, /expectFirestoreAllowed\(globalSignIn\.idToken, "GET", "system\/billingSafety"\)/);
  assert.match(verifier, /expectFirestoreDenied\(officeAdminSignIn\.idToken, "GET", "system\/billingSafety"\)/);
  assert.match(verifier, /expectFirestoreDenied\(staffSignIn\.idToken, "GET", "system\/billingSafety"\)/);
  assert.match(verifier, /expectFirestoreDenied\(userASignIn\.idToken, "GET", "system\/billingSafety"\)/);
  assert.match(verifier, /expectFirestoreDenied\(globalSignIn\.idToken, "DELETE", "system\/maintenanceMode"\)/);
});

test("production Firestore Rules snapshot uses GET only and suppresses sensitive output", async () => {
  const [fetchScript, auditScript, packageText] = await Promise.all([
    readSource("../scripts/fetch-production-firestore-rules-readonly.mjs"),
    readSource("../scripts/audit-production-firestore-rules-preflight.mjs"),
    readSource("../package.json")
  ]);
  const packageData = JSON.parse(packageText);

  assert.match(fetchScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(fetchScript, /releases\/cloud\.firestore/);
  assert.match(fetchScript, /firebaserules\.googleapis\.com\/v1/);
  assert.match(fetchScript, /method: "GET"/);
  assert.doesNotMatch(fetchScript, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(fetchScript, /firebase\s+deploy|createRuleset|updateRelease|createRelease/);
  assert.match(fetchScript, /firestore\.production\.rollback\.rules/);
  assert.match(fetchScript, /process\.argv\.includes\("--verify-only"\)/);
  assert.match(fetchScript, /if \(!VERIFY_ONLY\) \{/);
  assert.match(fetchScript, /current-firestore-rules-sha256-mismatch/);
  assert.match(fetchScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(fetchScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.doesNotMatch(fetchScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|authorization|content)/i);
  assert.match(auditScript, /remoteMethods/);
  assert.match(auditScript, /ルール本文は表示していません/);
  assert.equal(
    packageData.scripts["production:rules:fetch-current"],
    "node --use-system-ca scripts/fetch-production-firestore-rules-readonly.mjs"
  );
  assert.equal(
    packageData.scripts["production:rules:verify-current"],
    "node --use-system-ca scripts/fetch-production-firestore-rules-readonly.mjs --verify-only"
  );
  assert.ok(!Object.values(packageData.scripts).some((command) => /firestore:rules.*deploy|firebase\s+deploy/.test(command)));
});

test("production Firestore Rules data preflight is GET-only and reports counts only", async () => {
  const [auditScript, packageText] = await Promise.all([
    readSource("../scripts/audit-production-firestore-rules-data-readonly.mjs"),
    readSource("../package.json")
  ]);
  const packageData = JSON.parse(packageText);

  assert.match(auditScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(auditScript, /"monthlySchedules"/);
  assert.match(auditScript, /"weeklyReports"/);
  assert.match(auditScript, /"weeklyReportUserStatus"/);
  assert.match(auditScript, /"monthlyAnnouncements"/);
  assert.match(auditScript, /method: "GET"/);
  assert.doesNotMatch(auditScript, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(auditScript, /:commit|:batchWrite|documents:runQuery|firebase\s+deploy/);
  assert.match(auditScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(auditScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.doesNotMatch(auditScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|authorization|documentId|userId)/i);
  assert.equal(
    packageData.scripts["production:rules:data:readonly"],
    "node --use-system-ca scripts/audit-production-firestore-rules-data-readonly.mjs"
  );
});

test("current application no longer reads or writes legacy schedules and announcements collections", async () => {
  const sources = await Promise.all([
    "../admin.js",
    "../schedule.js",
    "../staff.js",
    "../weekly-report.js",
    "../workshops.js",
    "../ui-common.js",
    "../functions/index.js",
    "../functions/chatwork.js"
  ].map(readSource));

  for (const source of sources) {
    assert.doesNotMatch(source, /(?:collection|doc)\(db,\s*["'](?:schedules|announcements)["']/);
    assert.doesNotMatch(source, /db\.collection\(["'](?:schedules|announcements)["']\)/);
  }
});

test("production Firestore Rules smoke test is unauthenticated GET-only", async () => {
  const [smokeScript, packageText] = await Promise.all([
    readSource("../scripts/smoke-production-firestore-rules-unauthenticated.mjs"),
    readSource("../package.json")
  ]);
  const packageData = JSON.parse(packageText);

  assert.match(smokeScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(smokeScript, /method: "GET"/);
  assert.doesNotMatch(smokeScript, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(smokeScript, /authorization|bearer|password|refresh_token|idToken/i);
  assert.match(smokeScript, /maintenanceMode-public-get/);
  assert.match(smokeScript, /users-unauthenticated-deny/);
  assert.match(smokeScript, /legacy-schedules-unauthenticated-deny/);
  assert.match(smokeScript, /legacy-announcements-unauthenticated-deny/);
  assert.doesNotMatch(smokeScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:apiKey|apiKeyMatch|response)/i);
  assert.equal(
    packageData.scripts["production:rules:smoke:unauthenticated"],
    "node --use-system-ca scripts/smoke-production-firestore-rules-unauthenticated.mjs"
  );
});

test("production candidate sets private-app response headers", async () => {
  const candidate = JSON.parse(await readSource("../firebase.production.candidate.json"));
  const headers = candidate.hosting.headers.flatMap((entry) => entry.headers || []);
  const headerMap = new Map(headers.map((header) => [header.key.toLowerCase(), header.value]));
  const rootHeaders = candidate.hosting.headers.find((entry) => entry.source === "/")?.headers || [];
  const rootHeaderMap = new Map(rootHeaders.map((header) => [header.key.toLowerCase(), header.value]));

  assert.equal(headerMap.get("cache-control"), "no-store, max-age=0");
  assert.equal(rootHeaderMap.get("cache-control"), "no-store, max-age=0");
  assert.equal(headerMap.get("x-content-type-options"), "nosniff");
  assert.equal(headerMap.get("x-frame-options"), "DENY");
  assert.match(headerMap.get("x-robots-tag"), /noindex/);
});

test("production Hosting preview config is pinned and Hosting-only", async () => {
  const [previewText, liveText, candidateText] = await Promise.all([
    readSource("../firebase.production.hosting.preview.json"),
    readSource("../firebase.production.hosting.live.json"),
    readSource("../firebase.production.candidate.json")
  ]);
  const preview = JSON.parse(previewText);
  const live = JSON.parse(liveText);
  const candidate = JSON.parse(candidateText);

  assert.deepEqual(Object.keys(preview), ["hosting"]);
  assert.equal(preview.hosting.site, "enzine-schedule");
  assert.equal(preview.hosting.public, ".firebase-deploy/public");
  const comparable = { ...preview.hosting };
  delete comparable.site;
  assert.deepEqual(comparable, candidate.hosting);
  assert.deepEqual(live, preview);
});

test("production Hosting audit lists metadata only and cannot mutate Hosting", async () => {
  const [auditScript, packageText] = await Promise.all([
    readSource("../scripts/audit-production-hosting-readonly.mjs"),
    readSource("../package.json")
  ]);
  const packageData = JSON.parse(packageText);

  assert.match(auditScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(auditScript, /const SITE_ID = "enzine-schedule"/);
  assert.match(auditScript, /"hosting:sites:list"/);
  assert.match(auditScript, /"hosting:channel:list"/);
  assert.doesNotMatch(auditScript, /hosting:channel:(?:deploy|create|delete)|firebase\s+deploy|"deploy"/);
  assert.doesNotMatch(auditScript, /console\.(?:log|error)\([^\n]*(?:\.url|defaultUrl|appId|accessToken|refresh_token)/i);
  assert.match(auditScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(auditScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.ok(!Object.values(packageData.scripts).some((command) => /hosting:channel:deploy|firebase\s+deploy/.test(command)));
});

test("production readiness audit is hardcoded read-only and never prints identity fields", async () => {
  const auditScript = await readSource("../scripts/audit-production-readiness-readonly.mjs");

  assert.match(auditScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(auditScript, /method: "GET"/);
  assert.doesNotMatch(auditScript, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(auditScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|email|uid)/i);
  assert.doesNotMatch(auditScript, /console\.(?:log|error)\((?:account|authUser|userDoc|user)\b/i);
  assert.match(auditScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(auditScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
});

test("production backup inspection is read-only and keeps TLS verification enabled", async () => {
  const inspectScript = await readSource("../scripts/inspect-production-backup-readiness.mjs");

  assert.match(inspectScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(inspectScript, /method: "GET"/);
  assert.doesNotMatch(inspectScript, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.match(inspectScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(inspectScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
});

test("production backup is fixed to the approved project and uses guarded destinations", async () => {
  const [backupScript, gitignore] = await Promise.all([
    readSource("../scripts/create-production-backup.mjs"),
    readSource("../.gitignore")
  ]);

  assert.match(backupScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(backupScript, /const PROJECT_NUMBER = "486612480549"/);
  assert.match(backupScript, /const LOCATION = "ASIA-NORTHEAST1"/);
  assert.match(backupScript, /const BACKUP_BUCKET = "enzine-schedule-486612480549-backups"/);
  assert.match(backupScript, /--confirm-project=\$\{PROJECT_ID\}/);
  assert.match(backupScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(backupScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.match(backupScript, /publicAccessPrevention: "enforced"/);
  assert.match(backupScript, /uniformBucketLevelAccess: \{ enabled: true \}/);
  assert.match(backupScript, /versioning: \{ enabled: true \}/);
  assert.match(backupScript, /:exportDocuments/);
  assert.match(backupScript, /"auth:export"/);
  assert.doesNotMatch(backupScript, /method:\s*"(?:PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(backupScript, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*"0"/);
  assert.doesNotMatch(backupScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|signerKey|email|uid)/i);
  assert.match(gitignore, /^\.production-backups\/$/m);
});

test("production backup verification is GET-only and suppresses secret values", async () => {
  const verifyScript = await readSource("../scripts/verify-production-backup.mjs");

  assert.match(verifyScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(verifyScript, /const BACKUP_BUCKET = "enzine-schedule-486612480549-backups"/);
  assert.match(verifyScript, /method: "GET"/);
  assert.doesNotMatch(verifyScript, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.match(verifyScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(verifyScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.doesNotMatch(verifyScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|signerKey|email|uid)/i);
});

test("production data supplement plan is GET-only and baseline locked", async () => {
  const planScript = await readSource("../scripts/plan-production-data-supplement-readonly.mjs");

  assert.match(planScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(planScript, /const ORGANIZATION_ID = "enzine"/);
  assert.match(planScript, /const OFFICE_ID = "enzine_chiba"/);
  assert.match(planScript, /const EXPECTED_AUTH_USERS = 28/);
  assert.match(planScript, /const EXPECTED_FIRESTORE_USERS = 28/);
  assert.match(planScript, /method: "GET"/);
  assert.doesNotMatch(planScript, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(planScript, /:commit|:batchWrite|documents:runQuery/);
  assert.match(planScript, /updateTimeGuards/);
  assert.match(planScript, /exists=false/);
  assert.match(planScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(planScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
  assert.doesNotMatch(planScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|email|uid|document\.id|authUser\.id)/i);
});

test("production data supplement apply is one guarded atomic commit and is not an npm shortcut", async () => {
  const [applyScript, packageText] = await Promise.all([
    readSource("../scripts/apply-production-data-supplement.mjs"),
    readSource("../package.json")
  ]);
  const packageData = JSON.parse(packageText);

  assert.match(applyScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(applyScript, /const ORGANIZATION_ID = "enzine"/);
  assert.match(applyScript, /const OFFICE_ID = "enzine_chiba"/);
  assert.match(applyScript, /const EXPECTED_WRITES = 31/);
  assert.match(applyScript, /const VERIFIED_BACKUP_ID = "2026-08-02T08-01-46-184Z"/);
  assert.match(applyScript, /"--apply"/);
  assert.match(applyScript, /--confirm-project=\$\{PROJECT_ID\}/);
  assert.match(applyScript, /--confirm-writes=\$\{EXPECTED_WRITES\}/);
  assert.match(applyScript, /--confirm-backup=\$\{VERIFIED_BACKUP_ID\}/);
  assert.match(applyScript, /documents:commit/);
  assert.match(applyScript, /method: "POST"/);
  assert.equal((applyScript.match(/method: "POST"/g) || []).length, 1);
  assert.match(applyScript, /updateMask: \{ fieldPaths \}/);
  assert.match(applyScript, /currentDocument: \{ updateTime: document\.updateTime \}/);
  assert.match(applyScript, /currentDocument: \{ exists: false \}/);
  assert.doesNotMatch(applyScript, /\bdelete\s*:/);
  assert.doesNotMatch(applyScript, /accounts:(?:update|delete|signUp)/);
  assert.doesNotMatch(applyScript, /firebase\s+deploy/);
  assert.match(applyScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.doesNotMatch(applyScript, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*"0"/);
  assert.doesNotMatch(applyScript, /console\.(?:log|error)\([^\n]*\$\{[^}]*(?:accessToken|refresh_token|email|uid|document\.id|authUser\.id)/i);
  assert.ok(!Object.values(packageData.scripts).some((command) => command.includes("apply-production-data-supplement")));
});

test("production functions audit lists metadata only and cannot deploy", async () => {
  const auditScript = await readSource("../scripts/audit-production-functions-readonly.mjs");

  assert.match(auditScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(auditScript, /"functions:list"/);
  assert.match(auditScript, /"--project", PROJECT_ID/);
  assert.doesNotMatch(auditScript, /firebase\s+deploy|"deploy"|functions:delete/);
  assert.match(auditScript, /URL・サービスアカウント・環境変数・秘密情報は表示していません/);
  assert.doesNotMatch(auditScript, /console\.(?:log|error)\((?:entry|rawFunctions|payload|combinedOutput)/);
  assert.match(auditScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
  assert.match(auditScript, /process\.execArgv\.includes\("--use-system-ca"\)/);
});

test("production Functions smoke test sends no credentials or mutation data", async () => {
  const smokeScript = await readSource("../scripts/smoke-production-functions-unauthenticated.mjs");

  assert.match(smokeScript, /const PROJECT_ID = "enzine-schedule"/);
  assert.match(smokeScript, /const REGION = "asia-northeast1"/);
  assert.match(smokeScript, /"getAdminAuditLogs"/);
  assert.match(smokeScript, /method: "POST"/);
  assert.match(smokeScript, /body: JSON\.stringify\(\{ data: \{\} \}\)/);
  assert.doesNotMatch(smokeScript, /authorization|bearer|email|password|uid/i);
  assert.match(smokeScript, /response\.status !== 401/);
  assert.match(smokeScript, /UNAUTHENTICATED/);
  assert.doesNotMatch(smokeScript, /console\.(?:log|error)\((?:payload|response)/);
  assert.match(smokeScript, /NODE_TLS_REJECT_UNAUTHORIZED === "0"/);
});

test("office brand fallback returns only the authenticated caller office", async () => {
  const [functionsSource, uiSource, adminSource] = await Promise.all([
    readSource("../functions/index.js"),
    readSource("../ui-common.js"),
    readSource("../admin.js")
  ]);

  assert.match(functionsSource, /exports\.getCurrentOfficeBrand = onCall/);
  assert.match(functionsSource, /const caller = await assertCallerHasActiveProfile\(request\)/);
  assert.match(functionsSource, /officeOrganizationId !== caller\.organizationId/);
  assert.match(functionsSource, /!officeIdsMatch\(officeData\.officeId \|\| officeSnap\.id, caller\.officeId\)/);
  assert.match(functionsSource, /name: cleanText\(officeData\.name, "", 100\)/);
  assert.doesNotMatch(functionsSource, /exports\.getCurrentOfficeBrand[\s\S]*?\.collection\("users"\)\.get\(\)/);
  assert.match(uiSource, /httpsCallable\(functions, "getCurrentOfficeBrand"\)/);
  assert.match(uiSource, /const result = await getCurrentOfficeBrand\(\{\}\)/);
  assert.match(adminSource, /userData\.accessScope === "global"[\s\S]*?\? `\$\{adminScopeLabel\}｜\$\{userData\.name \|\| user\.email\}`[\s\S]*?: adminScopeLabel/);
});

test("admin audit logs are append-only, non-sensitive, and global-admin readable only", async () => {
  const [functionsSource, adminSource, adminHtml, styleSource, rulesSource, verifier] = await Promise.all([
    readSource("../functions/index.js"),
    readSource("../admin.js"),
    readSource("../admin.html"),
    readSource("../style.css"),
    readSource("../firestore.emulator.rules"),
    readSource("../scripts/verify-local-emulators.mjs")
  ]);

  assert.match(functionsSource, /const ADMIN_AUDIT_LOG_COLLECTION = "adminAuditLogs"/);
  assert.match(functionsSource, /batch\.create\(auditRef, buildAdminAuditLog\(details\)\)/);
  assert.match(functionsSource, /auditRef\.create\(buildAdminAuditLog\(details\)\)/);
  assert.match(functionsSource, /exports\.getAdminAuditLogs = onCall/);
  assert.match(functionsSource, /exports\.getAdminAuditLogs[\s\S]*?await assertCallerIsGlobalAdmin\(request\)/);
  assert.match(functionsSource, /\.orderBy\("createdAt", "desc"\)[\s\S]*?\.limit\(limit\)/);
  assert.match(functionsSource, /exports\.auditManagedUserWrite = onDocumentWrittenWithAuthContext/);
  assert.match(functionsSource, /document: "users\/\{userId\}"/);
  assert.match(functionsSource, /document: "users\/\{userId\}"[\s\S]*?retry: false/);
  assert.match(functionsSource, /exports\.auditBillingSafetyWrite = onDocumentWrittenWithAuthContext/);
  assert.match(functionsSource, /document: "system\/billingSafety"/);
  assert.match(functionsSource, /document: "system\/billingSafety"[\s\S]*?retry: false/);
  assert.doesNotMatch(functionsSource, /actorEmail|targetEmail|targetPassword|maintenanceMessage/);
  assert.match(adminSource, /httpsCallable\(functions, "getAdminAuditLogs"\)/);
  assert.match(adminSource, /function isGlobalAdminSection\(section\)[\s\S]*?"maintenance", "billing", "audit"/);
  assert.match(adminSource, /globalAdminOnlyNavigationItems\.forEach/);
  assert.match(adminHtml, /id="adminAuditLogSection"[\s\S]*?hidden/);
  assert.match(adminHtml, /style\.css\?v=124/);
  assert.match(adminHtml, /氏名・メール・パスワード・入力文章は保存しません/);
  assert.match(styleSource, /\.admin-audit-log-box\.hidden,[\s\S]*?display: none !important;/);
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/s);
  assert.match(verifier, /getAdminAuditLogs/);
  assert.match(verifier, /adminAuditLogs/);
});

test("office admins rebuild only their office-scoped active-user cache", async () => {
  const [adminSource, verifier] = await Promise.all([
    readSource("../admin.js"),
    readSource("../scripts/verify-local-emulators.mjs")
  ]);
  const functionBody = adminSource.match(
    /async function rebuildActiveUsersFromUsersCollection[\s\S]*?(?=\nasync function saveAdminUserWithAuth)/
  )?.[0] || "";

  assert.match(functionBody, /await setDoc\(doc\(db, "system", getActiveUsersDocId\(officeId\)\)/);
  assert.match(functionBody, /if \(isGlobalAdmin\) \{[\s\S]*?const cacheSnap = await getDoc\(cacheRef\)/);
  assert.doesNotMatch(functionBody, /const cacheSnap = await getDoc\(cacheRef\)[\s\S]*?if \(isGlobalAdmin\)/);
  assert.match(verifier, /expectFirestoreDenied\(officeAdminSignIn\.idToken, "GET", "system\/activeUsers"\)/);
  assert.match(verifier, /expectFirestoreAllowed\([\s\S]*?officeAdminSignIn\.idToken,[\s\S]*?"PATCH",[\s\S]*?"system\/activeUsers_demo-office-a"/);
});

test("shared UI cache revisions reach every page that imports the common module", async () => {
  const sharedImporters = [
    "../admin.js",
    "../auth.js",
    "../chatwork.js",
    "../maintenance-admin-auth.js",
    "../maintenance.js",
    "../schedule.js",
    "../staff.js",
    "../weekly-report.js",
    "../workshops.js"
  ];
  const importerSources = await Promise.all(sharedImporters.map(readSource));
  for (const source of importerSources) {
    assert.match(source, /\.\/ui-common\.js\?v=89/);
    assert.doesNotMatch(source, /\.\/ui-common\.js\?v=88/);
  }

  const adminHtml = await readSource("../admin.html");
  assert.match(adminHtml, /admin\.js\?v=109/);
  assert.match(adminHtml, /style\.css\?v=124/);
});

test("admin user management keeps the list concise and applies membership filters to totals", async () => {
  const [adminSource, adminHtml, loginHtml, authSource, styleSource] = await Promise.all([
    readSource("../admin.js"),
    readSource("../admin.html"),
    readSource("../index.html"),
    readSource("../auth.js"),
    readSource("../style.css")
  ]);
  const cardBody = adminSource.match(
    /function renderAdminUserCard\(user\) \{[\s\S]*?(?=\nfunction renderAdminUserList)/
  )?.[0] || "";
  const membershipFilterBody = adminSource.match(
    /function getMembershipFilteredAdminUsers\(\) \{[\s\S]*?(?=\nfunction getFilteredAdminUsers)/
  )?.[0] || "";

  assert.match(cardBody, /title\.textContent = user\.name \|\| "名前未設定"/);
  assert.match(cardBody, /buildRoleBadge\(user\)/);
  assert.match(cardBody, /buildActiveBadge\(user\)/);
  assert.match(cardBody, /header\.appendChild\(badges\);\s*header\.appendChild\(actions\);\s*card\.appendChild\(header\);\s*card\.appendChild\(titleBox\);/);
  assert.doesNotMatch(cardBody, /user\.email|user\.id|nameKana|admin-user-card-meta|admin-user-card-detail|admin-user-kana-row/);
  assert.match(adminSource, /new ResizeObserver\(syncAdminUserPanelHeight\)/);
  assert.match(adminSource, /--admin-user-form-height/);
  assert.match(styleSource, /\.admin-role-filter-toggle \{[\s\S]*?repeat\(auto-fit, minmax\(72px, 1fr\)\)/);
  assert.match(styleSource, /@media \(min-width: 901px\) \{[\s\S]*?\.admin-user-list-box \{[\s\S]*?height: var\(--admin-user-form-height, auto\);[\s\S]*?\.admin-user-list-box \.admin-user-list \{[\s\S]*?overflow-y: auto;/);

  assert.match(membershipFilterBody, /adminUserOrganizationFilter/);
  assert.match(membershipFilterBody, /adminUserOfficeFilter/);
  assert.match(adminSource, /function renderAdminUserOverview\(\) \{\s*renderAdminUserSummary\(getMembershipFilteredAdminUsers\(\)\);\s*renderFilteredAdminUserList\(\);/);
  assert.match(adminSource, /adminUserOrganizationFilter\.addEventListener\("change", \(\) => \{[\s\S]*?renderAdminUserOverview\(\)/);
  assert.match(adminSource, /adminUserOfficeFilter\.addEventListener\("change", \(\) => \{[\s\S]*?renderAdminUserOverview\(\)/);
  assert.ok(adminHtml.indexOf('id="adminUserMembershipFilters"') < adminHtml.indexOf('id="adminUserSummary"'));

  assert.doesNotMatch(loginHtml, /月間予定・週一報告管理|登録済みアカウントで入ります/);
  assert.doesNotMatch(authSource, /登録済みアカウントで入ります/);
  assert.match(loginHtml, /auth\.js\?v=79/);
  assert.match(adminHtml, /id="adminUserFormTitle">ユーザー追加/);
  assert.match(adminHtml, /data-admin-create-mode="uid">既存アカウント<\/button>/);
  assert.match(adminHtml, /id="adminUserSummarySection"[\s\S]*?<h2>ユーザー数<\/h2>/);
  assert.doesNotMatch(adminHtml, /id="adminUserFormGuide"|Authユーザー|既存UID|互換groupId|利用者一覧キャッシュ/);
});

test("admin management uses scoped section and registration submenus", async () => {
  const [adminSource, adminHtml, styleSource] = await Promise.all([
    readSource("../admin.js"),
    readSource("../admin.html"),
    readSource("../style.css")
  ]);

  assert.match(adminHtml, />管理画面<\/button>/);
  for (const label of ["登録・編集", "ユーザー数", "メンテナンス設定", "課金安全チェック", "管理監査ログ"]) {
    assert.match(adminHtml, new RegExp(`>${label}<\\/button>`));
  }
  for (const label of ["ユーザー", "運営会社", "事業所", "管理者発行"]) {
    assert.match(adminHtml, new RegExp(`data-admin-manage-panel="[^"]+"[^>]*>${label}<\\/button>`));
  }
  assert.match(adminHtml, /data-admin-manage-panel="organization" data-global-admin-only hidden/);
  assert.match(adminHtml, /data-admin-section="maintenance" data-global-admin-only hidden/);
  assert.match(adminHtml, /id="organizationList"[\s\S]*?id="organizationForm"/);
  assert.match(adminHtml, /id="officeList"[\s\S]*?id="officeForm"/);
  assert.match(adminHtml, /id="officeAdminList"[\s\S]*?id="officeAdminForm"/);
  assert.match(adminHtml, /<h3>登録済み事業所<\/h3>/);
  assert.match(adminHtml, /<h3>登録済み管理者<\/h3>/);
  assert.doesNotMatch(adminHtml, /登録済み事業所・管理者/);

  assert.match(adminSource, /function renderAdminNavigation\(\)/);
  assert.match(adminSource, /function setActiveAdminSection\(section\)/);
  assert.match(adminSource, /function setActiveAdminManagePanel\(panel\)/);
  assert.match(adminSource, /activeAdminManagePanel = "user"/);
  assert.match(adminSource, /adminMainShell\?\.classList\.toggle\([\s\S]*?"admin-user-panel-active"/);
  assert.match(adminSource, /officeAdminList\.appendChild\(buildManagementItem/);
  assert.match(styleSource, /\.organization-editor-layout \{[\s\S]*?grid-template-columns: minmax\(250px, 0\.8fr\) minmax\(320px, 1\.2fr\)/);
  assert.match(styleSource, /\.organization-management-list-pane \.organization-management-list \{[\s\S]*?overflow-y: auto/);
  assert.match(styleSource, /\.organization-management-item-header \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styleSource, /\.organization-management-item-header \.small-button \{[\s\S]*?min-width: 52px;[\s\S]*?white-space: nowrap;[\s\S]*?word-break: keep-all;/);
  assert.match(styleSource, /\.admin-role-badge\.role-user \{[\s\S]*?background: #fff0df;[\s\S]*?border-color: #e7b67c;[\s\S]*?color: #8a4f15;/);
  assert.match(styleSource, /\.admin-active-badge\.active \{[\s\S]*?background: #eaf4fa;[\s\S]*?color: #1f6487;/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.admin-manage-subnav-button\.active/);
  assert.match(styleSource, /DASHBOARD_FIXED_FRAME_AND_COMPACT_ADMIN_20260802_V107/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] body\.app-shell-body \{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(styleSource, /\.admin-main-shell\.admin-user-panel-active \{[\s\S]*?overflow: hidden;/);
  assert.match(styleSource, /\.admin-main-shell\.admin-user-panel-active \.admin-user-layout \{[\s\S]*?height: calc\(100vh - 44px\)/);
  assert.match(styleSource, /\.admin-main-shell\.admin-user-panel-active #adminUserCreateModeNote \{[\s\S]*?display: none/);
});

test("Ocean Blue is the default and both named themes stay device-local and reversible", async () => {
  const [sharedUiSource, bootstrapSource, styleSource, ...settingsPageSources] = await Promise.all([
    readSource("../ui-common.js"),
    readSource("../ui-mode-bootstrap.js"),
    readSource("../style.css"),
    readSource("../user.html"),
    readSource("../staff.html"),
    readSource("../weekly-report.html"),
    readSource("../workshops.html"),
    readSource("../admin.html"),
    readSource("../chatwork.html"),
    readSource("../index.html"),
    readSource("../maintenance.html"),
    readSource("../maintenance-admin-login.html")
  ]);

  assert.match(sharedUiSource, /const UI_MODE_STORAGE_KEY = "enzineScheduleUiMode"/);
  assert.match(sharedUiSource, /const UI_MODE_CLASSIC = "classic"/);
  assert.match(sharedUiSource, /return VALID_UI_MODES\.has\(mode\) \? mode : UI_MODE_DASHBOARD/);
  assert.match(sharedUiSource, /window\.localStorage\.getItem\(UI_MODE_STORAGE_KEY\)/);
  assert.match(sharedUiSource, /window\.localStorage\.setItem\(UI_MODE_STORAGE_KEY, normalizedMode\)/);
  assert.match(sharedUiSource, /document\.documentElement\.dataset\.uiMode = normalizedMode/);
  assert.match(sharedUiSource, /page-tab-nav-original-position/);
  assert.match(sharedUiSource, /topbarActions\.insertBefore\(navigation, settingsMenu \|\| null\)/);
  assert.match(sharedUiSource, /placeholder\.parentNode\.insertBefore\(navigation, placeholder\.nextSibling\)/);
  assert.match(sharedUiSource, /data-ui-mode-option="dashboard"/);
  assert.match(sharedUiSource, /data-ui-mode-option="classic"/);
  assert.match(sharedUiSource, />\s*Ocean Blue\s*<\/button>/);
  assert.match(sharedUiSource, />\s*Muted Sage\s*<\/button>/);
  assert.match(sharedUiSource, /const settingsMenu = button\.closest\("\.app-settings-menu"\)[\s\S]*?settingsMenu\.open = false/);
  assert.doesNotMatch(sharedUiSource, /この端末だけに保存されます|表示設定などは今後追加予定です/);
  assert.match(bootstrapSource, /let mode = "dashboard"/);
  assert.match(bootstrapSource, /localStorage\.getItem\(storageKey\) === "classic"/);
  assert.match(bootstrapSource, /document\.documentElement\.dataset\.uiMode = mode/);
  settingsPageSources.forEach((source) => {
    assert.doesNotMatch(source, /表示設定などは今後追加予定です/);
    assert.ok(source.indexOf('ui-mode-bootstrap.js?v=1') < source.indexOf('rel="stylesheet"'));
  });
  assert.match(sharedUiSource, /app-brand-office-name/);
  assert.match(sharedUiSource, /app-brand-schedule-label/);
  assert.doesNotMatch(sharedUiSource, /setDoc\([^)]*uiMode/);

  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] body\.app-shell-body/);
  assert.match(styleSource, /@media \(min-width: 961px\)[\s\S]*?--dashboard-sidebar-width: 264px/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.app-topbar \.page-tab-nav/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.staff-user-name-button\.active/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.choice-button\.active/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.calendar-day\.day-use/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.calendar-announcement-title\.category-workshop/);
  assert.match(styleSource, /UI_THEME_SWITCHER_20260803_V118/);
  assert.match(styleSource, /\.ui-mode-option\[data-ui-mode-option="dashboard"\] \{[\s\S]*?background: #e8f5fb;[\s\S]*?border-color: #73b9d8;/);
  assert.match(styleSource, /\.ui-mode-option\[data-ui-mode-option="classic"\] \{[\s\S]*?background: #eef4ec;[\s\S]*?border-color: #9ab197;/);
  assert.match(styleSource, /\.ui-mode-option\.active::after,[\s\S]*?content: "\\2713"/);
  assert.match(styleSource, /#staffAdminTopNav:not\(\.hidden\) ~ \.staff-page-tab-nav/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.app-settings-menu \{[\s\S]*?position: fixed;[\s\S]*?top: 4px;[\s\S]*?right: 4px;/);
  assert.match(styleSource, /DASHBOARD_RESPONSIVE_MENU_HIERARCHY_20260802_V109/);
  assert.match(styleSource, /@media \(max-width: 960px\) \{[\s\S]*?\.app-topbar \.admin-top-nav \{[\s\S]*?order: 0;[\s\S]*?background: #172b3e;/);
  assert.match(styleSource, /\.app-topbar \.admin-manage-subnav \{[\s\S]*?border-left: 3px solid #7aaec9;/);
  assert.match(styleSource, /\.app-topbar \.admin-manage-subnav-button\.active \{[\s\S]*?background: #e2e8ff;[\s\S]*?color: #3348a5;/);
  assert.match(styleSource, /RESPONSIVE_FULL_USER_META_20260803_V114[\s\S]*?\.app-topbar \.app-user-meta \{[\s\S]*?max-width: none;[\s\S]*?font-size: 13px;[\s\S]*?white-space: normal;[\s\S]*?text-overflow: clip;/);
  assert.match(styleSource, /SETTINGS_GEAR_BALANCE_20260803_V111[\s\S]*?\.app-settings-button \{[\s\S]*?font-size: 0;[\s\S]*?\.app-settings-button::before \{[\s\S]*?font-size: 32px;/);
  assert.match(styleSource, /RESPONSIVE_CALENDAR_MONTH_NAV_20260803_V116[\s\S]*?grid-template-columns: minmax\(78px, 1fr\) minmax\(108px, 1\.35fr\) minmax\(78px, 1fr\)/);
  assert.match(styleSource, /\.calendar-month-nav > \.calendar-month-label,[\s\S]*?order: 0;[\s\S]*?text-align: center;/);
  assert.match(styleSource, /\.calendar-month-nav > button \{[\s\S]*?width: 100%;[\s\S]*?min-height: 36px;[\s\S]*?font-size: 13px;/);
  assert.match(styleSource, /COMPACT_MOBILE_WEEK_NAV_AND_FILTERS_20260803_V120[\s\S]*?\.calendar-week-nav \{[\s\S]*?grid-template-columns: minmax\(76px, 1fr\) minmax\(104px, 1\.25fr\) minmax\(76px, 1fr\)/);
  assert.match(styleSource, /\.calendar-week-nav > \.calendar-week-label \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;[\s\S]*?font-size: 14px;/);
  assert.match(styleSource, /\.calendar-week-nav button \{[\s\S]*?min-height: 36px;[\s\S]*?font-size: 13px;/);
  assert.match(styleSource, /\.calendar-filter-label \{[\s\S]*?min-height: 34px;[\s\S]*?font-size: 14px;/);
  assert.match(styleSource, /\.calendar-filter-label input \{[\s\S]*?width: 18px;[\s\S]*?height: 18px;/);
  assert.match(styleSource, /MUTED_SAGE_ADMIN_HEADER_LAYOUT_20260803_V123[\s\S]*?html\[data-ui-mode="classic"\] \.admin-main-shell > \.app-topbar \{[\s\S]*?display: grid;[\s\S]*?"brand current topnav settings"[\s\S]*?"sections sections sections sections"/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.admin-main-shell \.admin-topbar-actions \{[\s\S]*?display: contents;/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.admin-main-shell \.admin-section-nav \{[\s\S]*?grid-area: sections;[\s\S]*?min-width: 0;/);
  assert.match(styleSource, /MUTED_SAGE_CONTROL_PALETTE_20260803_V124[\s\S]*?--muted-sage-accent: #6f8f72;/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.admin-section-nav-button\.active,[\s\S]*?background: var\(--muted-sage-soft\);[\s\S]*?border-color: var\(--muted-sage-border\);/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.admin-user-card \{[\s\S]*?border-left-color: #8aae7b;/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.admin-active-badge\.active \{[\s\S]*?background: var\(--muted-sage-soft\);/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.staff-user-schedule-sidebar,[\s\S]*?background: var\(--muted-sage-surface-soft\);/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] \.staff-office-scope-bar \{[\s\S]*?border-left-color: var\(--muted-sage-accent\);/);
  assert.match(styleSource, /html\[data-ui-mode="classic"\] input\[type="checkbox"\],[\s\S]*?accent-color: var\(--muted-sage-accent\);/);
  assert.doesNotMatch(styleSource, /html\[data-ui-mode="classic"\][^{]*\{[^}]*display:\s*none/);
});

test("calendar list views show announcement titles without time or body details", async () => {
  const [scheduleSource, staffSource, styleSource, userHtml, staffHtml] = await Promise.all([
    readSource("../schedule.js"),
    readSource("../staff.js"),
    readSource("../style.css"),
    readSource("../user.html"),
    readSource("../staff.html")
  ]);
  const userListBody = scheduleSource.match(
    /function renderMonthlyCalendarList\(year, month\) \{[\s\S]*?(?=\nasync function loadMonthlyCalendar)/
  )?.[0] || "";
  const staffListBody = staffSource.match(
    /function renderAnnouncementListViewFromCache\(year, month\) \{[\s\S]*?(?=\nasync function loadAnnouncementCalendar)/
  )?.[0] || "";
  const staffUserScheduleListStart = staffSource.indexOf("function renderUserMonthlyScheduleList(monthlySchedule, year, month) {");
  const staffUserScheduleListEnd = staffSource.indexOf("// 支援員：週一報告 管理", staffUserScheduleListStart);
  const staffUserScheduleListBody = staffSource.slice(staffUserScheduleListStart, staffUserScheduleListEnd);

  assert.match(userListBody, /calendar-list-announcement-title/);
  assert.doesNotMatch(userListBody, /calendar-list-announcement-time|calendar-list-announcement-body|announcement\.timeText|announcement\.body/);
  assert.match(userListBody, /calendar-list-time-slot/);
  assert.match(userListBody, /timeSlotText\.textContent = `時間帯：\$\{timeSlot\}`/);
  assert.doesNotMatch(userListBody, /calendar-list-schedule-main|予定：\$\{status\}/);
  assert.match(scheduleSource, /function getDefaultWeekStartForMonth\(year, month\)[\s\S]*?weekIntersectsMonth\(weekStart, year, month\)[\s\S]*?weekStart\.getDate\(\) \+ 7/);
  assert.match(staffListBody, /staff-announcement-list-card-title/);
  assert.doesNotMatch(staffListBody, /staff-announcement-list-card-time|staff-announcement-list-card-body|announcement\.timeText|announcement\.body/);
  assert.match(staffUserScheduleListBody, /calendar-list-time-slot/);
  assert.match(staffUserScheduleListBody, /timeSlotText\.textContent = `時間帯：\$\{dayData\.timeSlot\}`/);
  assert.doesNotMatch(staffUserScheduleListBody, /const time = document\.createElement|time\.textContent = `時間帯：/);
  assert.match(styleSource, /CALENDAR_LIST_COMPACT_HEADER_20260802_V108/);
  assert.match(styleSource, /\.calendar-list-status\.status-off,[\s\S]*?background: transparent;[\s\S]*?border: 0;/);
  assert.match(userHtml, /style\.css\?v=124/);
  assert.match(staffHtml, /style\.css\?v=124/);
  assert.match(userHtml, /schedule\.js\?v=97/);
  assert.match(staffHtml, /staff\.js\?v=104/);
});

test("weekly calendar navigation continues across month boundaries and updates the month", async () => {
  const [scheduleSource, staffSource] = await Promise.all([
    readSource("../schedule.js"),
    readSource("../staff.js")
  ]);
  const userWeekNavigationBody = scheduleSource.match(
    /async function changeDisplayedWeek\(weekOffset\) \{[\s\S]*?(?=\r?\n\r?\nif \(prevWeekButton\))/
  )?.[0] || "";
  const staffWeekNavigationStart = staffSource.indexOf("async function changeDisplayedUserScheduleWeek(weekOffset) {");
  const staffWeekNavigationEnd = staffSource.indexOf("if (prevUserScheduleWeekButton)", staffWeekNavigationStart);
  const staffWeekNavigationBody = staffSource.slice(staffWeekNavigationStart, staffWeekNavigationEnd);

  assert.match(userWeekNavigationBody, /currentWeekStartDate = nextWeekStart/);
  assert.match(userWeekNavigationBody, /currentYear = nextWeekStart\.getFullYear\(\)/);
  assert.match(userWeekNavigationBody, /currentMonth = nextWeekStart\.getMonth\(\)/);
  assert.match(userWeekNavigationBody, /await loadMonthlyCalendar\(\)/);
  assert.doesNotMatch(userWeekNavigationBody, /if \(!weekIntersectsMonth\([^}]*\{\s*return;/);

  assert.match(staffWeekNavigationBody, /setDisplayedUserScheduleMonth\(nextWeekStart\.getFullYear\(\), nextWeekStart\.getMonth\(\)\)/);
  assert.match(staffWeekNavigationBody, /displayedUserScheduleWeekStartDate = nextWeekStart/);
  assert.match(staffWeekNavigationBody, /await loadUserMonthlyScheduleView\(\)/);
  assert.doesNotMatch(staffWeekNavigationBody, /if \(!weekIntersectsMonth\([^}]*\{\s*return;/);
});

test("user and staff monthly calendars support safe multi-day schedule registration", async () => {
  const [userHtml, staffHtml, scheduleSource, staffSource, styleSource] = await Promise.all([
    readSource("../user.html"),
    readSource("../staff.html"),
    readSource("../schedule.js"),
    readSource("../staff.js"),
    readSource("../style.css")
  ]);
  const userBulkSaveBody = scheduleSource.match(
    /async function saveCalendarBulkRegistration\(\) \{[\s\S]*?(?=\r?\nfunction bindExclusiveBulkCheckboxes)/
  )?.[0] || "";
  const staffBulkSaveBody = staffSource.match(
    /async function saveUserScheduleBulkRegistration\(\) \{[\s\S]*?(?=\r?\n\r?\nfunction getMonthIdFromDateId)/
  )?.[0] || "";

  assert.match(userHtml, /id="calendarBulkRegisterButton"[^>]*>一括登録<\/button>/);
  assert.match(userHtml, /id="calendarBulkStatusComing" value="通所"/);
  assert.match(userHtml, /id="calendarBulkStatusHome" value="在宅"/);
  assert.match(userHtml, /id="calendarBulkTimeAll" value="終日"/);
  assert.match(userHtml, /id="calendarBulkTimeMorning" value="午前"/);
  assert.match(userHtml, /id="calendarBulkTimeAfternoon" value="午後"/);
  assert.match(userHtml, /class="calendar-bulk-footer"[\s\S]*?id="calendarBulkSelectedCount"[\s\S]*?id="calendarBulkCancelButton"[^>]*>キャンセル<\/button>/);
  assert.match(userHtml, /id="calendarBulkAlert"[^>]*role="alert"/);
  assert.match(staffHtml, /id="userScheduleBulkRegisterButton"[^>]*>一括登録<\/button>/);
  assert.match(staffHtml, /id="userScheduleBulkStatusComing" value="通所"/);
  assert.match(staffHtml, /id="userScheduleBulkTimeAfternoon" value="午後"/);
  assert.match(staffHtml, /class="calendar-bulk-footer"[\s\S]*?id="userScheduleBulkSelectedCount"[\s\S]*?id="userScheduleBulkCancelButton"[^>]*>キャンセル<\/button>/);
  assert.match(staffHtml, /id="userScheduleBulkAlert"[^>]*role="alert"/);

  assert.match(scheduleSource, /const isMonthlyView = currentViewMode === "calendar"/);
  assert.match(scheduleSource, /calendarBulkRegisterButton\.textContent = isCalendarBulkRegistrationActive \? "登録完了" : "一括登録"/);
  assert.match(scheduleSource, /勤務する日を複数選択してください/);
  assert.match(scheduleSource, /dayCell\.classList\.toggle\("bulk-registration-selected", calendarBulkSelectedDateIds\.has\(dateId\)\)/);
  assert.match(scheduleSource, /calendarBulkCancelButton\.addEventListener\("click"[\s\S]*?exitCalendarBulkRegistration\(\{ restoreFilters: true \}\)/);
  assert.match(userBulkSaveBody, /memo: currentMonthSchedules\[dateId\]\?\.memo \|\| ""/);
  assert.match(userBulkSaveBody, /showCalendarBulkAlert\(message\.textContent, "error"\)/);
  assert.match(userBulkSaveBody, /showCalendarBulkAlert\(message\.textContent, "success", 4500\)/);
  assert.match(userBulkSaveBody, /\{ merge: true \}/);
  assert.equal((userBulkSaveBody.match(/await setDoc\(/g) || []).length, 1);

  assert.match(staffSource, /currentUserScheduleViewMode === "calendar" && Boolean\(selectedUserScheduleId\)/);
  assert.match(staffSource, /userScheduleBulkRegisterButton\.textContent = isUserScheduleBulkRegistrationActive \? "登録完了" : "一括登録"/);
  assert.match(staffSource, /dayCell\.classList\.toggle\("bulk-registration-selected", userScheduleBulkSelectedDateIds\.has\(dateId\)\)/);
  assert.match(staffSource, /userScheduleBulkCancelButton\.addEventListener\("click"[\s\S]*?exitUserScheduleBulkRegistration\(\{ restoreFilters: true \}\)[\s\S]*?await loadUserMonthlyScheduleView\(\)/);
  assert.match(staffBulkSaveBody, /memo: days\[dateId\]\?\.memo \|\| ""/);
  assert.match(staffBulkSaveBody, /showUserScheduleBulkAlert\(userScheduleMessage\.textContent, "error"\)/);
  assert.match(staffBulkSaveBody, /showUserScheduleBulkAlert\(`\$\{selectedDateIds\.length\}日分の予定を一括登録しました。`, "success", 4500\)/);
  assert.match(staffBulkSaveBody, /workDayCount: calculateWorkDayCountFromDays\(days\)/);
  assert.equal((staffBulkSaveBody.match(/await setDoc\(/g) || []).length, 1);

  assert.match(styleSource, /CALENDAR_BULK_REGISTRATION_20260803_V117/);
  assert.match(styleSource, /\.calendar-filter-heading-row \{[\s\S]*?justify-content: space-between/);
  assert.match(styleSource, /\.calendar-filter-options\.hidden,[\s\S]*?\.calendar-bulk-controls\.hidden \{[\s\S]*?display: none !important/);
  assert.match(styleSource, /\.calendar-bulk-footer \{[\s\S]*?justify-content: space-between/);
  assert.match(styleSource, /\.calendar-bulk-cancel-button,[\s\S]*?margin: 0 0 0 auto;/);
  assert.match(styleSource, /\.calendar-day\.bulk-registration-selected,[\s\S]*?background: #ffe8ad !important/);
  assert.match(styleSource, /CALENDAR_ACTION_TOAST_20260803_V119/);
  assert.match(styleSource, /\.calendar-action-toast \{[\s\S]*?position: fixed;[\s\S]*?z-index: 2000;/);
  assert.match(styleSource, /\.calendar-action-toast\.error \{[\s\S]*?border-color: #c96452;/);
});

test("staff user schedules use a searchable scrolling sidebar beside the calendar", async () => {
  const [staffHtml, staffSource, styleSource] = await Promise.all([
    readSource("../staff.html"),
    readSource("../staff.js"),
    readSource("../style.css")
  ]);

  assert.match(staffHtml, /class="staff-user-schedule-workspace"/);
  assert.match(staffHtml, /id="staffUserScheduleSidebar"[\s\S]*?>利用者一覧</);
  assert.match(staffHtml, /id="userScheduleUserSearchInput"[^>]*placeholder="名前で検索"/);
  assert.match(staffHtml, /id="clearUserScheduleUserSearchButton"[^>]*>×<\/button>/);
  assert.match(staffHtml, /id="openAdminPageButton"[^>]*>管理画面<\/button>/);
  assert.match(staffHtml, /id="showAnnouncementsUserScheduleCheckbox" checked>[\s\S]*?アナウンス/);
  assert.ok(staffHtml.indexOf('id="staffUserScheduleSidebar"') < staffHtml.indexOf('id="staffUserScheduleMainPane"'));
  assert.ok(staffHtml.indexOf('id="staffUserScheduleMainPane"') < staffHtml.indexOf('id="userScheduleCalendarViewButton"'));

  assert.match(staffSource, /function setUserScheduleUserSearchQuery\(value\)/);
  assert.match(staffSource, /user\.name \|\| ""\}\$\{user\.nameKana \|\| ""/);
  assert.match(staffSource, /searchableName\.includes\(normalizedQuery\)/);
  assert.match(staffSource, /clearUserScheduleUserSearchButton\.addEventListener\("click"/);
  assert.match(staffSource, /function appendUserScheduleAnnouncements\(container, dateId, options = \{\}\)/);
  assert.match(staffSource, /getSelectedUserMonthlySchedule[\s\S]*?loadMonthlyAnnouncements\(displayedUserScheduleYear, displayedUserScheduleMonth\)/);
  assert.equal((staffSource.match(/appendUserScheduleAnnouncements\(dayCell, dateId/g) || []).length, 2);
  assert.match(staffSource, /appendUserScheduleAnnouncements\(dayItem, dateId, \{ listMode: true \}\)/);
  assert.match(staffSource, /showAnnouncementsUserScheduleCheckbox\.addEventListener\("change"/);
  assert.match(staffSource, /function getDefaultWeekStartForMonth\(year, month\)[\s\S]*?weekIntersectsMonth\(weekStart, year, month\)[\s\S]*?weekStart\.getDate\(\) \+ 7/);
  assert.match(styleSource, /\.staff-user-schedule-workspace \{[\s\S]*?grid-template-columns: minmax\(190px, 230px\) minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.staff-user-button-list \{[\s\S]*?flex-direction: column;[\s\S]*?overflow-y: auto;/);
  assert.match(styleSource, /USER_SCHEDULE_OFF_AND_ANNOUNCEMENTS_20260802_V104[\s\S]*?\.calendar-day\.day-off,[\s\S]*?background: #dfe4ea/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.calendar-status\.status-off,[\s\S]*?background: #566575;[\s\S]*?color: #ffffff/);
});

test("global admins can select a validated staff-page office while office admins remain fixed", async () => {
  const [staffHtml, staffSource, styleSource, rulesSource, verifierSource] = await Promise.all([
    readSource("../staff.html"),
    readSource("../staff.js"),
    readSource("../style.css"),
    readSource("../firestore.emulator.rules"),
    readSource("../scripts/verify-local-emulators.mjs")
  ]);

  assert.match(staffHtml, /id="staffOfficeScopeBar"[^>]*class="staff-office-scope-bar hidden"/);
  assert.match(staffHtml, /id="staffOfficeScopeSelect"/);
  assert.match(staffHtml, /id="staffOfficeScopeStatus"[^>]*aria-live="polite"/);
  assert.match(staffSource, /getOrganizationManagementData = httpsCallable\(functions, "getOrganizationManagementData"\)/);
  assert.match(staffSource, /function isCurrentStaffGlobalAdmin\(\)[\s\S]*?accessScope === "global"/);
  assert.match(staffSource, /function getCurrentOfficeId\(\)[\s\S]*?selectedStaffOfficeContext\?\.officeId/);
  assert.match(staffSource, /function getCurrentGroupId\(\)[\s\S]*?selectedStaffOfficeContext\?\.organizationId/);
  assert.match(staffSource, /\.filter\(\(office\) => office\?\.active === true\)/);
  assert.match(staffSource, /offices\.find\(\(office\) => office\.officeId === requestedOfficeId\)/);
  assert.match(staffSource, /setStaffOfficeScopeUrl\(selectedOffice\.officeId, \{ reload: true \}\)/);
  assert.match(staffSource, /await initializeGlobalAdminOfficeScope\(\);[\s\S]*?await applyOfficeBrandName/);
  assert.match(styleSource, /GLOBAL_ADMIN_STAFF_OFFICE_SCOPE_20260803_V121/);

  assert.match(rulesSource, /isOfficeOperator\(\)[\s\S]*?callerOfficeDocumentId\(announcementId\)[\s\S]*?sameMembership\(request\.resource\.data\)/);
  assert.match(verifierSource, /expectFirestoreAllowed\(officeAdminSignIn\.idToken, "PATCH", "monthlyAnnouncements\/demo-office-a_rules-office-admin-a"/);
  assert.match(verifierSource, /expectFirestoreDenied\(officeAdminSignIn\.idToken, "PATCH", "monthlyAnnouncements\/demo-office-b_rules-office-admin-b"/);
  assert.match(verifierSource, /expectFirestoreAllowed\(globalSignIn\.idToken, "PATCH", "monthlyAnnouncements\/demo-office-b_rules-global"/);
  assert.match(verifierSource, /expectFirestoreAllowed\(globalSignIn\.idToken, "PATCH", "system\/workshopResources_demo-office-b"/);
});

test("user navigation shows the weekly-report count and the schedule page has no duplicate quick links", async () => {
  const [userHtml, weeklyHtml, workshopsHtml, scheduleSource, sharedUiSource, styleSource] = await Promise.all([
    readSource("../user.html"),
    readSource("../weekly-report.html"),
    readSource("../workshops.html"),
    readSource("../schedule.js"),
    readSource("../ui-common.js"),
    readSource("../style.css")
  ]);

  for (const source of [userHtml, weeklyHtml, workshopsHtml]) {
    assert.match(source, /data-weekly-report-nav-badge/);
  }
  assert.doesNotMatch(userHtml, /weekly-report-entry-box|resource-link-entry-box|週一報告を書く|ワークショップ・教材を見る/);
  assert.match(scheduleSource, /setWeeklyReportNavPendingCount\(totalCount, currentUser\?\.uid\)/);
  assert.match(sharedUiSource, /WEEKLY_REPORT_NAV_COUNT_KEY_PREFIX/);
  assert.match(sharedUiSource, /window\.sessionStorage\.setItem/);
  assert.match(sharedUiSource, /restoreWeeklyReportNavPendingCount/);
  assert.match(styleSource, /\.user-nav-notification-badge \{[\s\S]*?background: #f97316/);
  assert.match(styleSource, /@media \(max-width: 960px\) \{[\s\S]*?html\[data-ui-mode="dashboard"\] \.app-topbar \{[\s\S]*?flex-direction: column;[\s\S]*?\.app-topbar \.page-tab-nav \{[\s\S]*?flex-direction: row;/);
  assert.match(styleSource, /#staffEditStatusButtonGroup \.choice-button\.status-coming\.active[\s\S]*?background: #2c91c7 !important/);
  assert.match(styleSource, /html\[data-ui-mode="dashboard"\] \.today-schedule-unset \{[\s\S]*?background: #eef3f7/);
});
