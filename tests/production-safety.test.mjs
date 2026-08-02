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
  assert.match(adminSource, /setGlobalOnlyElementVisibility\(adminAuditLogSection, isGlobalAdmin\)/);
  assert.match(adminHtml, /id="adminAuditLogSection"[\s\S]*?hidden/);
  assert.match(adminHtml, /style\.css\?v=98/);
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

test("office brand cache revisions reach every page that imports the shared module", async () => {
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
    assert.match(source, /\.\/ui-common\.js\?v=84/);
    assert.doesNotMatch(source, /\.\/ui-common\.js\?v=83/);
  }

  const adminHtml = await readSource("../admin.html");
  assert.match(adminHtml, /admin\.js\?v=103/);
  assert.match(adminHtml, /style\.css\?v=98/);
});
