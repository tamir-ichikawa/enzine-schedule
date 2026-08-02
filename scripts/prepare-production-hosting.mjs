import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const publicRoot = path.join(deployRoot, "public");

const publicFiles = [
  "admin.html",
  "admin.js",
  "auth.js",
  "chatwork.html",
  "chatwork.js",
  "enzine_icon.png",
  "firebase-config.js",
  "firebase-emulator-mode.js",
  "index.html",
  "maintenance-admin-auth.js",
  "maintenance-admin-login.html",
  "maintenance.html",
  "maintenance.js",
  "schedule.js",
  "staff.html",
  "staff.js",
  "style.css",
  "ui-mode-bootstrap.js",
  "ui-common.js",
  "user.html",
  "weekly-report.html",
  "weekly-report.js",
  "workshops.html",
  "workshops.js"
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function assertRegularSourceFile(sourcePath) {
  const sourceStat = await lstat(sourcePath);

  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`公開元は通常ファイルである必要があります: ${sourcePath}`);
  }
}

async function copyPublicFile(relativePath, manifest) {
  const sourcePath = path.resolve(projectRoot, relativePath);
  const destinationPath = path.resolve(publicRoot, relativePath);
  const relativeFromProject = path.relative(projectRoot, sourcePath);

  if (relativeFromProject.startsWith("..") || path.isAbsolute(relativeFromProject)) {
    throw new Error(`公開元がプロジェクト外です: ${relativePath}`);
  }

  await assertRegularSourceFile(sourcePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);

  const content = await readFile(sourcePath);
  manifest.push({
    path: toPosix(relativePath),
    bytes: content.byteLength,
    sha256: sha256(content)
  });
}

const publicRootRelative = path.relative(projectRoot, publicRoot);

if (publicRootRelative.startsWith("..") || path.isAbsolute(publicRootRelative)) {
  throw new Error("配布フォルダがプロジェクト外を指しています。");
}

await rm(publicRoot, { recursive: true, force: true });
await unlink(path.join(deployRoot, "hosting-manifest.json")).catch((error) => {
  if (error?.code !== "ENOENT") {
    throw error;
  }
});
await mkdir(publicRoot, { recursive: true });

const manifest = [];

for (const relativePath of publicFiles) {
  await copyPublicFile(relativePath, manifest);
}

const manifestData = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  publicRoot: toPosix(path.relative(projectRoot, publicRoot)),
  files: manifest
};

await writeFile(
  path.join(deployRoot, "hosting-manifest.json"),
  `${JSON.stringify(manifestData, null, 2)}\n`,
  "utf8"
);

console.log(`本番候補Hosting配布物を準備しました: ${manifest.length}ファイル`);
console.log(`配布元: ${manifestData.publicRoot}`);
