// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる
// STEP32_WORKSHOP_CASE_COMPLETE_HIDE_20260621_V62：完了案件を提出期限一覧から除外
// STEP31_WORKSHOP_CASE_DEADLINE_PREVIEW_20260621_V61：案件納期から提出期限一覧を表示
// STEP29_CASE_DRAFT_COMPAT_20260621_V59：支援員側の案件下書き作成と互換
// STEP28_WORKSHOP_LIST_DETAIL_20260621_V58：ワークショップ一覧→詳細表示 / 案件情報対応
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { setupSettingsMenuClose } from "./ui-common.js?v=80";

const DEFAULT_OFFICE_ID = "engine_chiba";
const WORKSHOP_RESOURCES_DOC_PREFIX = "workshopResources_";

const workshopUserInfo = document.getElementById("workshopUserInfo");
const workshopResourceList = document.getElementById("workshopResourceList");
const workshopResourceMessage = document.getElementById("workshopResourceMessage");
const backToScheduleButton = document.getElementById("backToScheduleButton");
const logoutButton = document.getElementById("logoutButton");

setupSettingsMenuClose();

let currentUserData = null;
let workshopResourcesCache = {
  schemaVersion: 2,
  workshops: [],
  cases: [],
  guides: []
};
let selectedWorkshopId = "";

function getOfficeId() {
  return currentUserData?.officeId || DEFAULT_OFFICE_ID;
}

function getWorkshopResourcesDocId() {
  return `${WORKSHOP_RESOURCES_DOC_PREFIX}${getOfficeId()}`;
}

function escapeText(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDeadline(deadline) {
  const date = deadline.dueDate || "日付未設定";
  const time = deadline.dueTime ? ` ${deadline.dueTime}` : "";
  return `${date}${time}`;
}

function renderEmpty(message) {
  workshopResourceList.innerHTML = `<div class="calendar-filter-empty">${escapeText(message)}</div>`;
}

function clearWorkshopResourceList() {
  workshopResourceList.innerHTML = "";
}

function getActiveItems(items = []) {
  return items.filter((item) => item && item.active !== false);
}

function isCompletedCaseStatus(status) {
  return /納品済|完了|終了/.test(String(status || ""));
}

function getSortedWorkshops() {
  return getActiveItems(workshopResourcesCache.workshops || [])
    .sort((a, b) => {
      const orderA = typeof a.order === "number" ? a.order : 9999;
      const orderB = typeof b.order === "number" ? b.order : 9999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.title || "").localeCompare(b.title || "", "ja");
    });
}

function getWorkshopCases(workshop) {
  if (!workshop) {
    return [];
  }

  const byId = new Map();
  const addCase = (caseItem) => {
    if (!caseItem || caseItem.active === false) {
      return;
    }

    const id = caseItem.id || `${caseItem.caseNo || "case"}_${caseItem.title || "item"}`;
    byId.set(id, {
      ...caseItem,
      id,
      workshopId: caseItem.workshopId || workshop.id
    });
  };

  (workshopResourcesCache.cases || [])
    .filter((caseItem) => (caseItem.workshopId || "") === workshop.id)
    .forEach(addCase);

  // 旧データや手動登録データで workshop.cases に入っている場合も表示する。
  (workshop.cases || []).forEach(addCase);

  return Array.from(byId.values()).sort((a, b) => {
    const noA = String(a.caseNo || "9999").padStart(4, "0");
    const noB = String(b.caseNo || "9999").padStart(4, "0");
    if (noA !== noB) {
      return noA.localeCompare(noB, "ja");
    }
    return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
  });
}

function getWorkshopGuides(workshop) {
  const guides = [];

  getActiveItems(workshopResourcesCache.guides || []).forEach((guide) => {
    if (!guide.workshopId || guide.workshopId === workshop.id) {
      guides.push(guide);
    }
  });

  getActiveItems(workshop.guides || []).forEach((guide) => guides.push(guide));
  return guides;
}

function getWorkshopSummaryCounts(workshop) {
  const caseDeadlineCount = getWorkshopCases(workshop).filter((caseItem) => {
    return caseItem.dueDate && !isCompletedCaseStatus(caseItem.status);
  }).length;
  const activeDeadlineCount = getActiveItems(workshop.deadlines || []).filter((deadline) => {
    return deadline.title || deadline.dueDate || deadline.note;
  }).length;

  return {
    cases: getWorkshopCases(workshop).length,
    links: getActiveItems(workshop.links || []).filter((link) => link.title || link.url).length,
    deadlines: caseDeadlineCount + activeDeadlineCount,
    guides: getWorkshopGuides(workshop).length
  };
}

function appendTextBlock(parent, className, text) {
  if (!text) {
    return;
  }

  const block = document.createElement("div");
  block.className = className;
  block.textContent = text;
  parent.appendChild(block);
}

function appendChip(parent, label) {
  if (!label) {
    return;
  }

  const chip = document.createElement("span");
  chip.className = "workshop-summary-chip";
  chip.textContent = label;
  parent.appendChild(chip);
}

function createSection(titleText) {
  const section = document.createElement("section");
  section.className = "workshop-resource-section";

  const heading = document.createElement("h4");
  heading.textContent = titleText;
  section.appendChild(heading);

  return section;
}

function appendEmptySectionText(section, text) {
  const empty = document.createElement("div");
  empty.className = "workshop-empty-section";
  empty.textContent = text;
  section.appendChild(empty);
}

function createBackButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sub-button workshop-back-button";
  button.textContent = "＜ ワークショップ一覧へ戻る";
  button.addEventListener("click", () => {
    selectedWorkshopId = "";
    renderWorkshopList();
  });
  return button;
}

function createWorkshopListCard(workshop) {
  const counts = getWorkshopSummaryCounts(workshop);
  const card = document.createElement("article");
  card.className = "workshop-resource-card workshop-list-card is-clickable";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${workshop.title || "無題のワークショップ"}の詳細を見る`);

  const title = document.createElement("h3");
  title.className = "workshop-resource-title";
  title.textContent = workshop.title || "無題のワークショップ";
  card.appendChild(title);

  if (workshop.scheduleText) {
    const schedule = document.createElement("div");
    schedule.className = "workshop-resource-schedule";
    schedule.textContent = workshop.scheduleText;
    card.appendChild(schedule);
  }

  appendTextBlock(card, "workshop-resource-description", workshop.summary || workshop.description || "詳細を開くと、教材・案件・提出期限を確認できます。");

  const chipRow = document.createElement("div");
  chipRow.className = "workshop-summary-chip-row";
  appendChip(chipRow, `案件 ${counts.cases}件`);
  appendChip(chipRow, `教材 ${counts.links}件`);
  appendChip(chipRow, `期限 ${counts.deadlines}件`);
  if (counts.guides > 0) {
    appendChip(chipRow, `ガイド ${counts.guides}件`);
  }
  card.appendChild(chipRow);

  const action = document.createElement("div");
  action.className = "workshop-resource-card-action";
  action.textContent = "詳細を見る ＞";
  card.appendChild(action);

  const openDetail = () => {
    selectedWorkshopId = workshop.id;
    renderWorkshopDetail(workshop.id);
  };

  card.addEventListener("click", openDetail);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  });

  return card;
}

function renderWorkshopList() {
  const activeWorkshops = getSortedWorkshops();
  clearWorkshopResourceList();

  if (activeWorkshops.length === 0) {
    renderEmpty("現在表示できるワークショップ・教材はありません。");
    return;
  }

  const intro = document.createElement("div");
  intro.className = "workshop-list-guide";
  intro.textContent = "見たいワークショップを選ぶと、案件・教材・提出期限を個別に確認できます。";
  workshopResourceList.appendChild(intro);

  activeWorkshops.forEach((workshop) => {
    workshopResourceList.appendChild(createWorkshopListCard(workshop));
  });
}

function appendLinkSection(parent, workshop) {
  const activeLinks = getActiveItems(workshop.links || []).filter((link) => link.title || link.url);
  const section = createSection("教材・リンク");

  if (activeLinks.length === 0) {
    appendEmptySectionText(section, "登録されている教材・リンクはありません。");
    parent.appendChild(section);
    return;
  }

  activeLinks.forEach((link) => {
    const item = document.createElement("div");
    item.className = "workshop-resource-link-item";

    if (link.url) {
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.title || link.url;
      item.appendChild(anchor);
    } else {
      const text = document.createElement("strong");
      text.textContent = link.title || "リンク";
      item.appendChild(text);
    }

    appendTextBlock(item, "workshop-resource-note", link.note);
    section.appendChild(item);
  });

  parent.appendChild(section);
}

function appendDeadlineSection(parent, workshop) {
  const activeDeadlines = getActiveItems(workshop.deadlines || []).filter((deadline) => deadline.title || deadline.dueDate || deadline.note);
  const caseDeadlines = getWorkshopCases(workshop)
    .filter((caseItem) => caseItem.dueDate && !isCompletedCaseStatus(caseItem.status))
    .map((caseItem) => ({
      title: `${caseItem.caseNo ? `案件No.${caseItem.caseNo} ` : ""}${caseItem.title || "無題の案件"}`,
      dueDate: caseItem.dueDate,
      dueTime: "",
      note: ""
    }));
  const deadlines = [...caseDeadlines, ...activeDeadlines]
    .sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"));
  const section = createSection("提出期限一覧");
  section.classList.add("workshop-deadline-section");

  if (deadlines.length === 0) {
    appendEmptySectionText(section, "納期が設定された案件はありません。");
    parent.appendChild(section);
    return;
  }

  deadlines.forEach((deadline) => {
    const item = document.createElement("div");
    item.className = "workshop-deadline-item";

    const title = document.createElement("div");
    title.className = "workshop-deadline-title";
    title.textContent = deadline.title || "提出物";
    item.appendChild(title);

    const due = document.createElement("div");
    due.className = "workshop-deadline-date";
    due.textContent = formatDeadline(deadline);
    item.appendChild(due);

    appendTextBlock(item, "workshop-resource-note", deadline.note);
    section.appendChild(item);
  });

  parent.appendChild(section);
}

function appendListValues(parent, title, values) {
  const cleanValues = (values || []).map((value) => String(value || "").trim()).filter(Boolean);

  if (cleanValues.length === 0) {
    return;
  }

  const box = document.createElement("div");
  box.className = "workshop-case-subsection";

  const heading = document.createElement("div");
  heading.className = "workshop-case-subtitle";
  heading.textContent = title;
  box.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "workshop-case-list";
  cleanValues.forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    list.appendChild(li);
  });
  box.appendChild(list);
  parent.appendChild(box);
}

function createCaseCard(caseItem) {
  const card = document.createElement("article");
  card.className = "workshop-case-card";

  const title = document.createElement("h5");
  title.className = "workshop-case-title";
  const caseNo = caseItem.caseNo ? `案件No.${caseItem.caseNo} ` : "";
  title.textContent = `${caseNo}${caseItem.title || "無題の案件"}`;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "workshop-case-meta";

  if (caseItem.status) {
    const status = document.createElement("span");
    status.className = "workshop-status-badge";
    status.textContent = caseItem.status;
    meta.appendChild(status);
  }

  if (caseItem.type) {
    appendChip(meta, caseItem.type);
  }

  if (caseItem.dueDate) {
    appendChip(meta, `納期 ${caseItem.dueDate}`);
  }

  if (meta.children.length > 0) {
    card.appendChild(meta);
  }

  appendTextBlock(card, "workshop-case-summary", caseItem.summary || caseItem.description || "");
  appendTextBlock(card, "workshop-case-summary", caseItem.deliverableText || "");
  appendListValues(card, "要件", caseItem.requirements);
  appendListValues(card, "チェックリスト", caseItem.checklist);

  return card;
}

function appendCaseSection(parent, workshop) {
  const cases = getWorkshopCases(workshop);
  const section = createSection("進行中の案件");

  if (cases.length === 0) {
    appendEmptySectionText(section, "登録されている案件はありません。");
    parent.appendChild(section);
    return;
  }

  cases.forEach((caseItem) => {
    section.appendChild(createCaseCard(caseItem));
  });

  parent.appendChild(section);
}

function appendGuideSection(parent, workshop) {
  const guides = getWorkshopGuides(workshop);

  if (guides.length === 0) {
    return;
  }

  const section = createSection("共通ガイド・提出方法");

  guides.forEach((guide) => {
    const item = document.createElement("div");
    item.className = "workshop-guide-item";

    const title = document.createElement("div");
    title.className = "workshop-guide-title";
    title.textContent = guide.title || "ガイド";
    item.appendChild(title);

    appendTextBlock(item, "workshop-resource-note", guide.body || guide.note || "");
    section.appendChild(item);
  });

  parent.appendChild(section);
}

function renderWorkshopDetail(workshopId) {
  const workshop = (workshopResourcesCache.workshops || []).find((item) => item.id === workshopId && item.active !== false);

  if (!workshop) {
    renderWorkshopList();
    return;
  }

  clearWorkshopResourceList();
  workshopResourceList.appendChild(createBackButton());

  const detail = document.createElement("article");
  detail.className = "workshop-resource-card workshop-detail-card";

  const header = document.createElement("div");
  header.className = "workshop-detail-header";

  const title = document.createElement("h3");
  title.className = "workshop-resource-title";
  title.textContent = workshop.title || "無題のワークショップ";
  header.appendChild(title);

  const counts = getWorkshopSummaryCounts(workshop);
  const chipRow = document.createElement("div");
  chipRow.className = "workshop-summary-chip-row";
  appendChip(chipRow, `案件 ${counts.cases}件`);
  appendChip(chipRow, `教材 ${counts.links}件`);
  appendChip(chipRow, `期限 ${counts.deadlines}件`);
  header.appendChild(chipRow);

  detail.appendChild(header);

  if (workshop.scheduleText) {
    const schedule = document.createElement("div");
    schedule.className = "workshop-resource-schedule";
    schedule.textContent = workshop.scheduleText;
    detail.appendChild(schedule);
  }

  appendTextBlock(detail, "workshop-resource-description", workshop.description || workshop.summary || "");
  appendCaseSection(detail, workshop);
  appendLinkSection(detail, workshop);
  appendDeadlineSection(detail, workshop);
  appendGuideSection(detail, workshop);

  workshopResourceList.appendChild(detail);

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "#555";
    workshopResourceMessage.textContent = "ワークショップ詳細を表示しました。画面切り替えによる追加Readはありません。";
  }
}

function normalizeWorkshopResourcesData(data) {
  return {
    schemaVersion: data.schemaVersion || 2,
    officeId: data.officeId || getOfficeId(),
    groupId: data.groupId || "enzine",
    workshops: Array.isArray(data.workshops) ? data.workshops : [],
    cases: Array.isArray(data.cases) ? data.cases : [],
    guides: Array.isArray(data.guides) ? data.guides : []
  };
}

function renderWorkshopResources(data) {
  workshopResourcesCache = normalizeWorkshopResourcesData(data || {});

  if (selectedWorkshopId) {
    renderWorkshopDetail(selectedWorkshopId);
    return;
  }

  renderWorkshopList();
}

async function loadWorkshopResources() {
  workshopResourceList.textContent = "読み込み中...";

  const docRef = doc(db, "system", getWorkshopResourcesDocId());
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    renderEmpty("ワークショップ・教材はまだ登録されていません。");
    return;
  }

  renderWorkshopResources(docSnap.data());

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "green";
    workshopResourceMessage.textContent = "ワークショップ・教材を表示しました。";
  }

  console.log(`[Read節約] ワークショップ・教材：${getWorkshopResourcesDocId()} をこのページを開いた時だけ1 readしました。詳細表示は手元データのみで切り替えます。`);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
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

    workshopUserInfo.textContent = currentUserData.role === "staff" || currentUserData.role === "admin"
      ? `支援員｜${currentUserData.name || user.email}`
      : `${currentUserData.name || user.email}さん`;

    await loadWorkshopResources();
  } catch (error) {
    console.error("ワークショップ・教材読み込みエラー:", error);
    renderEmpty(`読み込みに失敗しました：${error.code || error.message}`);
  }
});

if (backToScheduleButton) {
  backToScheduleButton.addEventListener("click", () => {
    if (currentUserData?.role === "staff" || currentUserData?.role === "admin") {
      window.location.href = "staff.html";
    } else {
      window.location.href = "user.html";
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}
