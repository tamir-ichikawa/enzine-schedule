import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const RELEASE_NAME = `projects/${PROJECT_ID}/releases/cloud.firestore`;
const RULES_API_ORIGIN = "https://firebaserules.googleapis.com/v1";
const VERIFY_ONLY = process.argv.includes("--verify-only");
const expectedSha256Argument = process.argv.find((argument) => argument.startsWith("--expect-sha256="));
const EXPECTED_SHA256 = expectedSha256Argument?.slice("--expect-sha256=".length) || "";

if (EXPECTED_SHA256 && !/^[a-f0-9]{64}$/.test(EXPECTED_SHA256)) {
  console.error("期待SHA-256は64桁の小文字16進数で指定してください。");
  process.exit(1);
}

if (EXPECTED_SHA256 && !VERIFY_ONLY) {
  console.error("期待SHA-256の照合は --verify-only と同時に使用してください。");
  process.exit(1);
}

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番ルールを取得できません。");
  process.exit(1);
}

if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const rollbackRulesPath = path.join(deployRoot, "firestore.production.rollback.rules");
const rollbackManifestPath = path.join(deployRoot, "firestore-rules-rollback-manifest.json");
const require = createRequire(import.meta.url);
const firebaseAuth = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "auth"));
const scopes = require(path.join(projectRoot, "node_modules", "firebase-tools", "lib", "scopes"));

class SafeRulesFetchError extends Error {
  constructor(stage, status = "") {
    super(stage);
    this.stage = stage;
    this.status = status;
  }
}

function assertInsideProject(targetPath) {
  const relative = path.relative(projectRoot, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SafeRulesFetchError("unsafe-local-output-path");
  }
}

async function getCliAccessToken() {
  const account = firebaseAuth.getProjectDefaultAccount(projectRoot)
    || firebaseAuth.getGlobalDefaultAccount();

  if (!account?.tokens?.refresh_token) {
    throw new SafeRulesFetchError("firebase-cli-authentication");
  }

  try {
    const tokenData = await firebaseAuth.getAccessToken(
      account.tokens.refresh_token,
      [scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]
    );
    if (!tokenData?.access_token) {
      throw new SafeRulesFetchError("firebase-cli-access-token");
    }
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof SafeRulesFetchError) {
      throw error;
    }
    throw new SafeRulesFetchError("firebase-cli-access-token");
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
    throw new SafeRulesFetchError(stage, "network");
  }

  if (!response.ok) {
    throw new SafeRulesFetchError(stage, String(response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new SafeRulesFetchError(stage, "invalid-json");
  }
}

async function listAllReleases(accessToken) {
  const releases = [];
  let pageToken = "";

  do {
    const url = new URL(`${RULES_API_ORIGIN}/projects/${PROJECT_ID}/releases`);
    url.searchParams.set("pageSize", "10");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const payload = await readJson(accessToken, url, "firestore-rules-releases");
    releases.push(...(payload.releases || []));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);

  return releases;
}

async function ensureSafeDeployRoot() {
  assertInsideProject(deployRoot);
  assertInsideProject(rollbackRulesPath);
  assertInsideProject(rollbackManifestPath);
  await mkdir(deployRoot, { recursive: true });
  const deployStat = await lstat(deployRoot);
  if (!deployStat.isDirectory() || deployStat.isSymbolicLink()) {
    throw new SafeRulesFetchError("unsafe-local-output-directory");
  }
}

async function main() {
  const accessToken = await getCliAccessToken();
  const releases = await listAllReleases(accessToken);
  const release = releases.find((entry) => entry?.name === RELEASE_NAME);

  if (!release?.rulesetName?.startsWith(`projects/${PROJECT_ID}/rulesets/`)) {
    throw new SafeRulesFetchError("firestore-rules-release-not-found");
  }

  const ruleset = await readJson(
    accessToken,
    `${RULES_API_ORIGIN}/${release.rulesetName}`,
    "firestore-rules-ruleset"
  );
  const files = ruleset?.source?.files;

  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== "string") {
    throw new SafeRulesFetchError("unexpected-firestore-rules-source-shape");
  }

  const content = files[0].content;
  const contentBuffer = Buffer.from(content, "utf8");
  const rulesByteLength = contentBuffer.byteLength;
  const sha256 = createHash("sha256").update(contentBuffer).digest("hex");
  const rulesetId = String(release.rulesetName).split("/").pop();
  const manifest = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    service: "cloud.firestore",
    releaseName: RELEASE_NAME,
    rulesetName: release.rulesetName,
    rulesetId,
    rulesetCreateTime: String(ruleset.createTime || ""),
    releaseCreateTime: String(release.createTime || ""),
    releaseUpdateTime: String(release.updateTime || ""),
    sourceFileName: String(files[0].name || ""),
    localRulesPath: ".firebase-deploy/firestore.production.rollback.rules",
    bytes: rulesByteLength,
    sha256,
    remoteMethods: ["GET"]
  };

  if (EXPECTED_SHA256 && sha256 !== EXPECTED_SHA256) {
    throw new SafeRulesFetchError("current-firestore-rules-sha256-mismatch");
  }

  if (!VERIFY_ONLY) {
    await ensureSafeDeployRoot();
    await writeFile(rollbackRulesPath, contentBuffer, { mode: 0o600 });
    await writeFile(rollbackManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });

    const written = await readFile(rollbackRulesPath);
    if (createHash("sha256").update(written).digest("hex") !== sha256) {
      throw new SafeRulesFetchError("local-rollback-verification");
    }
  }

  console.log(VERIFY_ONLY
    ? "現在公開中のFirestoreルールをGETのみで照合しました。復旧候補は上書きしていません。"
    : "現在公開中のFirestoreルールをGETのみで取得し、ローカル復旧候補へ保存しました。");
  console.log(`Ruleset ID: ${rulesetId}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Bytes: ${rulesByteLength}`);
  if (EXPECTED_SHA256) {
    console.log("期待SHA-256と一致しました。");
  }
  console.log("ルール本文・認証情報・ユーザー情報は表示していません。");
}

main().catch((error) => {
  const stage = error instanceof SafeRulesFetchError ? error.stage : "unexpected-error";
  const status = error instanceof SafeRulesFetchError && error.status ? ` (${error.status})` : "";
  console.error(`本番Firestoreルールの読み取り取得に失敗しました: ${stage}${status}`);
  process.exitCode = 1;
});
