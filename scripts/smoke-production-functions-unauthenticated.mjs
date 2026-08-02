const PROJECT_ID = "enzine-schedule";
const REGION = "asia-northeast1";
const NEW_PROTECTED_FUNCTIONS = [
  "createOfficeAdminAccount",
  "getAdminAuditLogs",
  "getCurrentOfficeBrand",
  "getOrganizationManagementData",
  "setMaintenanceMode",
  "upsertOffice",
  "upsertOrganization"
];

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("TLS検証が無効な環境では本番Functionsを確認できません。");
  process.exit(1);
}
if (!process.execArgv.includes("--use-system-ca")) {
  console.error("Windowsの信頼済み証明書を使う --use-system-ca が必要です。");
  process.exit(1);
}

async function verifyUnauthenticatedRejection(functionName) {
  let response;
  try {
    response = await fetch(
      `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({ data: {} }),
        signal: AbortSignal.timeout(45_000)
      }
    );
  } catch {
    throw new Error(`${functionName}: network`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${functionName}: invalid-json`);
  }
  const errorStatus = String(payload?.error?.status || "").toUpperCase();
  if (response.status !== 401 || errorStatus !== "UNAUTHENTICATED") {
    throw new Error(`${functionName}: unexpected-response-${response.status}`);
  }
  return functionName;
}

try {
  const verified = await Promise.all(NEW_PROTECTED_FUNCTIONS.map(verifyUnauthenticatedRejection));
  console.log(`本番新規Functions認証ガード: ${verified.length}件すべて合格`);
  for (const name of verified.sort()) console.log(`- ${name}: 未認証を拒否`);
  console.log("認証情報・個人情報・変更入力は送信していません。本番データ変更なし");
} catch (error) {
  const safeMessage = NEW_PROTECTED_FUNCTIONS.find((name) => String(error?.message || "").startsWith(`${name}:`))
    || "unknown";
  console.error(`本番新規Functions認証ガード確認に失敗しました（対象: ${safeMessage}）。`);
  console.error("応答本文・URL・認証情報は表示していません。本番データ変更入力は送信していません。");
  process.exitCode = 1;
}
