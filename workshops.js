import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const DEFAULT_OFFICE_ID = "engine_chiba";
const WORKSHOP_RESOURCES_DOC_PREFIX = "workshopResources_";

const workshopUserInfo = document.getElementById("workshopUserInfo");
const workshopResourceList = document.getElementById("workshopResourceList");
const workshopResourceMessage = document.getElementById("workshopResourceMessage");
const backToScheduleButton = document.getElementById("backToScheduleButton");

let currentUserData = null;

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

function renderWorkshopResources(workshops) {
  const activeWorkshops = (workshops || []).filter((workshop) => workshop.active !== false);
  workshopResourceList.innerHTML = "";

  if (activeWorkshops.length === 0) {
    renderEmpty("現在表示できる教材・リンクはありません。");
    return;
  }

  activeWorkshops.forEach((workshop) => {
    const card = document.createElement("article");
    card.className = "workshop-resource-card";

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

    if (workshop.description) {
      const desc = document.createElement("div");
      desc.className = "workshop-resource-description";
      desc.textContent = workshop.description;
      card.appendChild(desc);
    }

    const activeLinks = (workshop.links || []).filter((link) => link.active !== false && (link.title || link.url));
    if (activeLinks.length > 0) {
      const linkBox = document.createElement("div");
      linkBox.className = "workshop-resource-section";
      const heading = document.createElement("h4");
      heading.textContent = "教材・リンク";
      linkBox.appendChild(heading);

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

        if (link.note) {
          const note = document.createElement("div");
          note.className = "workshop-resource-note";
          note.textContent = link.note;
          item.appendChild(note);
        }

        linkBox.appendChild(item);
      });

      card.appendChild(linkBox);
    }

    const activeDeadlines = (workshop.deadlines || []).filter((deadline) => deadline.active !== false && (deadline.title || deadline.dueDate || deadline.note));
    if (activeDeadlines.length > 0) {
      const deadlineBox = document.createElement("div");
      deadlineBox.className = "workshop-resource-section workshop-deadline-section";
      const heading = document.createElement("h4");
      heading.textContent = "提出期限メモ";
      deadlineBox.appendChild(heading);

      activeDeadlines.forEach((deadline) => {
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

        if (deadline.note) {
          const note = document.createElement("div");
          note.className = "workshop-resource-note";
          note.textContent = deadline.note;
          item.appendChild(note);
        }

        deadlineBox.appendChild(item);
      });

      card.appendChild(deadlineBox);
    }

    workshopResourceList.appendChild(card);
  });
}

async function loadWorkshopResources() {
  workshopResourceList.textContent = "読み込み中...";

  const docRef = doc(db, "system", getWorkshopResourcesDocId());
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    renderEmpty("教材・リンク集はまだ登録されていません。");
    return;
  }

  const data = docSnap.data();
  renderWorkshopResources(Array.isArray(data.workshops) ? data.workshops : []);

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "green";
    workshopResourceMessage.textContent = "教材・リンク集を表示しました。";
  }

  console.log(`[Read節約] 教材・リンク集：${getWorkshopResourcesDocId()} をこのページを開いた時だけ1 readしました。`);
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
    console.error("教材・リンク集読み込みエラー:", error);
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
