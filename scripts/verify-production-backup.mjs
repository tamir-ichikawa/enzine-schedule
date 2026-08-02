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

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番バックアップを検証できません。");
  process.exit(1);
}
if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}
if (process.platform !== "win32") {
  console.error("Windowsのアクセス制御を検証できる環境が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localRoot = path.join(projectRoot, ".production-backups");
const require = createRequire(import.meta.url);
const firebaseAuth = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "auth"));
const scopes = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "scopes"));

class SafeVerifyError extends Error {
  constructor(stage, status = "") {
    super(stage);
    this.stage = stage;
    this.status = status;
  }
}

function runProcess(command, args, stage) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-131_072);
    });
    child.stderr.on("data", () => {});
    child.on("error", () => reject(new SafeVerifyError(stage, "start-failed")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new SafeVerifyError(stage, `exit-${code ?? "unknown"}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function getCliAccessToken() {
  let account;
  try {
    account = firebaseAuth.getProjectDefaultAccount(projectRoot)
      || firebaseAuth.getGlobalDefaultAccount();
  } catch {
    throw new SafeVerifyError("firebase-cli-authentication");
  }
  if (!account?.tokens?.refresh_token) {
    throw new SafeVerifyError("firebase-cli-authentication");
  }
  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeVerifyError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeVerifyError) {
      throw error;
    }
    throw new SafeVerifyError("firebase-cli-access-token");
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
    throw new SafeVerifyError(stage, "network");
  }
  if (!response.ok) {
    throw new SafeVerifyError(stage, String(response.status));
  }
  try {
    return await response.json();
  } catch {
    throw new SafeVerifyError(stage, "invalid-json");
  }
}

async function findLatestBackupDirectory() {
  let entries;
  try {
    entries = await fs.readdir(localRoot, { withFileTypes: true });
  } catch {
    throw new SafeVerifyError("local-backup-discovery", "not-found");
  }
  const latest = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!latest) {
    throw new SafeVerifyError("local-backup-discovery", "not-found");
  }
  return path.join(localRoot, latest);
}

async function sha256(filePath) {
  const contents = await fs.readFile(filePath);
  return {
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex")
  };
}

async function verifyLocalFiles(backupDirectory, manifest) {
  const authPath = path.join(backupDirectory, "firebase-auth-users.json");
  const hashConfigPath = path.join(backupDirectory, "firebase-auth-hash-config.json");
  const [authText, hashConfigText, authSummary, hashConfigSummary] = await Promise.all([
    fs.readFile(authPath, "utf8"),
    fs.readFile(hashConfigPath, "utf8"),
    sha256(authPath),
    sha256(hashConfigPath)
  ]);
  let authPayload;
  let hashConfigPayload;
  try {
    authPayload = JSON.parse(authText);
    hashConfigPayload = JSON.parse(hashConfigText);
  } catch {
    throw new SafeVerifyError("local-file-verification", "invalid-json");
  }
  const users = authPayload.users;
  if (
    !Array.isArray(users)
    || users.length !== manifest.authentication?.userCount
    || users.length === 0
    || !hashConfigPayload.hashConfig?.signerKey
    || authSummary.sha256 !== manifest.authentication?.usersFile?.sha256
    || authSummary.bytes !== manifest.authentication?.usersFile?.bytes
    || hashConfigSummary.sha256 !== manifest.authentication?.hashConfigFile?.sha256
    || hashConfigSummary.bytes !== manifest.authentication?.hashConfigFile?.bytes
  ) {
    throw new SafeVerifyError("local-file-verification", "mismatch");
  }
  return { userCount: users.length };
}

async function verifyLocalAcl(backupDirectory) {
  const quotedTarget = backupDirectory.replaceAll("'", "''");
  const psScript = [
    `$target = '${quotedTarget}'`,
    "$acl = Get-Acl -LiteralPath $target",
    "$currentSid = [regex]::Match((& whoami.exe /user /fo csv /nh), 'S-\\d-(?:\\d+-)+\\d+').Value",
    "$allowed = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')",
    "$rules = @($acl.Access)",
    "$actual = @($rules | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })",
    "$valid = $currentSid -and $acl.AreAccessRulesProtected -and $rules.Count -eq 3",
    "$valid = $valid -and @($rules | Where-Object { $_.IsInherited -or $_.AccessControlType -ne 'Allow' -or $_.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl }).Count -eq 0",
    "$valid = $valid -and @($actual | Where-Object { $allowed -notcontains $_ }).Count -eq 0",
    "$valid = $valid -and @($allowed | Where-Object { $actual -notcontains $_ }).Count -eq 0",
    "[PSCustomObject]@{ Valid = [bool]$valid; Protected = $acl.AreAccessRulesProtected; RuleCount = $rules.Count } | ConvertTo-Json -Compress"
  ].join("\n");
  const aclText = await runProcess(
    "pwsh.exe",
    ["-NoProfile", "-NonInteractive", "-Command", psScript],
    "local-acl-read"
  );
  let acl;
  try {
    acl = JSON.parse(aclText);
  } catch {
    throw new SafeVerifyError("local-acl-read", "invalid-json");
  }
  if (acl.Valid !== true || acl.Protected !== true || acl.RuleCount !== 3) {
    throw new SafeVerifyError(
      "local-acl-validation",
      `valid-${acl.Valid === true}-protected-${acl.Protected === true}-rules-${Number(acl.RuleCount) || 0}`
    );
  }
}

async function verifyCloudExport(accessToken, manifest) {
  const bucket = await readJson(
    accessToken,
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BACKUP_BUCKET)}?projection=noAcl`,
    "storage-bucket-verification"
  );
  if (
    bucket.name !== BACKUP_BUCKET
    || String(bucket.projectNumber || "") !== PROJECT_NUMBER
    || String(bucket.location || "").toUpperCase() !== LOCATION
    || bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
    || bucket.iamConfiguration?.publicAccessPrevention !== "enforced"
    || bucket.versioning?.enabled !== true
  ) {
    throw new SafeVerifyError("storage-bucket-verification", "unexpected-settings");
  }

  const uriPrefix = manifest.firestore?.outputUriPrefix;
  const expectedUriStart = `gs://${BACKUP_BUCKET}/`;
  if (
    manifest.projectId !== PROJECT_ID
    || manifest.firestore?.databaseId !== DATABASE_ID
    || manifest.firestore?.location !== LOCATION
    || !String(uriPrefix || "").startsWith(expectedUriStart)
  ) {
    throw new SafeVerifyError("backup-manifest-verification", "unexpected-target");
  }
  const objectPrefix = uriPrefix.slice(expectedUriStart.length);
  let pageToken = "";
  let objectCount = 0;
  let totalBytes = 0n;
  let metadataPresent = false;
  do {
    const query = new URLSearchParams({ prefix: objectPrefix });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const page = await readJson(
      accessToken,
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BACKUP_BUCKET)}/o?${query}`,
      "firestore-export-verification"
    );
    for (const item of page.items || []) {
      objectCount += 1;
      totalBytes += BigInt(item.size || "0");
      metadataPresent ||= String(item.name || "").endsWith(".overall_export_metadata");
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  if (
    objectCount !== manifest.firestore.objectCount
    || totalBytes.toString() !== manifest.firestore.totalBytes
    || !metadataPresent
  ) {
    throw new SafeVerifyError("firestore-export-verification", "mismatch");
  }
  return { objectCount };
}

async function main() {
  const backupDirectory = await findLatestBackupDirectory();
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(backupDirectory, "backup-manifest.json"), "utf8"));
  } catch {
    throw new SafeVerifyError("backup-manifest-verification", "invalid-json");
  }
  const local = await verifyLocalFiles(backupDirectory, manifest);
  await verifyLocalAcl(backupDirectory);
  const cloud = await verifyCloudExport(await getCliAccessToken(), manifest);

  console.log(`検証対象: ${path.basename(backupDirectory)}（内容は非表示）`);
  console.log(`Authentication: ${local.userCount}アカウント、チェックサム一致`);
  console.log("パスワード復元設定: チェックサム一致、署名鍵あり（値は非表示）");
  console.log(`Firestore: ${cloud.objectCount}オブジェクト、復元メタデータとサイズ一致`);
  console.log("Cloud Storage: 東京リージョン・非公開・均一アクセス・バージョニングを確認");
  console.log("ローカル保管権限: 継承なし・許可対象を制限済み");
  console.log("バックアップ検証: 合格");
}

main().catch((error) => {
  const stage = error instanceof SafeVerifyError ? error.stage : "unexpected";
  const status = error instanceof SafeVerifyError && error.status ? ` / ${error.status}` : "";
  console.error(`本番バックアップを安全に検証できませんでした（段階: ${stage}${status}）。`);
  console.error("秘密情報や利用者データは表示していません。本番データは変更していません。");
  process.exitCode = 1;
});
