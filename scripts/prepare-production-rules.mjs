import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRulesPath = path.join(projectRoot, "firestore.emulator.rules");
const deployRoot = path.join(projectRoot, ".firebase-deploy");
const candidateRulesPath = path.join(deployRoot, "firestore.production.candidate.rules");
const metadataPath = path.join(deployRoot, "firestore-rules-manifest.json");

const sourceStat = await lstat(sourceRulesPath);

if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
  throw new Error("Firestoreルール元は通常ファイルである必要があります。");
}

await mkdir(deployRoot, { recursive: true });
await copyFile(sourceRulesPath, candidateRulesPath);

const content = await readFile(sourceRulesPath);
const metadata = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "firestore.emulator.rules",
  candidate: ".firebase-deploy/firestore.production.candidate.rules",
  bytes: content.byteLength,
  sha256: createHash("sha256").update(content).digest("hex")
};

await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log("ローカル検証済みルールから本番候補を生成しました。");
console.log(`SHA-256: ${metadata.sha256}`);
