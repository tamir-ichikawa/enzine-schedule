import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ID = "enzine-schedule";
const RELEASE_NAME = `projects/${PROJECT_ID}/releases/cloud.firestore`;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const paths = {
  source: path.join(projectRoot, "firestore.emulator.rules"),
  candidate: path.join(deployRoot, "firestore.production.candidate.rules"),
  candidateManifest: path.join(deployRoot, "firestore-rules-manifest.json"),
  rollback: path.join(deployRoot, "firestore.production.rollback.rules"),
  rollbackManifest: path.join(deployRoot, "firestore-rules-rollback-manifest.json"),
  candidateConfig: path.join(projectRoot, "firebase.production.firestore.rules.candidate.json"),
  rollbackConfig: path.join(projectRoot, "firebase.production.firestore.rules.rollback.json")
};

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function assertRegularFile(filePath, label) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label}は通常ファイルである必要があります。`);
  }
}

function assertRulesOnlyConfig(config, expectedPath, label) {
  if (JSON.stringify(Object.keys(config)) !== JSON.stringify(["firestore"])) {
    throw new Error(`${label}にFirestore以外のデプロイ対象が含まれています。`);
  }
  if (config.firestore?.rules !== expectedPath) {
    throw new Error(`${label}のルール参照先が固定値と一致しません。`);
  }
}

function countStatements(text, pattern) {
  return (text.match(pattern) || []).length;
}

const [
  source,
  candidate,
  candidateManifest,
  rollback,
  rollbackManifest,
  candidateConfig,
  rollbackConfig
] = await Promise.all([
  readFile(paths.source),
  readFile(paths.candidate),
  readJson(paths.candidateManifest),
  readFile(paths.rollback),
  readJson(paths.rollbackManifest),
  readJson(paths.candidateConfig),
  readJson(paths.rollbackConfig)
]);

await Promise.all(Object.entries(paths).map(([label, filePath]) => assertRegularFile(filePath, label)));

assertRulesOnlyConfig(
  candidateConfig,
  ".firebase-deploy/firestore.production.candidate.rules",
  "本番候補Rules専用設定"
);
assertRulesOnlyConfig(
  rollbackConfig,
  ".firebase-deploy/firestore.production.rollback.rules",
  "復旧Rules専用設定"
);

const sourceHash = hash(source);
const candidateHash = hash(candidate);
const rollbackHash = hash(rollback);

if (sourceHash !== candidateHash || candidateManifest.sha256 !== candidateHash) {
  throw new Error("ローカル検証済みルール・本番候補・候補マニフェストが一致しません。再生成してください。");
}
if (rollbackManifest.projectId !== PROJECT_ID || rollbackManifest.releaseName !== RELEASE_NAME) {
  throw new Error("復旧候補の対象プロジェクトまたはFirestoreリリースが固定値と一致しません。");
}
if (rollbackManifest.sha256 !== rollbackHash || rollbackManifest.bytes !== rollback.byteLength) {
  throw new Error("取得済み本番ルールと復旧マニフェストが一致しません。再取得してください。");
}
if (!/^projects\/enzine-schedule\/rulesets\/[^/]+$/.test(rollbackManifest.rulesetName || "")) {
  throw new Error("復旧マニフェストのRuleset名が不正です。");
}
if (JSON.stringify(rollbackManifest.remoteMethods) !== JSON.stringify(["GET"])) {
  throw new Error("復旧マニフェストのリモート取得方法がGETのみではありません。");
}

const candidateText = candidate.toString("utf8");
const rollbackText = rollback.toString("utf8");
const result = {
  rollbackRulesetId: rollbackManifest.rulesetId,
  rollbackSha256: rollbackHash,
  candidateSha256: candidateHash,
  changed: rollbackHash !== candidateHash,
  currentBytes: rollback.byteLength,
  candidateBytes: candidate.byteLength,
  currentMatchCount: countStatements(rollbackText, /\bmatch\s+\//g),
  candidateMatchCount: countStatements(candidateText, /\bmatch\s+\//g),
  currentAllowCount: countStatements(rollbackText, /\ballow\s+/g),
  candidateAllowCount: countStatements(candidateText, /\ballow\s+/g)
};

console.log("Firestoreルール反映前のローカル整合性監査に合格しました。");
console.log(`復旧Ruleset ID: ${result.rollbackRulesetId}`);
console.log(`復旧SHA-256: ${result.rollbackSha256}`);
console.log(`候補のSHA-256: ${result.candidateSha256}`);
console.log(`差分: ${result.changed ? "あり（反映時にルール変更）" : "なし"}`);
console.log(`復旧/候補 bytes: ${result.currentBytes}/${result.candidateBytes}`);
console.log(`復旧/候補 match: ${result.currentMatchCount}/${result.candidateMatchCount}`);
console.log(`復旧/候補 allow: ${result.currentAllowCount}/${result.candidateAllowCount}`);
console.log("候補・復旧ともFirestore Rules専用設定です。ルール本文は表示していません。");
