// ========================================
// Enzine Schedule → Chatwork 本日の予定投稿
// ========================================

const TIMEZONE = "Asia/Tokyo";
const DAILY_TRIGGER_FUNCTION = "postTodayScheduleToChatwork";
const LAST_POSTED_DATE_KEY = "LAST_CHATWORK_SCHEDULE_POSTED_DATE";

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];

// 最初に1回だけ実行。実値を入れた後、この関数内の値は空に戻してOK。
function setPropertiesExample() {
  const exampleProperties = {
    FIREBASE_API_KEY: "YOUR_FIREBASE_WEB_API_KEY",
    FIREBASE_PROJECT_ID: "enzine-schedule",

    // staff または admin のログインアカウント推奨
    FIREBASE_EMAIL: "staff@example.com",
    FIREBASE_PASSWORD: "YOUR_FIREBASE_LOGIN_PASSWORD",

    CHATWORK_TOKEN: "YOUR_CHATWORK_API_TOKEN",
    CHATWORK_ROOM_ID: "YOUR_CHATWORK_ROOM_ID",

    OFFICE_ID: "enzine_chiba",
    ORGANIZATION_ID: "",
    SELF_UNREAD: "1",

    // 土日も投稿するなら 0、土日は投稿しないなら 1
    SKIP_WEEKEND: "1"
  };

  const hasPlaceholder = Object.keys(exampleProperties).some(key => {
    return String(exampleProperties[key] || "").indexOf("YOUR_") === 0;
  });

  if (hasPlaceholder) {
    throw new Error("setPropertiesExample の YOUR_... を実値へ置き換えてから実行してください。");
  }

  PropertiesService.getScriptProperties().setProperties(exampleProperties, true);
}

// 本番用：今日の予定をChatwork投稿
function postTodayScheduleToChatwork() {
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    console.log("別の投稿処理が実行中のため、今回の投稿はスキップしました。");
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const lastPostedDate = props.getProperty(LAST_POSTED_DATE_KEY);

    if (lastPostedDate === today) {
      console.log(`${today} はすでに投稿済みのため、二重投稿をスキップしました。`);
      return;
    }

    postScheduleToChatworkForDate(today);
    props.setProperty(LAST_POSTED_DATE_KEY, today);
  } finally {
    lock.releaseLock();
  }
}

// 今日分を手動投稿テスト
function testPostTodayScheduleToChatwork() {
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  postScheduleToChatworkForDate(today);
}

// 任意日付のテスト
function testPostScheduleToChatwork() {
  postScheduleToChatworkForDate("2026-06-24");
}

// デバッグ用：Chatworkには投稿しない
function debugChatworkSchedule() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const context = getFirebaseAccessContext_();

  console.log(`today=${today}`);
  console.log(`OFFICE_ID=${context.officeId}`);
  console.log(`ORGANIZATION_ID=${context.organizationId}`);
  console.log(`LAST_POSTED=${props.getProperty(LAST_POSTED_DATE_KEY)}`);
  console.log(`FIREBASE_PROJECT_ID=${props.getProperty("FIREBASE_PROJECT_ID")}`);
  console.log(`CHATWORK_ROOM_ID=${props.getProperty("CHATWORK_ROOM_ID")}`);
  console.log("Firebaseログイン・所属確認OK");

  const users = fetchActiveUsers_(
    context.idToken,
    context.officeId,
    context.organizationId
  );
  console.log(`activeUsers=${users.length}`);

  const monthlySchedules = fetchMonthlySchedules_(
    context.idToken,
    context.officeId,
    context.organizationId,
    today.slice(0, 7)
  );
  console.log(`monthlySchedules=${monthlySchedules.length}`);

  const grouped = buildDailyScheduleGroups_(users, monthlySchedules, today);
  const body = buildChatworkMessage_(today, grouped);

  console.log("送信予定本文:");
  console.log(body);
}

// 二重投稿判定をリセット
function resetLastPostedDate() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_POSTED_DATE_KEY);
  console.log("LAST_POSTED を削除しました。");
}

// 毎朝8時前後のトリガーを作成
function createDailyTriggerAt8() {
  deleteTriggers_(DAILY_TRIGGER_FUNCTION);

  ScriptApp.newTrigger(DAILY_TRIGGER_FUNCTION)
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone(TIMEZONE)
    .create();

  console.log("毎朝8:00前後のChatwork投稿トリガーを1つ作成しました。");
}

// 今日の8:00に1回だけ実行したい場合
function createOneTimeTriggerTodayAt8() {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);

  if (target <= now) {
    throw new Error("今日の8:00はすでに過ぎています。手動テストするか、毎朝8時トリガーを作成してください。");
  }

  ScriptApp.newTrigger(DAILY_TRIGGER_FUNCTION)
    .timeBased()
    .at(target)
    .create();

  console.log("今日の8:00に1回だけ実行するトリガーを作成しました。");
}

// トリガー削除
function deleteDailyTriggers() {
  deleteTriggers_(DAILY_TRIGGER_FUNCTION);
  console.log("毎朝投稿トリガーを削除しました。");
}

// トリガー確認
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const counts = {};

  triggers.forEach(trigger => {
    const functionName = trigger.getHandlerFunction();
    counts[functionName] = (counts[functionName] || 0) + 1;
    console.log(functionName);
  });

  console.log(JSON.stringify(counts));
}

// 本体
function postScheduleToChatworkForDate(dateId) {
  const props = PropertiesService.getScriptProperties();
  const skipWeekend = props.getProperty("SKIP_WEEKEND") === "1";

  if (skipWeekend && isWeekendDateId_(dateId)) {
    console.log(`${dateId} は土日のため投稿をスキップしました。`);
    return;
  }

  const context = getFirebaseAccessContext_();
  const monthId = dateId.slice(0, 7);

  const users = fetchActiveUsers_(
    context.idToken,
    context.officeId,
    context.organizationId
  );
  const monthlySchedules = fetchMonthlySchedules_(
    context.idToken,
    context.officeId,
    context.organizationId,
    monthId
  );

  const grouped = buildDailyScheduleGroups_(users, monthlySchedules, dateId);
  const body = buildChatworkMessage_(dateId, grouped);

  postToChatwork_(body);

  console.log(`${dateId} の予定をChatworkに投稿しました。`);
}

// ========================================
// Firebase Auth
// ========================================

function getFirebaseSession_() {
  const props = PropertiesService.getScriptProperties();

  const apiKey = props.getProperty("FIREBASE_API_KEY");
  const email = props.getProperty("FIREBASE_EMAIL");
  const password = props.getProperty("FIREBASE_PASSWORD");

  if (!apiKey || !email || !password) {
    throw new Error("FIREBASE_API_KEY / FIREBASE_EMAIL / FIREBASE_PASSWORD が未設定です。");
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

  const payload = {
    email: email,
    password: password,
    returnSecureToken: true
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Firebaseログイン失敗: ${code} ${getSafeApiErrorMessage_(text)}`);
  }

  const session = JSON.parse(text);

  if (!session.idToken || !session.localId) {
    throw new Error("Firebaseログイン応答に必要な情報がありません。");
  }

  return {
    idToken: session.idToken,
    localId: session.localId
  };
}

function getFirebaseIdToken_() {
  return getFirebaseSession_().idToken;
}

function getSafeApiErrorMessage_(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : "詳細不明";
  } catch (error) {
    return "詳細不明";
  }
}

// ========================================
// Firestore REST
// ========================================

function getFirestoreBaseUrl_() {
  const projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID が未設定です。");
  }

  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function firestoreGetDocument_(idToken, path) {
  const url = `${getFirestoreBaseUrl_()}/${path}`;

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code === 404) {
    return null;
  }

  if (code < 200 || code >= 300) {
    throw new Error(`Firestore取得失敗: ${code} ${text}`);
  }

  return JSON.parse(text);
}

function getOfficeId_() {
  const raw = PropertiesService.getScriptProperties().getProperty("OFFICE_ID") || DEFAULT_OFFICE_ID;
  return normalizeOfficeId_(raw);
}

function getFirebaseAccessContext_() {
  const props = PropertiesService.getScriptProperties();
  const session = getFirebaseSession_();
  const profileDocument = firestoreGetDocument_(
    session.idToken,
    `users/${encodeURIComponent(session.localId)}`
  );

  if (!profileDocument) {
    throw new Error("Firebaseログインアカウントの利用者情報が見つかりません。");
  }

  const profile = firestoreDocumentToObject_(profileDocument);
  const role = String(profile.role || "").trim();
  const accessScope = String(profile.accessScope || "").trim();
  const isGlobalAdmin = role === "admin" && accessScope === "global";

  if (profile.active !== true) {
    throw new Error("Firebaseログインアカウントは利用停止中です。");
  }

  if (role !== "staff" && role !== "admin") {
    throw new Error("Chatwork自動送信には支援員または管理者アカウントを使用してください。");
  }

  const profileOfficeId = normalizeOfficeId_(profile.officeId);
  const profileOrganizationId = normalizeOrganizationId_(
    profile.organizationId || profile.groupId
  );
  const configuredOfficeIdRaw = String(props.getProperty("OFFICE_ID") || "").trim();
  const configuredOrganizationId = normalizeOrganizationId_(
    props.getProperty("ORGANIZATION_ID")
  );

  if (!isGlobalAdmin) {
    if (!profileOfficeId || !profileOrganizationId) {
      throw new Error("Firebaseログインアカウントに運営会社IDまたは事業所IDが設定されていません。");
    }

    if (
      configuredOfficeIdRaw
      && normalizeOfficeId_(configuredOfficeIdRaw) !== profileOfficeId
    ) {
      throw new Error("OFFICE_ID がFirebaseログインアカウントの所属事業所と一致しません。");
    }

    if (
      configuredOrganizationId
      && configuredOrganizationId !== profileOrganizationId
    ) {
      throw new Error("ORGANIZATION_ID がFirebaseログインアカウントの運営会社と一致しません。");
    }

    return {
      idToken: session.idToken,
      uid: session.localId,
      role: role,
      accessScope: accessScope,
      officeId: profileOfficeId,
      organizationId: profileOrganizationId
    };
  }

  if (!configuredOfficeIdRaw || !configuredOrganizationId) {
    throw new Error("全体管理者で実行する場合は OFFICE_ID と ORGANIZATION_ID を設定してください。");
  }

  const officeId = normalizeOfficeId_(configuredOfficeIdRaw);
  const organizationId = configuredOrganizationId;

  return {
    idToken: session.idToken,
    uid: session.localId,
    role: role,
    accessScope: accessScope,
    officeId: officeId,
    organizationId: organizationId
  };
}

function normalizeOfficeId_(officeId) {
  const value = String(officeId || "").trim();

  if (!value || LEGACY_OFFICE_IDS.indexOf(value) >= 0) {
    return DEFAULT_OFFICE_ID;
  }

  return value;
}

function normalizeOrganizationId_(organizationId) {
  return String(organizationId || "").trim();
}

function getCompatibleOfficeIds_(officeId) {
  const current = normalizeOfficeId_(officeId);

  if (current !== DEFAULT_OFFICE_ID) {
    return [current];
  }

  return [DEFAULT_OFFICE_ID].concat(LEGACY_OFFICE_IDS)
    .filter((value, index, array) => {
      return value && array.indexOf(value) === index;
    });
}

function fetchActiveUsers_(idToken, officeId, organizationId) {
  const officeIds = getCompatibleOfficeIds_(officeId);

  for (let index = 0; index < officeIds.length; index += 1) {
    const cacheOfficeId = officeIds[index];
    const doc = firestoreGetDocument_(
      idToken,
      `system/activeUsers_${cacheOfficeId}`
    );

    if (!doc) {
      continue;
    }

    const data = firestoreDocumentToObject_(doc);
    const cacheOrganizationId = normalizeOrganizationId_(
      data.organizationId || data.groupId
    );

    if (
      cacheOrganizationId
      && cacheOrganizationId !== normalizeOrganizationId_(organizationId)
    ) {
      throw new Error("利用者一覧キャッシュの運営会社IDがログインアカウントと一致しません。");
    }

    let rawUsers = [];

    if (Array.isArray(data.users)) {
      rawUsers = data.users;
    } else if (
      data.offices
      && data.offices[cacheOfficeId]
      && Array.isArray(data.offices[cacheOfficeId].users)
    ) {
      rawUsers = data.offices[cacheOfficeId].users;
    }

    return rawUsers
      .map(user => normalizeActiveUser_(user, officeId, organizationId))
      .filter(Boolean)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  }

  throw new Error(
    `system/activeUsers_${normalizeOfficeId_(officeId)} が見つかりません。管理者ページまたは支援員ページで利用者一覧キャッシュを更新してください。`
  );
}

function normalizeActiveUser_(rawUser, officeId, organizationId) {
  if (!rawUser) return null;

  const id = rawUser.uid || rawUser.id || rawUser.userId;
  if (!id) return null;

  const role = rawUser.role || "user";
  if (role === "staff" || role === "admin") return null;
  if (rawUser.active === false) return null;

  if (rawUser.officeId && normalizeOfficeId_(rawUser.officeId) !== normalizeOfficeId_(officeId)) {
    return null;
  }

  const rawOrganizationId = normalizeOrganizationId_(
    rawUser.organizationId || rawUser.groupId
  );

  if (
    rawOrganizationId
    && rawOrganizationId !== normalizeOrganizationId_(organizationId)
  ) {
    return null;
  }

  return {
    id: id,
    name: rawUser.name || rawUser.displayName || rawUser.email || "名前未設定",
    email: rawUser.email || "",
    officeId: normalizeOfficeId_(rawUser.officeId || officeId),
    organizationId: rawOrganizationId || normalizeOrganizationId_(organizationId)
  };
}

function fetchMonthlySchedules_(idToken, officeId, organizationId, monthId) {
  const all = [];
  const seen = {};

  getCompatibleOfficeIds_(officeId).forEach(id => {
    const rows = fetchMonthlySchedulesForOffice_(
      idToken,
      id,
      organizationId,
      monthId
    );

    rows.forEach(item => {
      const key = item.id || item.userId || JSON.stringify(item);
      if (!seen[key]) {
        seen[key] = true;
        all.push(item);
      }
    });
  });

  return all;
}

function fetchMonthlySchedulesForOffice_(idToken, officeId, organizationId, monthId) {
  const url = `${getFirestoreBaseUrl_()}:runQuery`;

  const payload = {
    structuredQuery: {
      from: [
        {
          collectionId: "monthlySchedules"
        }
      ],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "groupId" },
                op: "EQUAL",
                value: { stringValue: organizationId }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: "officeId" },
                op: "EQUAL",
                value: { stringValue: officeId }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: "month" },
                op: "EQUAL",
                value: { stringValue: monthId }
              }
            }
          ]
        }
      }
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`monthlySchedules取得失敗: ${code} ${text}`);
  }

  const rows = JSON.parse(text);

  return rows
    .filter(row => row.document)
    .map(row => firestoreDocumentToObject_(row.document));
}

function firestoreDocumentToObject_(document) {
  const obj = {};
  const fields = document.fields || {};

  Object.keys(fields).forEach(key => {
    obj[key] = firestoreValueToJs_(fields[key]);
  });

  if (document.name) {
    obj.id = document.name.split("/").pop();
  }

  return obj;
}

function firestoreValueToJs_(value) {
  if (!value) return null;

  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs_);
  }

  if ("mapValue" in value) {
    const out = {};
    const fields = value.mapValue.fields || {};

    Object.keys(fields).forEach(key => {
      out[key] = firestoreValueToJs_(fields[key]);
    });

    return out;
  }

  return null;
}

// ========================================
// 予定の整形
// ========================================

function buildDailyScheduleGroups_(users, monthlySchedules, dateId) {
  const scheduleMap = {};

  monthlySchedules.forEach(monthlySchedule => {
    if (monthlySchedule.userId) {
      scheduleMap[monthlySchedule.userId] = monthlySchedule;
    }
  });

  const grouped = {
    coming: [],
    home: [],
    off: [],
    other: []
  };

  users.forEach(user => {
    const monthlySchedule = scheduleMap[user.id] || null;
    const dayData = monthlySchedule && monthlySchedule.days
      ? monthlySchedule.days[dateId]
      : null;

    const status = dayData && dayData.status
      ? dayData.status
      : "休み";

    const item = {
      name: user.name || user.email || "名前未設定",
      status: status,
      timeSlot: dayData && dayData.timeSlot ? dayData.timeSlot : "",
      memo: dayData && dayData.memo ? dayData.memo : ""
    };

    if (status === "通所") {
      grouped.coming.push(item);
    } else if (status === "在宅") {
      grouped.home.push(item);
    } else if (status === "休み") {
      grouped.off.push(item);
    } else {
      grouped.other.push(item);
    }
  });

  return grouped;
}

function buildChatworkMessage_(dateId, grouped) {
  const dateLabel = formatJapaneseDateLabel_(dateId);

  const lines = [];

  lines.push(`[info][title]本日の予定｜${dateLabel}[/title]`);

  lines.push(formatGroup_("通所", grouped.coming));
  lines.push("");
  lines.push(formatGroup_("在宅", grouped.home));
  lines.push("");
  lines.push(formatGroup_("休み", grouped.off));

  if (grouped.other.length > 0) {
    lines.push("");
    lines.push(formatGroup_("その他・未分類", grouped.other));
  }

  lines.push("");
  lines.push(`合計：通所${grouped.coming.length}名 / 在宅${grouped.home.length}名 / 休み${grouped.off.length}名`);

  lines.push("[/info]");

  return lines.join("\n");
}

function formatGroup_(label, list) {
  const lines = [`【${label}】${list.length}名`];

  if (list.length === 0) {
    lines.push("・該当者なし");
    return lines.join("\n");
  }

  list.forEach(item => {
    let line = `・${item.name}`;

    if (item.timeSlot) {
      line += `　${item.timeSlot}`;
    }

    if (item.memo) {
      line += `（${item.memo}）`;
    }

    lines.push(line);
  });

  return lines.join("\n");
}

function formatJapaneseDateLabel_(dateId) {
  const date = new Date(`${dateId}T00:00:00+09:00`);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const month = Number(dateId.slice(5, 7));
  const day = Number(dateId.slice(8, 10));
  const weekday = weekdays[date.getDay()];

  return `${month}月${day}日（${weekday}）`;
}

function isWeekendDateId_(dateId) {
  const date = new Date(`${dateId}T00:00:00+09:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ========================================
// Chatwork
// ========================================

function postToChatwork_(body) {
  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty("CHATWORK_TOKEN");
  const roomId = props.getProperty("CHATWORK_ROOM_ID");
  const selfUnread = props.getProperty("SELF_UNREAD") || "1";

  if (!token || !roomId) {
    throw new Error("CHATWORK_TOKEN / CHATWORK_ROOM_ID が未設定です。");
  }

  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "X-ChatWorkToken": token
    },
    payload: {
      body: body,
      self_unread: selfUnread
    },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Chatwork投稿失敗: ${code} ${text}`);
  }

  return JSON.parse(text);
}

function deleteTriggers_(functionName) {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
