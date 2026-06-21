// STEP6_READABILITY_FIX_20260620_V35：週一報告の可読性修正
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// STEP7_WEEKLY_REPORT_STABILITY_20260620_V36：返信既読・ロック表示を安定化
// STEP9_WEEKLY_REPORT_WEEKDAY_START_20260620_V38：週一報告の対象期間を月〜金に調整
// STEP18_WEEKLY_REPORT_STATUS_CACHE_20260620_V47：週一報告通知用の集約docを更新
// STEP20_USER_INPUT_ASSISTS_20260620_V49：特になしボタンで入力負担を軽減

const DEFAULT_OFFICE_ID = "engine_chiba";
const DEFAULT_GROUP_ID = "enzine";
const NO_ACTIVITY_VALUE = "わからない/活動なし（追加質問あり）";
const WEEKLY_REPORT_STATUS_COLLECTION = "weeklyReportUserStatus";
const WEEKLY_REPORT_STATUS_SCHEMA_VERSION = 1;

const weeklyReportUserInfo = document.getElementById("weeklyReportUserInfo");
const weeklyReportTitle = document.getElementById("weeklyReportTitle");
const weeklyReportTargetText = document.getElementById("weeklyReportTargetText");
const weeklyReportStatusText = document.getElementById("weeklyReportStatusText");
const weeklyReportForm = document.getElementById("weeklyReportForm");
const weeklyReportMessage = document.getElementById("weeklyReportMessage");
const weeklyReportFeedbackBox = document.getElementById("weeklyReportFeedbackBox");
const weeklyReportFeedbackText = document.getElementById("weeklyReportFeedbackText");
const markFeedbackReadButton = document.getElementById("markFeedbackReadButton");
const weeklyReportReadOnlyBox = document.getElementById("weeklyReportReadOnlyBox");
const weeklyReportReadOnlyText = document.getElementById("weeklyReportReadOnlyText");

const prevReportWeekButton = document.getElementById("prevReportWeekButton");
const currentReportWeekButton = document.getElementById("currentReportWeekButton");
const nextReportWeekButton = document.getElementById("nextReportWeekButton");
const backToUserPageButton = document.getElementById("backToUserPageButton");
const logoutButton = document.getElementById("logoutButton");

const workActivityText = document.getElementById("workActivityText");
const activityTime = document.getElementById("activityTime");
const noActivityReasonLabel = document.getElementById("noActivityReasonLabel");
const noActivityReason = document.getElementById("noActivityReason");
const healthStatus = document.getElementById("healthStatus");
const lifeRhythm = document.getElementById("lifeRhythm");
const selfScore = document.getElementById("selfScore");
const selfScoreButtonGroup = document.getElementById("selfScoreButtonGroup");
const troubleText = document.getElementById("troubleText");
const goodText = document.getElementById("goodText");
const nextWeekText = document.getElementById("nextWeekText");
const otherText = document.getElementById("otherText");
const weeklyQuickFillButtons = document.querySelectorAll("[data-weekly-fill-target]");

// 利用者ページではコピー用テキストを表示しない。
// コピー用テキスト化は支援員ページ側で扱う。
const saveWeeklyReportButton = document.getElementById("saveWeeklyReportButton");

let currentUser = null;
let currentUserData = null;
let baseLastWeekStartDate = null;
let displayedWeekStartDate = null;
let currentLoadedReport = null;

function formatDateId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateId(dateId) {
  const [yyyy, mm, dd] = dateId.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getLastCompletedWeekStartDate() {
  const today = new Date();
  const thisWeekStart = getWeekStartDate(today);
  return addDays(thisWeekStart, -7);
}

function formatJapaneseDate(dateId) {
  const date = parseDateId(dateId);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getJapaneseWeekRange(weekStartDate) {
  const startId = formatDateId(weekStartDate);
  const endId = formatDateId(addDays(weekStartDate, 4));
  return `${formatJapaneseDate(startId)}〜${formatJapaneseDate(endId)}`;
}

function getOfficeId() {
  return currentUserData?.officeId || DEFAULT_OFFICE_ID;
}

function getGroupId() {
  return currentUserData?.groupId || DEFAULT_GROUP_ID;
}

function getWeeklyReportId(userId, weekStartDateId) {
  return `${userId}_${weekStartDateId}`;
}

function getWeeklyReportStatusDocRef(userId) {
  return doc(db, WEEKLY_REPORT_STATUS_COLLECTION, userId);
}

async function mergeWeeklyReportStatusCache(updateData) {
  if (!currentUser || !currentUserData) {
    return;
  }

  try {
    await setDoc(getWeeklyReportStatusDocRef(currentUser.uid), {
      userId: currentUser.uid,
      userName: currentUserData.name || currentUser.email || "",
      userEmail: currentUser.email || "",
      officeId: getOfficeId(),
      groupId: getGroupId(),
      schemaVersion: WEEKLY_REPORT_STATUS_SCHEMA_VERSION,
      ...updateData,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("週一報告ステータス集約docの更新に失敗しました。週一報告本体の保存は完了しています。", error);
  }
}

async function markWeeklyReportSubmittedInStatusCache(weekStartDate) {
  await mergeWeeklyReportStatusCache({
    submittedWeeks: {
      [weekStartDate]: true
    }
  });
}

async function markWeeklyReportFeedbackReadInStatusCache(weekStartDate, feedbackVersion) {
  await mergeWeeklyReportStatusCache({
    submittedWeeks: {
      [weekStartDate]: true
    },
    feedbackVersions: {
      [weekStartDate]: feedbackVersion
    },
    feedbackReadVersions: {
      [weekStartDate]: feedbackVersion
    }
  });
}

function setMessage(text, color = "#333") {
  if (!weeklyReportMessage) {
    return;
  }
  weeklyReportMessage.style.color = color;
  weeklyReportMessage.textContent = text;
}

function isNoActivitySelected() {
  return activityTime.value === NO_ACTIVITY_VALUE;
}

function updateNoActivityReasonVisibility() {
  const visible = isNoActivitySelected();
  noActivityReasonLabel.classList.toggle("hidden", !visible);
  noActivityReason.required = visible;

  if (!visible) {
    noActivityReason.value = "";
  }
}

function setSelfScore(score) {
  selfScore.value = score || "";

  selfScoreButtonGroup.querySelectorAll("[data-score]").forEach((button) => {
    button.classList.toggle("active", button.dataset.score === String(score || ""));
  });
}

function clearForm() {
  workActivityText.value = "";
  activityTime.value = "";
  noActivityReason.value = "";
  healthStatus.value = "";
  lifeRhythm.value = "";
  setSelfScore("");
  troubleText.value = "";
  goodText.value = "";
  nextWeekText.value = "";
  otherText.value = "";
  updateNoActivityReasonVisibility();
}

function fillForm(report) {
  workActivityText.value = report.workActivityText || "";
  activityTime.value = report.activityTime || "";
  noActivityReason.value = report.noActivityReason === "1" ? "" : (report.noActivityReason || "");
  healthStatus.value = report.healthStatus || "";
  lifeRhythm.value = report.lifeRhythm || "";
  setSelfScore(report.selfScore ? String(report.selfScore) : "");
  troubleText.value = report.troubleText || "";
  goodText.value = report.goodText || "";
  nextWeekText.value = report.nextWeekText || "";
  otherText.value = report.otherText || "";
  updateNoActivityReasonVisibility();
}

function buildCopyText(report) {
  if (!report) {
    return "";
  }

  const noActivityReasonText = hasMeaningfulNoActivityReason(report)
    ? report.noActivityReason
    : "";

  return [
    "【週一報告】",
    `氏名：${report.userName || ""}`,
    `対象週：${formatJapaneseDate(report.weekStartDate)}〜${formatJapaneseDate(report.weekEndDate)}`,
    "",
    "先週、どんな作業や活動をしましたか？",
    report.workActivityText || "",
    "",
    "先週の作業・活動時間の目安",
    report.activityTime || "",
    "",
    "活動なしと答えた方へ",
    noActivityReasonText,
    "",
    "先週の体調や生活リズム",
    report.healthStatus || "",
    "",
    "生活リズムについて",
    report.lifeRhythm || "",
    "",
    "先週の自己採点",
    report.selfScore ? String(report.selfScore) : "",
    "",
    "困ったこと・しんどかったこと",
    report.troubleText || "",
    "",
    "できたこと・がんばれたこと",
    report.goodText || "",
    "",
    "今週意識したいこと、取り組みたいこと",
    report.nextWeekText || "",
    "",
    "その他伝えたいこと、質問など",
    report.otherText || ""
  ].join("\n");
}

function renderCopyText(_report) {
  // 利用者にはコピー用テキストを表示しない。
}

function escapeWeeklyReportText(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hasMeaningfulNoActivityReason(report) {
  const reason = String(report?.noActivityReason || "").trim();
  return Boolean(reason && reason !== "1");
}

function isFeedbackUnreadByUser(report) {
  if (!report || !report.staffFeedbackText || !report.staffFeedbackVersion) {
    return false;
  }

  if (report.feedbackReadByUser === true) {
    return false;
  }

  return Boolean(
    report.staffFeedbackReadVersion !== report.staffFeedbackVersion
  );
}

function isReportLockedByStaffFeedback(report) {
  return Boolean(report?.locked === true || report?.staffFeedbackText);
}

function buildReadableWeeklyReportItem(label, value, options = {}) {
  const text = String(value || "").trim();
  if (!text && options.hideIfEmpty) {
    return "";
  }

  const displayValue = text || "未入力";
  const inlineClass = options.inline ? " inline" : "";

  return `
    <div class="weekly-report-readable-item${inlineClass}">
      <div class="weekly-report-readable-label">・${escapeWeeklyReportText(label)}</div>
      <div class="weekly-report-readable-value">${escapeWeeklyReportText(displayValue)}</div>
    </div>
  `;
}

function buildWeeklyReportReadableHtml(report) {
  if (!report) {
    return "";
  }

  const items = [];

  items.push(buildReadableWeeklyReportItem("作業・活動", report.workActivityText));
  items.push(buildReadableWeeklyReportItem("活動時間", report.activityTime, { inline: true }));

  if (hasMeaningfulNoActivityReason(report)) {
    items.push(buildReadableWeeklyReportItem("活動なし理由", report.noActivityReason));
  }

  items.push(buildReadableWeeklyReportItem("体調・生活リズム", report.healthStatus));
  items.push(buildReadableWeeklyReportItem("生活リズム詳細", report.lifeRhythm));
  items.push(buildReadableWeeklyReportItem("自己採点", report.selfScore ? `${report.selfScore}/5` : "", { inline: true }));
  items.push(buildReadableWeeklyReportItem("困ったこと・しんどかったこと", report.troubleText));
  items.push(buildReadableWeeklyReportItem("できたこと・がんばれたこと", report.goodText));
  items.push(buildReadableWeeklyReportItem("今週意識したいこと", report.nextWeekText));
  items.push(buildReadableWeeklyReportItem("その他", report.otherText, { hideIfEmpty: true }));

  return `<div class="weekly-report-readable-card">${items.join("")}</div>`;
}

function setWeeklyReportFormVisible(visible) {
  const formSection = weeklyReportForm?.closest(".weekly-report-form-box");
  if (formSection) {
    formSection.classList.toggle("hidden", !visible);
  }

  if (saveWeeklyReportButton) {
    saveWeeklyReportButton.disabled = !visible;
  }
}

function renderReadOnlyReport(report) {
  const locked = isReportLockedByStaffFeedback(report);

  if (!weeklyReportReadOnlyBox || !weeklyReportReadOnlyText) {
    setWeeklyReportFormVisible(!locked);
    return;
  }

  if (!locked || !report?.submitted) {
    weeklyReportReadOnlyBox.classList.add("hidden");
    weeklyReportReadOnlyText.innerHTML = "";
    setWeeklyReportFormVisible(true);
    return;
  }

  weeklyReportReadOnlyText.innerHTML = buildWeeklyReportReadableHtml(report);
  weeklyReportReadOnlyBox.classList.remove("hidden");
  setWeeklyReportFormVisible(false);
}

function renderFeedback(report) {
  if (!weeklyReportFeedbackBox || !weeklyReportFeedbackText) {
    return;
  }

  const feedbackText = String(report?.staffFeedbackText || "").trim();

  if (!feedbackText) {
    weeklyReportFeedbackBox.classList.add("hidden");
    weeklyReportFeedbackText.textContent = "";
    if (markFeedbackReadButton) {
      markFeedbackReadButton.classList.add("hidden");
    }
    return;
  }

  weeklyReportFeedbackText.textContent = feedbackText;
  weeklyReportFeedbackBox.classList.remove("hidden");

  if (markFeedbackReadButton) {
    const unread = isFeedbackUnreadByUser(report);
    markFeedbackReadButton.classList.toggle("hidden", !unread);
    markFeedbackReadButton.textContent = unread ? "返信を確認しました" : "確認済みです";
    markFeedbackReadButton.disabled = !unread;
  }
}

function resetFeedbackAndReadOnly() {
  if (weeklyReportFeedbackBox) {
    weeklyReportFeedbackBox.classList.add("hidden");
  }
  if (weeklyReportFeedbackText) {
    weeklyReportFeedbackText.textContent = "";
  }
  if (weeklyReportReadOnlyBox) {
    weeklyReportReadOnlyBox.classList.add("hidden");
  }
  if (weeklyReportReadOnlyText) {
    weeklyReportReadOnlyText.innerHTML = "";
  }
  if (markFeedbackReadButton) {
    markFeedbackReadButton.classList.add("hidden");
    markFeedbackReadButton.disabled = false;
  }
  setWeeklyReportFormVisible(true);
}
function updateWeekHeader() {
  const weekStartId = formatDateId(displayedWeekStartDate);
  const weekEndId = formatDateId(addDays(displayedWeekStartDate, 4));
  const isLastWeek = weekStartId === formatDateId(baseLastWeekStartDate);

  weeklyReportTitle.textContent = isLastWeek ? "先週分の報告" : "過去の週一報告";
  weeklyReportTargetText.textContent = `対象週：${getJapaneseWeekRange(displayedWeekStartDate)}`;

  if (nextReportWeekButton) {
    nextReportWeekButton.disabled = displayedWeekStartDate >= baseLastWeekStartDate;
  }
}

async function loadWeeklyReport() {
  if (!currentUser || !displayedWeekStartDate) {
    return;
  }

  updateWeekHeader();
  clearForm();
  currentLoadedReport = null;
  weeklyReportStatusText.textContent = "読み込み中...";
  setMessage("");
  renderCopyText(null);
  resetFeedbackAndReadOnly();

  try {
    const weekStartDate = formatDateId(displayedWeekStartDate);
    const reportId = getWeeklyReportId(currentUser.uid, weekStartDate);
    const docRef = doc(db, "weeklyReports", reportId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      weeklyReportStatusText.textContent = "未記入です。入力して保存してください。";
      weeklyReportStatusText.className = "weekly-report-status-text weekly-report-unsubmitted";
      console.log(`[Read節約] 週一報告：${reportId} を直接1 read。未作成なので未記入扱いです。`);
      return;
    }

    currentLoadedReport = {
      id: docSnap.id,
      ...docSnap.data()
    };

    fillForm(currentLoadedReport);
    renderCopyText(currentLoadedReport);
    renderFeedback(currentLoadedReport);
    renderReadOnlyReport(currentLoadedReport);

    if (isReportLockedByStaffFeedback(currentLoadedReport)) {
      weeklyReportStatusText.textContent = "支援員から返信があります。この報告は修正できません。";
      weeklyReportStatusText.className = "weekly-report-status-text weekly-report-submitted";
    } else {
      weeklyReportStatusText.textContent = "記入済みです。内容を修正して再保存できます。";
      weeklyReportStatusText.className = "weekly-report-status-text weekly-report-submitted";
    }

    console.log(`[Read節約] 週一報告：${reportId} を直接1 read。一覧クエリは使っていません。`);
  } catch (error) {
    console.error("週一報告読み込みエラー:", error);
    weeklyReportStatusText.textContent = `読み込みに失敗しました：${error.code || error.message}`;
    weeklyReportStatusText.className = "weekly-report-status-text weekly-report-error";
  }
}

function validateForm() {
  if (!workActivityText.value.trim()) {
    return "先週の作業や活動を入力してください。";
  }

  if (!activityTime.value) {
    return "作業・活動時間の目安を選択してください。";
  }

  if (isNoActivitySelected() && !noActivityReason.value.trim()) {
    return "活動なしの場合は、活動ができなかった理由を入力してください。";
  }

  if (!healthStatus.value) {
    return "体調や生活リズムを選択してください。";
  }

  if (!lifeRhythm.value) {
    return "生活リズムの詳細を選択してください。";
  }

  if (!selfScore.value) {
    return "自己採点を選択してください。";
  }

  if (!troubleText.value.trim()) {
    return "困ったこと・しんどかったことを入力してください。特になければ「特になし」と入力してください。";
  }

  if (!goodText.value.trim()) {
    return "できたこと・がんばれたことを入力してください。";
  }

  if (!nextWeekText.value.trim()) {
    return "今週意識したいこと、取り組みたいことを入力してください。";
  }

  return "";
}

async function saveWeeklyReport(event) {
  event.preventDefault();

  if (!currentUser || !currentUserData) {
    setMessage("ログイン情報が確認できません。再ログインしてください。", "red");
    return;
  }

  if (isReportLockedByStaffFeedback(currentLoadedReport)) {
    setMessage("支援員から返信があるため、この報告は修正できません。内容は提出済み欄で確認できます。", "red");
    return;
  }

  const validationMessage = validateForm();
  if (validationMessage) {
    setMessage(validationMessage, "red");
    return;
  }

  const weekStartDate = formatDateId(displayedWeekStartDate);
  const weekEndDate = formatDateId(addDays(displayedWeekStartDate, 4));
  const reportDueDate = formatDateId(addDays(displayedWeekStartDate, 7));
  const reportId = getWeeklyReportId(currentUser.uid, weekStartDate);

  const reportData = {
    userId: currentUser.uid,
    userName: currentUserData.name || currentUser.email || "",
    userEmail: currentUser.email || "",
    officeId: getOfficeId(),
    groupId: getGroupId(),
    weekStartDate: weekStartDate,
    weekEndDate: weekEndDate,
    reportDueDate: reportDueDate,
    workActivityText: workActivityText.value.trim(),
    activityTime: activityTime.value,
    noActivityReason: isNoActivitySelected() ? noActivityReason.value.trim() : "1",
    healthStatus: healthStatus.value,
    lifeRhythm: lifeRhythm.value,
    selfScore: Number(selfScore.value),
    troubleText: troubleText.value.trim(),
    goodText: goodText.value.trim(),
    nextWeekText: nextWeekText.value.trim(),
    otherText: otherText.value.trim(),
    submitted: true,
    submittedAt: currentLoadedReport?.submittedAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    saveWeeklyReportButton.disabled = true;
    saveWeeklyReportButton.textContent = "保存中...";

    await setDoc(doc(db, "weeklyReports", reportId), reportData, { merge: true });
    await markWeeklyReportSubmittedInStatusCache(weekStartDate);

    currentLoadedReport = {
      id: reportId,
      ...reportData,
      submittedAt: currentLoadedReport?.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    weeklyReportStatusText.textContent = "記入済みです。内容を修正して再保存できます。";
    weeklyReportStatusText.className = "weekly-report-status-text weekly-report-submitted";
    renderCopyText(currentLoadedReport);
    renderFeedback(currentLoadedReport);
    renderReadOnlyReport(currentLoadedReport);
    setMessage("週一報告を保存しました。", "green");
    console.log(`[Read節約] 週一報告保存：${reportId} に1 write。保存後の再読み込みはせず、画面上のデータを更新しました。`);
  } catch (error) {
    console.error("週一報告保存エラー:", error);
    setMessage(`保存に失敗しました：${error.code || error.message}`, "red");
  } finally {
    saveWeeklyReportButton.disabled = false;
    saveWeeklyReportButton.textContent = "週一報告を保存";
  }
}

function changeDisplayedWeek(offsetWeeks) {
  const nextWeekStart = addDays(displayedWeekStartDate, offsetWeeks * 7);

  // 未来週の報告は作らない。最新は「先週分」まで。
  if (nextWeekStart > baseLastWeekStartDate) {
    return;
  }

  displayedWeekStartDate = nextWeekStart;
  loadWeeklyReport();
}

function getRequestedWeekStartDate() {
  const params = new URLSearchParams(window.location.search);
  const weekStart = params.get("weekStart");

  if (!weekStart) {
    return null;
  }

  try {
    const parsed = getWeekStartDate(parseDateId(weekStart));
    if (parsed > baseLastWeekStartDate) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

async function markStaffFeedbackAsRead() {
  if (!currentUser || !currentLoadedReport || !currentLoadedReport.staffFeedbackVersion) {
    return;
  }

  try {
    const weekStartDate = formatDateId(displayedWeekStartDate);
    const reportId = getWeeklyReportId(currentUser.uid, weekStartDate);

    await setDoc(doc(db, "weeklyReports", reportId), {
      userId: currentUser.uid,
      feedbackReadByUser: true,
      feedbackReadAt: serverTimestamp(),
      staffFeedbackReadVersion: currentLoadedReport.staffFeedbackVersion,
      staffFeedbackReadAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await markWeeklyReportFeedbackReadInStatusCache(weekStartDate, currentLoadedReport.staffFeedbackVersion);

    currentLoadedReport.staffFeedbackReadVersion = currentLoadedReport.staffFeedbackVersion;
    currentLoadedReport.staffFeedbackReadAt = new Date().toISOString();
    currentLoadedReport.feedbackReadByUser = true;
    currentLoadedReport.feedbackReadAt = new Date().toISOString();
    renderFeedback(currentLoadedReport);
    renderReadOnlyReport(currentLoadedReport);
    setMessage("支援員からの返信を確認済みにしました。", "green");
  } catch (error) {
    console.error("返信確認エラー:", error);
    setMessage(`返信確認に失敗しました：${error.code || error.message}`, "red");
  }
}

activityTime.addEventListener("change", updateNoActivityReasonVisibility);

selfScoreButtonGroup.querySelectorAll("[data-score]").forEach((button) => {
  button.addEventListener("click", () => {
    setSelfScore(button.dataset.score);
  });
});

weeklyQuickFillButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.weeklyFillTarget;
    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    target.value = button.dataset.weeklyFillValue || "";
    target.focus();
  });
});

weeklyReportForm.addEventListener("submit", saveWeeklyReport);

prevReportWeekButton.addEventListener("click", () => {
  changeDisplayedWeek(-1);
});

currentReportWeekButton.addEventListener("click", () => {
  displayedWeekStartDate = new Date(baseLastWeekStartDate);
  loadWeeklyReport();
});

nextReportWeekButton.addEventListener("click", () => {
  changeDisplayedWeek(1);
});

if (markFeedbackReadButton) {
  markFeedbackReadButton.addEventListener("click", () => {
    markStaffFeedbackAsRead();
  });
}

backToUserPageButton.addEventListener("click", () => {
  window.location.href = "user.html";
});

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    currentUser = user;

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      alert("ユーザー情報が登録されていません。");
      window.location.href = "index.html";
      return;
    }

    currentUserData = userDocSnap.data();

    if (currentUserData.active !== true) {
      alert("このアカウントは現在利用できません。");
      window.location.href = "index.html";
      return;
    }

    if (currentUserData.role !== "user") {
      window.location.href = "staff.html";
      return;
    }

    weeklyReportUserInfo.textContent = `${currentUserData.name || user.email}さん`;

    baseLastWeekStartDate = getLastCompletedWeekStartDate();
    displayedWeekStartDate = getRequestedWeekStartDate() || new Date(baseLastWeekStartDate);

    await loadWeeklyReport();
  } catch (error) {
    console.error("週一報告ページ初期化エラー:", error);
    setMessage(`読み込みに失敗しました：${error.code || error.message}`, "red");
  }
});
