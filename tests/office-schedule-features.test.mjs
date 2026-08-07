import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("office schedule menu and form expose the requested categories in priority order", async () => {
  const [staffHtml, staffSource] = await Promise.all([
    readSource("../staff.html"),
    readSource("../staff.js")
  ]);

  assert.match(staffHtml, /data-staff-tab="announcements">事業所予定</);
  assert.match(
    staffHtml,
    /id="announcementCategory">[\s\S]*?value="workshop">WS<[\s\S]*?value="important">重要<[\s\S]*?value="notice">通常<[\s\S]*?value="attendance">勤怠<[\s\S]*?value="task">タスク</
  );
  assert.match(
    staffSource,
    /ANNOUNCEMENT_CATEGORY_ORDER = \{[\s\S]*?workshop: 1,[\s\S]*?important: 2,[\s\S]*?notice: 3,[\s\S]*?attendance: 4,[\s\S]*?task: 5/
  );
  assert.doesNotMatch(staffHtml, /id="showDeadlineAnnouncementCheckbox"/);
  assert.doesNotMatch(staffSource, /showDeadlineAnnouncementCheckbox/);
  assert.match(staffSource, /announcementCalendarTitle\.textContent = `\$\{label\}の予定管理`/);
  assert.match(staffSource, /announcementModalTitle\.textContent = `\$\{formatJapaneseDate\(dateId\)\}の予定`/);
  assert.match(staffSource, /category === "workshop"\) \{[\s\S]*?return "WS"/);
  assert.match(staffSource, /category === "attendance"\) \{[\s\S]*?return "休"/);
});

test("attendance and task support staff assignment snapshots and staff-only behavior", async () => {
  const [staffHtml, staffSource, userSource, styleSource] = await Promise.all([
    readSource("../staff.html"),
    readSource("../staff.js"),
    readSource("../schedule.js"),
    readSource("../style.css")
  ]);

  assert.match(staffHtml, /id="supportStaffNameInput"/);
  assert.match(
    staffHtml,
    /class="office-schedule-workspace"[\s\S]*?<aside[^>]*class="support-staff-manager support-staff-sidebar"[\s\S]*?<div class="office-schedule-main-pane"/
  );
  assert.doesNotMatch(staffHtml, /勤怠・タスクで選ぶ支援員を登録します/);
  assert.doesNotMatch(staffHtml, /id="supportStaffMessage"/);
  assert.match(staffHtml, /id="announcementStaffList"/);
  assert.match(staffSource, /SUPPORT_STAFF_DOC_PREFIX = "supportStaff_"/);
  assert.match(staffSource, /staffAssignments: normalizeAnnouncementStaffAssignments\(announcement\.staffAssignments\)/);
  assert.match(staffSource, /isStaffOnlyAnnouncementCategory\(category\) \? "staff" : announcementVisibility\.value/);
  assert.match(staffSource, /STAFF_MONTHLY_ANNOUNCEMENTS_COLLECTION = "staffMonthlyAnnouncements"/);
  const loadMonthlyBody = staffSource.match(
    /async function loadMonthlyAnnouncements\(year, month\) \{[\s\S]*?(?=\nasync function persistMonthlyAnnouncements)/
  )?.[0] || "";
  assert.match(loadMonthlyBody, /for \(const collectionName of \["monthlyAnnouncements", STAFF_MONTHLY_ANNOUNCEMENTS_COLLECTION\]\)/);
  assert.match(loadMonthlyBody, /getDoc\(doc\(db, collectionName, monthlyAnnouncementId\)\)/);
  assert.match(staffSource, /announcement\.active !== false[\s\S]*?announcement\.category !== "deadline"/);
  assert.match(staffSource, /setDoc\([\s\S]*?STAFF_MONTHLY_ANNOUNCEMENTS_COLLECTION[\s\S]*?buildMonthlyDocument\("staff", staffDays\)/);
  assert.match(staffSource, /category === "attendance" && staffAssignments\.length === 0/);
  assert.match(staffSource, /category === "attendance" \? "" : announcementStartTime\.value/);
  assert.match(userSource, /announcement\.category !== "attendance"[\s\S]*?announcement\.category !== "task"/);
  assert.doesNotMatch(userSource, /staffMonthlyAnnouncements/);
  assert.match(staffSource, /setAnnouncementElementHidden\(announcementStaffPicker, !supportsStaffSelection\)/);
  assert.match(staffSource, /note\.placeholder = "午後など（任意）"/);
  assert.match(staffSource, /assignments\.length === 0 \|\| announcement\.category === "attendance"/);
  assert.match(styleSource, /\.announcement-staff-picker\.hidden,[\s\S]*?display: none !important/);
  assert.match(styleSource, /\.announcement-staff-list \{[\s\S]*?grid-auto-rows: max-content;[\s\S]*?align-content: start;[\s\S]*?overflow-y: auto;/);
  assert.match(styleSource, /\.announcement-staff-option:has\(\.announcement-staff-note\) \{[\s\S]*?min-height: 52px;/);
  assert.match(styleSource, /\.announcement-staff-option > input\[type="checkbox"\][\s\S]*?min-height: 18px/);
  assert.match(styleSource, /\.announcement-staff-note \{[\s\S]*?grid-column: 3;[\s\S]*?min-height: 38px/);
  assert.match(styleSource, /\.office-schedule-workspace \{[\s\S]*?grid-template-columns: minmax\(190px, 230px\) minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.support-staff-list \{[\s\S]*?flex-direction: column;[\s\S]*?overflow-y: auto/);
  assert.doesNotMatch(staffSource, /を支援員名簿に追加しました/);
});

test("deleted support staff names stay renderable from saved announcement snapshots", async () => {
  const staffSource = await readSource("../staff.js");

  assert.match(staffSource, /staffName: String\(assignment\?\.staffName \|\| assignment\?\.name/);
  assert.match(staffSource, /filter\(\(assignment\) => !masterIds\.has\(assignment\.staffId\)\)/);
  assert.match(staffSource, /removedBadge\.textContent = "名簿から削除済み"/);
  assert.match(staffSource, /登録済みの事業所予定には名前が残ります/);
});

test("today announcements render collapsed titles with click-to-open details", async () => {
  const [userSource, styleSource] = await Promise.all([
    readSource("../schedule.js"),
    readSource("../style.css")
  ]);

  assert.match(userSource, /document\.createElement\("details"\)/);
  assert.match(userSource, /document\.createElement\("summary"\)/);
  assert.match(userSource, /today-announcement-details/);
  assert.match(styleSource, /\.today-announcement-card > summary::after[\s\S]*?content: "詳細を見る"/);
  assert.match(styleSource, /\.today-announcement-card\[open\] > summary::after[\s\S]*?content: "閉じる"/);
});

test("support staff master is scoped to office operators in Firestore rules", async () => {
  const rulesSource = await readSource("../firestore.emulator.rules");

  assert.match(rulesSource, /systemId == 'supportStaff_' \+ callerOfficeId\(\)/);
  assert.match(rulesSource, /systemId == 'supportStaff_' \+ callerOfficeId\(\)[\s\S]*?isOfficeOperator\(\)[\s\S]*?sameMembership\(request\.resource\.data\)/);
  assert.match(rulesSource, /match \/staffMonthlyAnnouncements\/\{announcementId\}[\s\S]*?isOfficeOperator\(\)[\s\S]*?sameMembership\(resource\.data\)/);
});
