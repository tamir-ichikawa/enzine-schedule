import { access, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "functions", ".secret.local.example");
const targetPath = path.join(projectRoot, "functions", ".secret.local");

try {
  await access(targetPath, constants.F_OK);
} catch {
  await copyFile(sourcePath, targetPath);
  console.log("ローカル専用の無効なFunctionsシークレットを準備しました。");
}
