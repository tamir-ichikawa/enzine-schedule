import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const publicRoot = path.join(deployRoot, "public");
const manifestPath = path.join(deployRoot, "hosting-manifest.json");
const candidateConfigPath = path.join(projectRoot, "firebase.production.candidate.json");
const previewConfigPath = path.join(projectRoot, "firebase.production.hosting.preview.json");
const liveConfigPath = path.join(projectRoot, "firebase.production.hosting.live.json");

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath, root));
    } else if (entry.isFile()) {
      files.push(path.relative(root, entryPath).split(path.sep).join("/"));
    } else {
      throw new Error(`配布物に通常ファイル以外が含まれています: ${entryPath}`);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "en"));
}

const [manifestText, configText, previewConfigText, liveConfigText, actualFiles] = await Promise.all([
  readFile(manifestPath, "utf8"),
  readFile(candidateConfigPath, "utf8"),
  readFile(previewConfigPath, "utf8"),
  readFile(liveConfigPath, "utf8"),
  listFiles(publicRoot)
]);
const manifest = JSON.parse(manifestText);
const candidateConfig = JSON.parse(configText);
const previewConfig = JSON.parse(previewConfigText);
const liveConfig = JSON.parse(liveConfigText);
const manifestFiles = manifest.files.map((entry) => entry.path).sort((a, b) => a.localeCompare(b, "en"));

if (candidateConfig.hosting?.public !== ".firebase-deploy/public") {
  throw new Error("本番候補Hostingのpublicが許可リスト配布フォルダではありません。");
}

if (JSON.stringify(Object.keys(previewConfig)) !== JSON.stringify(["hosting"])) {
  throw new Error("プレビュー設定はHostingだけである必要があります。");
}

if (previewConfig.hosting?.site !== "enzine-schedule") {
  throw new Error("プレビュー設定のHostingサイトが固定されていません。");
}

if (previewConfig.hosting?.public !== ".firebase-deploy/public") {
  throw new Error("プレビュー設定のpublicが許可リスト配布フォルダではありません。");
}

const previewComparable = { ...previewConfig.hosting };
delete previewComparable.site;
if (JSON.stringify(previewComparable) !== JSON.stringify(candidateConfig.hosting)) {
  throw new Error("プレビュー設定と本番候補のHosting設定が一致しません。");
}

if (JSON.stringify(liveConfig) !== JSON.stringify(previewConfig)) {
  throw new Error("live設定と検証済みプレビュー設定が一致しません。");
}

if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
  throw new Error("配布フォルダの内容が生成時マニフェストと一致しません。");
}

const forbiddenPatterns = [
  /(^|\/)scripts\//i,
  /(^|\/)tests\//i,
  /(^|\/)functions\//i,
  /(^|\/)node_modules\//i,
  /\.md$/i,
  /(^|\/)package(?:-lock)?\.json$/i,
  /firebase.*\.json$/i,
  /firestore.*\.rules$/i,
  /\.env/i,
  /secret/i
];
const forbiddenFiles = actualFiles.filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));

if (forbiddenFiles.length) {
  throw new Error(`公開禁止ファイルが配布物に含まれています: ${forbiddenFiles.join(", ")}`);
}

for (const requiredFile of [
  "index.html",
  "firebase-config.js",
  "maintenance.html",
  "maintenance-admin-login.html"
]) {
  if (!actualFiles.includes(requiredFile)) {
    throw new Error(`必須公開ファイルがありません: ${requiredFile}`);
  }
}

console.log(`Hosting公開範囲監査に合格しました: ${actualFiles.length}ファイル`);
console.log("scripts/tests/docs/rules/package/secret系ファイルは含まれていません。");
