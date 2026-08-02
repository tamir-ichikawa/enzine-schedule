import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const PROJECT_NUMBER = "486612480549";
const DATABASE_ID = "(default)";
const LOCATION = "ASIA-NORTHEAST1";
const BACKUP_BUCKET = "enzine-schedule-486612480549-backups";
const CONFIRMATION_ARGUMENT = `--confirm-project=${PROJECT_ID}`;

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番バックアップを実行できません。");
  process.exit(1);
}

if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

if (!process.argv.includes(CONFIRMATION_ARGUMENT)) {
  console.error(`対象確認引数 ${CONFIRMATION_ARGUMENT} が必要です。`);
  process.exit(1);
}

if (process.platform !== "win32") {
  console.error("このバックアップ処理はWindowsのアクセス制御を確認できる環境でのみ実行できます。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCliPath = path.join(
  projectRoot,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js"
);
const require = createRequire(import.meta.url);
const firebaseAuth = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "auth"));
const scopes = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "scopes"));

class SafeBackupError extends Error {
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
    throw new SafeBackupError("firebase-cli-authentication");
  }

  if (!account?.tokens?.refresh_token) {
    throw new SafeBackupError("firebase-cli-authentication");
  }

  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeBackupError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeBackupError) {
      throw error;
    }
    throw new SafeBackupError("firebase-cli-access-token");
  }
}

async function requestJson(accessToken, url, stage, {
  method = "GET",
  body,
  allowNotFound = false
} = {}) {
  if (!new Set(["GET", "POST"]).has(method)) {
    throw new SafeBackupError(stage, "method-not-allowed");
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new SafeBackupError(stage, "network");
  }

  if (allowNotFound && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new SafeBackupError(stage, String(response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new SafeBackupError(stage, "invalid-json");
  }
}

function runProcess(command, args, stage, { timeoutMs = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true"
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const appendLimited = (current, chunk) => `${current}${chunk}`.slice(-131_072);
    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new SafeBackupError(stage, "timeout"));
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new SafeBackupError(stage, "start-failed"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new SafeBackupError(stage, `exit-${code ?? "unknown"}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function createRestrictedBackupDirectory(timestamp) {
  const backupDirectory = path.join(projectRoot, ".production-backups", timestamp);
  await fs.mkdir(backupDirectory, { recursive: true });

  const identity = await runProcess("whoami.exe", ["/user", "/fo", "csv", "/nh"], "local-acl-identity");
  const userSid = identity.stdout.match(/S-\d-(?:\d+-)+\d+/)?.[0];
  if (!userSid) {
    throw new SafeBackupError("local-acl-identity", "sid-not-found");
  }

  await runProcess(
    "icacls.exe",
    [
      backupDirectory,
      "/inheritance:r",
      "/grant:r",
      `*${userSid}:(OI)(CI)F`,
      "*S-1-5-18:(OI)(CI)F",
      "*S-1-5-32-544:(OI)(CI)F",
      "/T",
      "/C"
    ],
    "local-acl-apply"
  );

  return backupDirectory;
}

function validateBackupBucket(bucket) {
  if (
    bucket?.name !== BACKUP_BUCKET
    || String(bucket.projectNumber || "") !== PROJECT_NUMBER
    || String(bucket.location || "").toUpperCase() !== LOCATION
    || bucket.storageClass !== "STANDARD"
    || bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
    || bucket.iamConfiguration?.publicAccessPrevention !== "enforced"
    || bucket.versioning?.enabled !== true
  ) {
    throw new SafeBackupError("storage-bucket-validation", "unexpected-settings");
  }
}

async function ensureBackupBucket(accessToken) {
  const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BACKUP_BUCKET)}?projection=noAcl`;
  let bucket = await requestJson(accessToken, bucketUrl, "storage-bucket-inspection", {
    allowNotFound: true
  });
  let created = false;

  if (!bucket) {
    bucket = await requestJson(
      accessToken,
      `https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}&projection=noAcl`,
      "storage-bucket-create",
      {
        method: "POST",
        body: {
          name: BACKUP_BUCKET,
          location: LOCATION,
          storageClass: "STANDARD",
          iamConfiguration: {
            uniformBucketLevelAccess: { enabled: true },
            publicAccessPrevention: "enforced"
          },
          versioning: { enabled: true }
        }
      }
    );
    created = true;
  }

  validateBackupBucket(bucket);
  return { created };
}

async function startFirestoreExport(accessToken, cloudPrefix) {
  const operation = await requestJson(
    accessToken,
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}:exportDocuments`,
    "firestore-export-start",
    {
      method: "POST",
      body: {
        outputUriPrefix: `gs://${BACKUP_BUCKET}/${cloudPrefix}`
      }
    }
  );

  if (!operation?.name || !operation.name.startsWith(`projects/${PROJECT_ID}/databases/${DATABASE_ID}/operations/`)) {
    throw new SafeBackupError("firestore-export-start", "invalid-operation");
  }
  return operation.name;
}

async function waitForFirestoreExport(accessToken, operationName) {
  const startedAt = Date.now();
  let lastProgressNotice = 0;

  while (Date.now() - startedAt < 60 * 60 * 1000) {
    const operation = await requestJson(
      accessToken,
      `https://firestore.googleapis.com/v1/${operationName}`,
      "firestore-export-poll"
    );
    if (operation.done === true) {
      if (operation.error) {
        throw new SafeBackupError("firestore-export-operation", String(operation.error.code || "failed"));
      }
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsedSeconds - lastProgressNotice >= 30) {
      console.log(`Firestoreバックアップ: 処理中（${elapsedSeconds}秒、内容は非表示）`);
      lastProgressNotice = elapsedSeconds;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new SafeBackupError("firestore-export-poll", "timeout");
}

async function inspectFirestoreExport(accessToken, cloudPrefix) {
  let pageToken = "";
  let objectCount = 0;
  let totalBytes = 0n;
  let overallMetadataPresent = false;

  do {
    const query = new URLSearchParams({ prefix: cloudPrefix });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const page = await requestJson(
      accessToken,
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BACKUP_BUCKET)}/o?${query}`,
      "firestore-export-verification"
    );
    for (const item of page.items || []) {
      objectCount += 1;
      totalBytes += BigInt(item.size || "0");
      if (String(item.name || "").endsWith(".overall_export_metadata")) {
        overallMetadataPresent = true;
      }
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  if (objectCount === 0 || !overallMetadataPresent) {
    throw new SafeBackupError("firestore-export-verification", "incomplete");
  }
  return { objectCount, totalBytes: totalBytes.toString(), overallMetadataPresent };
}

async function exportAuthentication(backupDirectory) {
  const outputPath = path.join(backupDirectory, "firebase-auth-users.json");
  await runProcess(
    process.execPath,
    [
      "--use-system-ca",
      firebaseCliPath,
      "auth:export",
      outputPath,
      "--format=json",
      "--project",
      PROJECT_ID,
      "--non-interactive"
    ],
    "authentication-user-export"
  );

  let payload;
  try {
    payload = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch {
    throw new SafeBackupError("authentication-user-verification", "invalid-json");
  }
  if (!Array.isArray(payload.users) || payload.users.length === 0) {
    throw new SafeBackupError("authentication-user-verification", "empty-or-invalid");
  }
  return { outputPath, userCount: payload.users.length };
}

async function exportAuthenticationHashConfig(accessToken, backupDirectory, timestamp) {
  const authConfig = await requestJson(
    accessToken,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
    "authentication-hash-config"
  );
  const hashConfig = authConfig?.signIn?.hashConfig
    || authConfig?.signIn?.email?.hashConfig
    || null;
  if (!hashConfig?.signerKey) {
    throw new SafeBackupError("authentication-hash-config", "signer-key-unavailable");
  }

  const outputPath = path.join(backupDirectory, "firebase-auth-hash-config.json");
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ projectId: PROJECT_ID, exportedAt: timestamp, hashConfig }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" }
  );
  return outputPath;
}

async function fileSummary(filePath) {
  const contents = await fs.readFile(filePath);
  return {
    file: path.basename(filePath),
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex")
  };
}

async function main() {
  const timestamp = new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const cloudPrefix = `pre-multi-office/${safeTimestamp}`;
  const accessToken = await getCliAccessToken();

  console.log(`対象プロジェクト: ${PROJECT_ID}（バックアップのみ）`);
  const bucketResult = await ensureBackupBucket(accessToken);
  console.log(`専用バックアップバケット: ${bucketResult.created ? "安全設定で新規作成" : "既存の安全設定を確認"}`);

  const operationName = await startFirestoreExport(accessToken, cloudPrefix);
  console.log("Firestoreバックアップ: 開始（データ内容は非表示）");
  await waitForFirestoreExport(accessToken, operationName);
  const firestore = await inspectFirestoreExport(accessToken, cloudPrefix);
  console.log(`Firestoreバックアップ: 完了（${firestore.objectCount}オブジェクト、メタデータ確認済み）`);

  const backupDirectory = await createRestrictedBackupDirectory(safeTimestamp);
  const authentication = await exportAuthentication(backupDirectory);
  const hashConfigPath = await exportAuthenticationHashConfig(accessToken, backupDirectory, timestamp);
  const authFile = await fileSummary(authentication.outputPath);
  const hashConfigFile = await fileSummary(hashConfigPath);

  const manifest = {
    formatVersion: 1,
    projectId: PROJECT_ID,
    createdAt: timestamp,
    purpose: "pre-multi-office-production-backup",
    firestore: {
      databaseId: DATABASE_ID,
      location: LOCATION,
      bucket: BACKUP_BUCKET,
      outputUriPrefix: `gs://${BACKUP_BUCKET}/${cloudPrefix}`,
      operationName,
      objectCount: firestore.objectCount,
      totalBytes: firestore.totalBytes,
      overallMetadataPresent: firestore.overallMetadataPresent
    },
    authentication: {
      userCount: authentication.userCount,
      usersFile: authFile,
      hashConfigFile,
      hashConfigPresent: true,
      signerKeyPresent: true
    }
  };
  const manifestPath = path.join(backupDirectory, "backup-manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });

  console.log(`Authenticationバックアップ: 完了（${authentication.userCount}アカウント、内容は非表示）`);
  console.log("パスワード復元設定: 完了（署名鍵の値は非表示）");
  console.log(`ローカル保管先: .production-backups/${safeTimestamp}（Git対象外・アクセス制限済み）`);
  console.log("本番データの変更・移行・デプロイ: 実施なし");
}

main().catch((error) => {
  const stage = error instanceof SafeBackupError ? error.stage : "unexpected";
  const status = error instanceof SafeBackupError && error.status ? ` / ${error.status}` : "";
  console.error(`本番バックアップを安全に完了できませんでした（段階: ${stage}${status}）。`);
  console.error("秘密情報や利用者データは表示していません。移行処理は実行していません。");
  process.exitCode = 1;
});
