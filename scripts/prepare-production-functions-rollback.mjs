import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const rollbackRoot = path.join(deployRoot, "functions-rollback");
const allowedFiles = ["chatwork.js", "index.js", "package-lock.json", "package.json"];
const EXPECTED_ROLLBACK_FUNCTIONS = [
  "createAuthUserAndProfile",
  "getChatworkConsoleData",
  "getChatworkWeeklyReportMissingGroup",
  "migrateLegacyOfficeIdToEnzineChiba",
  "saveChatworkIntegrationConfig",
  "sendChatworkMessage"
].sort();

function gitOutput(args, stage) {
  const result = spawnSync("git.exe", args, {
    cwd: projectRoot,
    encoding: null,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0 || !result.stdout?.length) {
    throw new Error(`Functionsロールバック候補を取得できませんでした: ${stage}`);
  }
  return result.stdout;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const commit = gitOutput(["rev-parse", "HEAD"], "commit").toString("utf8").trim();
if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error("ロールバック元commitを安全に確認できませんでした。");
}

await fs.rm(rollbackRoot, { recursive: true, force: true });
await fs.mkdir(rollbackRoot, { recursive: true });
const manifestFiles = [];
for (const file of allowedFiles) {
  const contents = gitOutput(["show", `${commit}:functions/${file}`], file);
  await fs.writeFile(path.join(rollbackRoot, file), contents, { flag: "wx" });
  manifestFiles.push({ file, bytes: contents.byteLength, sha256: sha256(contents) });
}

const rollbackIndex = await fs.readFile(path.join(rollbackRoot, "index.js"), "utf8");
const rollbackFunctions = [...rollbackIndex.matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm)]
  .map((match) => match[1])
  .sort();
if (JSON.stringify(rollbackFunctions) !== JSON.stringify(EXPECTED_ROLLBACK_FUNCTIONS)) {
  throw new Error("ロールバック候補のFunctions一覧が現在の本番基準と一致しません。");
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCommit: commit,
  candidate: ".firebase-deploy/functions-rollback",
  allowedFiles,
  functions: rollbackFunctions,
  files: manifestFiles
};
await fs.writeFile(
  path.join(deployRoot, "functions-rollback-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Functionsロールバック候補: 準備完了（${allowedFiles.length}ファイル / ${rollbackFunctions.length} Functions）`);
console.log(`ロールバック元commit: ${commit}`);
console.log("secret・env・node_modules・ローカル設定: 配布対象外");
