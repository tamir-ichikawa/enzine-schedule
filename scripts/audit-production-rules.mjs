import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRulesPath = path.join(projectRoot, "firestore.emulator.rules");
const candidateRulesPath = path.join(projectRoot, ".firebase-deploy", "firestore.production.candidate.rules");
const candidateConfigPath = path.join(projectRoot, "firebase.production.firestore.rules.candidate.json");

const [sourceRules, candidateRules, candidateConfigText] = await Promise.all([
  readFile(sourceRulesPath),
  readFile(candidateRulesPath),
  readFile(candidateConfigPath, "utf8")
]);
const candidateConfig = JSON.parse(candidateConfigText);
const hash = (value) => createHash("sha256").update(value).digest("hex");

if (hash(sourceRules) !== hash(candidateRules)) {
  throw new Error("本番ルール候補がローカル検証済みルールと一致しません。");
}

if (candidateConfig.firestore?.rules !== ".firebase-deploy/firestore.production.candidate.rules") {
  throw new Error("本番候補設定が生成済みルールを参照していません。");
}

if (JSON.stringify(Object.keys(candidateConfig)) !== JSON.stringify(["firestore"])) {
  throw new Error("本番候補設定にFirestore以外のデプロイ対象が含まれています。");
}

const rulesText = candidateRules.toString("utf8");
const requiredSafetyPatterns = [
  /caller\(\)\.accessScope == 'global'/,
  /allow get: if systemId == 'maintenanceMode'/,
  /allow create, update: if systemId != 'maintenanceMode'/,
  /match \/\{document=\*\*\} \{\s*allow read, write: if false;/s
];

for (const pattern of requiredSafetyPatterns) {
  if (!pattern.test(rulesText)) {
    throw new Error(`本番候補ルールの安全条件が不足しています: ${pattern}`);
  }
}

if (/systemId == 'billingSafety'/.test(rulesText)) {
  throw new Error("課金安全チェックに全体管理者以外の個別許可が残っています。");
}

if (!/allow delete: if systemId != 'maintenanceMode' && isGlobalAdmin\(\);/.test(rulesText)) {
  throw new Error("メンテナンス設定の直接削除を拒否する条件が不足しています。");
}

console.log("Firestore本番候補ルール監査に合格しました。");
console.log(`検証済みルールと同一SHA-256: ${hash(candidateRules)}`);
