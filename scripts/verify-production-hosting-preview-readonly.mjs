import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hostingUrl = String(process.argv[2] || "").replace(/\/$/, "");
const allowedUrl = /^https:\/\/(?:enzine-schedule|enzine-schedule--multi-office-20260802-[a-z0-9]+)\.web\.app$/;
const files = ["index.html", "admin.html", "admin.js", "style.css"];

if (!allowedUrl.test(hostingUrl)) {
  console.error("許可された本番liveまたは期限付きプレビューURLが必要です。");
  process.exit(1);
}
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境ではプレビューを確認できません。");
  process.exit(1);
}
if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const results = await Promise.all(files.map(async (file) => {
  const response = await fetch(`${hostingUrl}/${file}`, {
    signal: AbortSignal.timeout(30_000)
  });
  const remote = Buffer.from(await response.arrayBuffer());
  const local = await readFile(path.join(projectRoot, ".firebase-deploy", "public", file));
  return {
    file,
    status: response.status,
    hashMatches: sha256(remote) === sha256(local),
    headers: response.headers
  };
}));

for (const result of results) {
  if (result.status !== 200 || !result.hashMatches) {
    throw new Error(`${result.file}: 配信内容が候補と一致しません。`);
  }
  console.log(`${result.file}: HTTP 200 / SHA-256一致`);
}

const headers = results[0].headers;
const expectedHeaders = new Map([
  ["cache-control", "no-store, max-age=0"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "no-referrer"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
  ["x-robots-tag", "noindex"]
]);

for (const [name, expected] of expectedHeaders) {
  const actual = String(headers.get(name) || "");
  if (!actual.split(",").map((value) => value.trim()).join(", ").includes(expected)) {
    throw new Error(`${name}: セキュリティヘッダーが候補と一致しません（値: ${actual || "なし"}）。`);
  }
}

console.log("Hostingの配信内容とセキュリティヘッダー: 合格");
console.log("実行内容: 本番liveまたは期限付きプレビューへのGETのみ。本番データ変更なし");
