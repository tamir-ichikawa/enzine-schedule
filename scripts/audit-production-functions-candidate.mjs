import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPECTED_FILES = ["chatwork.js", "index.js", "package-lock.json", "package.json"];
const EXPECTED_FUNCTIONS = [
  "auditBillingSafetyWrite",
  "auditManagedUserWrite",
  "createAuthUserAndProfile",
  "createOfficeAdminAccount",
  "getAdminAuditLogs",
  "getChatworkConsoleData",
  "getChatworkWeeklyReportMissingGroup",
  "getCurrentOfficeBrand",
  "getOrganizationManagementData",
  "migrateLegacyOfficeIdToEnzineChiba",
  "saveChatworkIntegrationConfig",
  "sendChatworkMessage",
  "setMaintenanceMode",
  "upsertOffice",
  "upsertOrganization"
].sort();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "functions");
const candidateRoot = path.join(projectRoot, ".firebase-deploy", "functions");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function listRelativeFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Functions候補にシンボリックリンクがあります。");
    if (entry.isDirectory() && current === root && entry.name === "node_modules") continue;
    if (entry.isDirectory()) throw new Error("Functions候補に許可されていないディレクトリがあります。");
    else if (entry.isFile()) files.push(path.relative(root, entryPath).split(path.sep).join("/"));
    else throw new Error("Functions候補に通常ファイル以外があります。");
  }
  return files.sort();
}

const candidateFiles = await listRelativeFiles(candidateRoot);
if (JSON.stringify(candidateFiles) !== JSON.stringify(EXPECTED_FILES)) {
  throw new Error(`Functions候補のファイル一覧が不正です: ${candidateFiles.join(", ")}`);
}
for (const file of EXPECTED_FILES) {
  const [source, candidate] = await Promise.all([
    fs.readFile(path.join(sourceRoot, file)),
    fs.readFile(path.join(candidateRoot, file))
  ]);
  if (sha256(source) !== sha256(candidate)) {
    throw new Error(`Functions候補が元ファイルと一致しません: ${file}`);
  }
}

const indexSource = await fs.readFile(path.join(candidateRoot, "index.js"), "utf8");
const exportedFunctions = [...indexSource.matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm)]
  .map((match) => match[1])
  .sort();
if (JSON.stringify(exportedFunctions) !== JSON.stringify(EXPECTED_FUNCTIONS)) {
  throw new Error("Functions候補のexport一覧が想定と異なります。");
}

console.log(`Functions候補監査: 合格（${candidateFiles.length}ファイル / ${exportedFunctions.length} Functions）`);
console.log("配布対象: chatwork.js、index.js、package.json、package-lock.jsonのみ");
console.log("secret・env・ローカル設定: 候補に含まれず、node_modules: upload ignore対象");
