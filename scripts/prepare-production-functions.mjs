import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "functions");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const candidateRoot = path.join(deployRoot, "functions");
const allowedFiles = ["chatwork.js", "index.js", "package-lock.json", "package.json"];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

await rm(candidateRoot, { recursive: true, force: true });
await mkdir(candidateRoot, { recursive: true });

const manifestFiles = [];
for (const file of allowedFiles) {
  const sourcePath = path.join(sourceRoot, file);
  const destinationPath = path.join(candidateRoot, file);
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Functions候補元は通常ファイルである必要があります: ${file}`);
  }
  await copyFile(sourcePath, destinationPath);
  const contents = await readFile(sourcePath);
  manifestFiles.push({ file, bytes: contents.byteLength, sha256: sha256(contents) });
}

const packageData = JSON.parse(await readFile(path.join(candidateRoot, "package.json"), "utf8"));
if (packageData.main !== "index.js" || packageData.engines?.node !== "22") {
  throw new Error("Functions候補のmainまたはNode runtimeが想定と異なります。");
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "functions",
  candidate: ".firebase-deploy/functions",
  allowedFiles,
  files: manifestFiles
};
await writeFile(
  path.join(deployRoot, "functions-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`本番候補Functionsを許可リストから準備しました: ${allowedFiles.length}ファイル`);
console.log("secret・env・node_modules・ローカル設定: 配布対象外");
