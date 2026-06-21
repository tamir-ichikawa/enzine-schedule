# Codex 引き継ぎ資料：enzine Schedule / V36 以降

作成日：2026-06-20  
プロジェクト名：enzine Schedule / enzine スケジュール管理  
目的：B型就労支援事業所 enzine の利用者予定管理・週一報告・支援員管理用Webアプリ

---

## 0. Codexへの最初の指示

このリポジトリは、Firebase Auth + Firestore + GitHub Pages想定の静的Webアプリです。  
現在の最新作業バージョンは **V35** です。次の修正は必ず **V36** として進めてください。

重要：過去にブラウザキャッシュやGitHub Pages反映ズレで、古いファイルを見てしまう問題が何度も発生しています。  
そのため、修正時は必ず以下を守ってください。

1. HTML内のJS/CSS読み込みの `?v=` を更新する。次は `?v=36`。
2. HTML/CSS/JSのどこかに検索用コメントを入れる。
3. 出力ファイル名は過去と被らない連番にする。
4. 既存DOM ID・Firestore構造・既存機能を壊さない。
5. 週一報告まわりは、利用者側・支援員側の両方で整合性を取る。

検索用コメント例：

```html
<!-- STEP7_CODEX_HANDOFF_20260620_V36 -->
```

読み込み例：

```html
<link rel="stylesheet" href="style.css?v=36">
<script type="module" src="staff.js?v=36"></script>
```

出力ファイル名例：

```text
staff-js-STEP7-CODEX-V36.txt
weekly-report-js-STEP7-CODEX-V36.txt
style-css-STEP7-CODEX-V36.txt
```

---

## 1. プロジェクト概要

### 1-1. 何のためのサイトか

B型就労支援事業所 enzine の利用者・支援員向けに、以下をWeb上で管理するためのサイトです。

- 利用者の月間予定入力
- 通所 / 在宅 / 休み / 時間帯 / メモの管理
- 本日の予定表示
- 本日のアナウンス表示
- 支援員による日別予定一覧確認
- 支援員による利用者別予定確認・編集
- アナウンス管理
- ワークショップ・教材リンク管理
- 週一報告の提出
- 支援員による週一報告確認・返信・フィードバック
- 利用者側で未記入週・返信あり週の通知

### 1-2. 運用想定

- 利用者：約20名
- 支援員：約7名
- 1事業所から開始
- 6月試験運用
- 7月正式導入予定
- 将来的に他事業所への展開可能性あり

### 1-3. 技術構成

- Firebase Auth
- Cloud Firestore
- Firebase SDK v12 CDN import
- GitHub Pagesで静的ホスティング想定
- ビルドツールなし
- HTML / CSS / JavaScript の素の構成

---

## 2. ファイル構成

主なファイルは以下です。

```text
index.html              ログインページ
auth.js                 ログイン処理
firebase-config.js      Firebase初期化
user.html               利用者メインページ
schedule.js             利用者予定・通知・カレンダー処理
staff.html              支援員ページ
staff.js                支援員ページ全体の処理
weekly-report.html      週一報告ページ
weekly-report.js        利用者の週一報告提出・閲覧処理
workshops.html          ワークショップ・教材ページ
workshops.js            教材リンクページの表示処理
style.css               全体共通CSS
```

---

## 3. Firebase / Firestore 基本方針

### 3-1. デフォルト値

既存データに `officeId` / `groupId` がない場合に備えて、JS内では以下のデフォルトを使っています。

```js
const DEFAULT_OFFICE_ID = "engine_chiba";
const DEFAULT_GROUP_ID = "enzine";
```

今後、事業所が増える場合は `users/{uid}` に `officeId` / `groupId` を正式に持たせて分岐します。

### 3-2. 重要なRead削減方針

Firestore Read数を抑えるため、以下の設計にしています。

- 利用者予定：1人1か月1ドキュメント
- アナウンス：1事業所1か月1ドキュメント
- 利用者一覧：`system/activeUsers` 1ドキュメントにキャッシュ
- 週一報告：1人1週1ドキュメント
- 支援員側の週一報告：一度読んだ週はJSメモリキャッシュして戻った時に再Readしない

---

## 4. Firestore コレクション詳細

## 4-1. users

パス：

```text
users/{uid}
```

用途：ログインユーザーの基本情報・権限判定。

想定フィールド：

```js
{
  name: string,
  email: string,
  role: "user" | "staff" | "admin",
  active: boolean,
  officeId: string,
  groupId: string,
  createdAt?: timestamp,
  updatedAt?: timestamp
}
```

利用箇所：

- `auth.js`：ログイン後の遷移先判定
- `schedule.js`：利用者ページ表示可否、名前表示
- `staff.js`：支援員ページ表示可否、支援員情報
- `weekly-report.js`：報告者名・権限確認
- `workshops.js`：教材ページ表示可否

権限：

- `role === "staff"` または `role === "admin"` は支援員扱い
- `active !== true` のユーザーはログイン後利用不可

注意：

- `auth.js` では現状 `role === "staff"` のみ支援員ページへ遷移している可能性がある。`admin` も支援員ページに送るなら確認・調整が必要。

---

## 4-2. monthlySchedules

パス：

```text
monthlySchedules/{userId}_{YYYY-MM}
```

例：

```text
monthlySchedules/abc123_2026-06
```

用途：利用者1人・1か月分の予定をまとめて保存。

想定フィールド：

```js
{
  userId: string,
  userName: string,
  userEmail: string,
  officeId: string,
  groupId: string,
  month: "YYYY-MM",
  days: {
    "YYYY-MM-DD": {
      status: "通所" | "在宅" | "休み",
      timeSlot: "終日" | "午前" | "午後" | "",
      memo: string
    }
  },
  workDayCount: number,
  updatedAt: serverTimestamp(),
  updatedByUid?: string,
  updatedByName?: string
}
```

利用者側：

- `schedule.js` でログインユーザーの `monthlySchedules/{uid}_{YYYY-MM}` を読む
- 月間・週間・リスト表示に使う
- 日付クリックで予定を編集
- 未入力日は画面上では `休み` 扱いにする

支援員側：

- 日別一覧：対象月の全利用者の `monthlySchedules` をまとめて読む
- 利用者別予定：利用者名をクリックした時だけ、その人の月間予定を個別に読む
- 支援員が利用者の予定を編集・保存可能

設計意図：

- 1日1ドキュメントにするとReadが増えるため、1か月1ドキュメント方式にしている。

---

## 4-3. monthlyAnnouncements

パス：

```text
monthlyAnnouncements/{officeId}_{YYYY-MM}
```

例：

```text
monthlyAnnouncements/engine_chiba_2026-06
```

用途：アナウンスを1事業所・1か月単位で管理。

想定フィールド：

```js
{
  officeId: string,
  groupId: string,
  month: "YYYY-MM",
  yearMonth: "YYYY-MM",
  days: {
    "YYYY-MM-DD": [
      {
        id: string,
        visibility: "all" | "staff",
        category: "notice" | "workshop" | "deadline" | "important",
        title: string,
        startTime: string,
        endTime: string,
        timeText: string,
        body: string,
        active: boolean,
        createdByUid?: string,
        createdByName?: string,
        createdAt?: string,
        updatedAt?: string
      }
    ]
  },
  updatedAt: serverTimestamp()
}
```

利用者側：

- `visibility === "staff"` は表示しない
- 今日のアナウンス
- カレンダー内のアナウンス表示
- モーダル内の当日アナウンス表示

支援員側：

- アナウンス管理カレンダーで作成・編集・非表示
- 表示フィルターあり
  - 全日表示
  - 全体用
  - 支援員用
  - 通常連絡
  - ワークショップ
  - 締切
  - 重要

注意：

- 非表示処理は完全削除ではなく、実装上は配列から除去または active=false 系の扱いがある。現在コードを確認して整合性を保つこと。

---

## 4-4. system/activeUsers

パス：

```text
system/activeUsers
```

用途：支援員ページで利用者一覧を1 readで取得するためのキャッシュ。

想定フィールド：

```js
{
  officeId: string,
  groupId: string,
  users: [
    {
      id: string,
      uid: string,
      name: string,
      email: string,
      role: "user",
      active: boolean,
      officeId: string,
      groupId: string
    }
  ],
  updatedAt: serverTimestamp(),
  updatedByUid: string,
  updatedByName: string
}
```

支援員ページでは、利用者一覧を原則このドキュメントから取得します。

関連処理：

- `loadActiveUsersFromSystemDoc()`
- `rebuildActiveUsersFromUsersCollection()`
- `loadActiveUsersForStaff()`

注意：

- `system/activeUsers` が未作成の場合、支援員ページで「利用者一覧を更新」を押して users コレクションから再構築する想定。
- 将来的な複数事業所対応で `offices.{officeId}.users` のような構造にも対応できるように一部実装されている可能性あり。

---

## 4-5. system/workshopResources_{officeId}

パス：

```text
system/workshopResources_engine_chiba
```

用途：ワークショップ・教材リンク集。

想定フィールド：

```js
{
  officeId?: string,
  groupId?: string,
  workshops: [
    {
      id: string,
      title: string,
      active: boolean,
      scheduleText: string,
      description: string,
      links: [
        {
          title: string,
          url: string,
          note: string,
          active: boolean
        }
      ],
      deadlines: [
        {
          title: string,
          dueDate: "YYYY-MM-DD",
          dueTime: "HH:MM",
          note: string,
          active: boolean
        }
      ]
    }
  ],
  updatedAt?: serverTimestamp(),
  updatedByUid?: string,
  updatedByName?: string
}
```

利用者側：

- `workshops.html` を開いた時だけ読み込む
- `active !== false` のワークショップ・リンク・締切だけ表示

支援員側：

- `staff.html` の「ワークショップ・教材」タブで管理
- 「管理を開く」を押した時だけ読み込む
- リンク・締切はテキストエリアから `タイトル | URL | メモ` のような形式で入力する実装

---

## 4-6. weeklyReports

パス：

```text
weeklyReports/{userId}_{weekStartDate}
```

例：

```text
weeklyReports/abc123_2026-06-08
```

用途：利用者1人・1週分の週一報告。

### 基本フィールド

```js
{
  userId: string,
  userName: string,
  userEmail: string,
  officeId: string,
  groupId: string,

  weekStartDate: "YYYY-MM-DD",
  weekEndDate: "YYYY-MM-DD",
  reportDueDate: "YYYY-MM-DD",

  workActivityText: string,
  activityTime: string,
  noActivityReason: string,
  healthStatus: string,
  lifeRhythm: string,
  selfScore: number,
  troubleText: string,
  goodText: string,
  nextWeekText: string,
  otherText: string,

  submitted: true,
  submittedAt: timestamp,
  updatedAt: timestamp
}
```

### 支援員返信・ロック関連フィールド

```js
{
  staffFeedbackText: string,
  staffFeedbackByUid: string,
  staffFeedbackByName: string,
  staffFeedbackAt: timestamp,
  staffFeedbackVersion: number,

  feedbackReadByUser: boolean,
  feedbackReadAt: timestamp,

  locked: boolean
}
```

### noActivityReason の注意

活動なしを選んでいない場合、保存上 `noActivityReason: "1"` が入ることがあります。  
これはGoogleフォーム由来の運用や必須項目対策の名残です。

画面表示では以下の方針にしてください。

```text
noActivityReason が "1" の場合は表示しない。
noActivityReason が空の場合も表示しない。
実際の理由テキストが入っている時だけ「活動なし理由」を表示する。
```

### 週一報告の質問項目

1. 先週、どんな作業や活動をしましたか？
2. 先週の作業・活動時間の目安
   - ３０分未満
   - ３０分～１時間
   - １時間～２時間
   - ２時間以上
   - わからない/活動なし（追加質問あり）
3. 活動なしと答えた方へ
4. 先週の体調や生活リズム
   - 体調良好・生活リズム安定
   - 体調まぁまぁ・生活リズムほぼ安定
   - 体調不安定・生活リズム乱れがち
   - 体調悪い・生活崩れている
   - よくわからない
5. 生活リズムについて詳しく
   - 週7日間すべて規則正しかった
   - 週4〜6日間規則正しかった
   - 週1〜3日間規則正しかった
   - 規則正しい日がなかった
6. 先週の自己採点 1〜5
7. 困ったこと・しんどかったこと
8. できたこと・がんばれたこと
9. 今週意識したいこと、取り組みたいこと
10. その他伝えたいこと、質問など

---

## 5. Firestore Security Rules 想定

既存ルール全体はリポジトリまたはFirebase Consoleで確認してください。  
週一報告については、支援員が返信を書けるように以下の形を想定しています。

```js
match /weeklyReports/{reportId} {
  // 利用者本人：自分の週一報告を読む
  allow read: if isActive()
    && reportId.matches(request.auth.uid + "_.*");

  // 利用者本人：自分の週一報告を新規作成
  allow create: if isActive()
    && reportId.matches(request.auth.uid + "_.*")
    && request.resource.data.userId == request.auth.uid;

  // 利用者本人：自分の週一報告を更新
  allow update: if isActive()
    && reportId.matches(request.auth.uid + "_.*")
    && resource.data.userId == request.auth.uid
    && request.resource.data.userId == request.auth.uid;

  // 支援員・管理者：週一報告を読む・返信を書く
  allow read, update: if isStaff();

  // 削除は禁止
  allow delete: if false;
}
```

今後改善したいルール：

- `locked: true` の報告は、利用者本人が更新できないようにFirestoreルール側でも防ぐ
- 利用者が支援員返信フィールドを書き換えられないように制限する
- 支援員が報告本文そのものを書き換えられないよう、変更可能フィールドを限定する

現状はアプリ側で制御している可能性があるため、ルール強化時は既存保存処理が壊れないよう慎重に実装すること。

---

## 6. 現在のUI状態 / V35

### 6-1. 全体UI

Step 5〜6でWebアプリ風に調整済み。

- 固定ヘッダー
- 左に enzine の仮アイコン
- タイトルは `enzine スケジュール`
- タイトル右に現在の画面名
- 右上に歯車メニュー
- 歯車メニュー内にログアウト
- タブは上部固定
- ページの横幅が広がりすぎないよう最大幅を設定

### 6-2. 利用者側タブ

利用者側のタブ名：

```text
予定
週一報告
ワークショップ・教材
```

`教材` という表記は `ワークショップ・教材` に変更済み。

### 6-3. 支援員側タブ

支援員側のタブ名：

```text
日別予定
利用者別予定
アナウンス
ワークショップ・教材
週一報告
運用チェック
```

支援員ページは同一HTML内でタブ切り替え。  
最後に開いていたタブをブラウザに保存する実装がある可能性あり。

---

## 7. 週一報告の現在状態 / V35

### 7-1. 利用者側

`user.html` の上部に週一報告通知があります。

表示対象：

1. 未記入の過去週
2. 支援員から返信があり、まだ利用者が読んでいない週

未記入週が複数あっても表示可能。  
返信あり週とも同時表示可能。

例：

```text
未記入：2026年6月8日〜6月14日
未記入：2026年6月15日〜6月21日
返信あり：2026年6月8日〜6月14日
```

### 7-2. 週一報告ページ

`weekly-report.html` / `weekly-report.js` で報告の提出・閲覧を行う。

通常時：フォーム編集可能。  
支援員返信が入った後：`locked: true` となり、利用者側では編集不可。  
編集不可の場合は、フォームではなくテキスト表示で読む。

支援員返信がある場合、利用者側に「返信を確認しました」ボタンが表示される想定。  
押すと以下を保存する想定：

```js
feedbackReadByUser: true,
feedbackReadAt: serverTimestamp()
```

### 7-3. 支援員側

`staff.html` の週一報告タブで以下が可能。

- 対象週を前週・次週で切り替え
- この週の提出状況を表示
- 提出済み一覧
- 未提出一覧
- 提出済み全員分をテキスト化
- 提出済みの人の名前クリックで報告詳細表示
- 支援員から返信・フィードバック保存
- 返信保存後、その報告を `locked: true` にする

### 7-4. 支援員側キャッシュ

週一報告は、支援員側で一度読み込んだ週をメモリキャッシュします。

目的：

```text
先週を読み込む
前週へ移動
先週へ戻る
→ 追加readなしで表示
```

注意：

- キャッシュ済み週を最新状態に更新する「再読み込み」ボタンは今後追加候補。
- 返信保存後はキャッシュ内の該当レポートも更新する必要あり。

### 7-5. 週一報告詳細表示の理想形

支援員側・利用者側ともに、同じ見え方にする。

```text
山田 太郎さんの週一報告
対象週：2026年6月8日〜2026年6月14日 ／ 返信なし

・作業・活動
　メモ

・活動時間：３０分～１時間

・活動なし理由
　活動できなかった理由
※実際に理由がある時だけ表示
※保存値が "1" の場合は表示しない

・体調・生活リズム
　体調良好・生活リズム安定

・生活リズム詳細
　週7日間すべて規則正しかった

・自己採点：3/5

・困ったこと・しんどかったこと
　困ったことがなかった

・できたこと・がんばれたこと
　いっぱいできた！

・今週意識したいこと
　頑張りたい

・その他
　こんにちは
```

V35で以下を修正済み：

- 提出済み一覧の白文字同化修正
- 提出済み一覧を左揃えに修正
- 名前クリック後に詳細表示欄へスクロール
- 報告詳細を箇条書きで読みやすく整理
- `noActivityReason === "1"` を表示しない

---

## 8. 週一報告開始日の重要メモ

ユーザー要望：

```text
週一報告を開始するのは次の月曜からにしたいので、日にちの設定を変えたい
```

現在日付：2026-06-20（土）  
次の月曜：2026-06-22（月）

現在コード内に以下のような定数がある可能性があります。

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-08";
```

または過去に以下だったことがあります。

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
```

次回V36で調整するなら、要件を確認して以下のどちらかにすること。

### パターンA：2026-06-22の週から報告対象にする

この場合、最初の報告対象週は：

```text
2026-06-22（月）〜2026-06-28（日）
```

利用者が実際に報告を書くのは、翌月曜：

```text
2026-06-29（月）以降
```

この場合の開始週：

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-22";
```

### パターンB：2026-06-22から、前週分の報告を書かせる

この場合、2026-06-22（月）に表示される報告対象は：

```text
2026-06-15（月）〜2026-06-21（日）
```

この場合の開始週：

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
```

ユーザーの表現「週一報告を開始するのは次の月曜から」は、運用上は **パターンB** の可能性が高い。  
ただし「次の月曜以降の活動から開始」なら **パターンA**。  
Codex作業前にユーザーへ確認するか、運用意図に合わせて実装する。

おすすめ：

- `WEEKLY_REPORT_START_WEEK` は「最初に報告対象にする週の月曜日」と定義する
- `WEEKLY_REPORT_NOTICE_START_DATE` のように「通知開始日」を別定数にすると混乱が減る

例：

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const WEEKLY_REPORT_NOTICE_START_DATE = "2026-06-22";
```

これなら、6/22から6/15〜6/21分の報告を表示できる。

---

## 9. ロゴ画像を入れる場合

現在はCSSの仮アイコン。  
画像ロゴに差し替える場合の推奨：

```text
ファイル名例：enzine-icon.png
形式：PNG または SVG
推奨元サイズ：96px × 96px 以上
できれば：192px × 192px
表示サイズ：38px × 38px
```

実装例：

```html
<img src="enzine-icon.png" alt="enzine" class="app-logo-image">
```

CSS例：

```css
.app-logo-image {
  width: 38px;
  height: 38px;
  object-fit: contain;
  display: block;
}
```

---

## 10. UI改善の現在要望

ユーザーから出ているUI要望：

1. 先月 / 先週 / 来週 / 次の月などのボタンがグレーで重い
   - もっと明るい色にする
   - サイズを小さくする

2. 横幅を広げた時にコンテンツが横長になりすぎる
   - 最大幅固定
   - 位置が変わらないようにする

3. 本日の予定が大きすぎる
   - 本日の予定と本日のアナウンスを横並び
   - 高さを抑える

4. 説明文が1行占有して無駄に大きい
   - タイトル横に置く
   - 小さく控えめにする

5. ログアウトは右上に置く
   - 右上に歯車アイコン
   - 歯車メニュー内にログアウト
   - 将来的に設定変更も入れる

6. タブは固定し、他タブに移動しても位置や配置が維持されるようにする

これらはV34〜V35で一部対応済みだが、実画面を見て微調整が必要。

---

## 11. 各JSの役割

### auth.js

- ログイン処理
- Firebase Auth の `signInWithEmailAndPassword`
- ログイン後、`users/{uid}` を読む
- `active !== true` は拒否
- `role` によって `staff.html` または `user.html` に遷移

注意：

- `admin` も支援員ページへ遷移させるか確認すること。

### schedule.js

利用者ページの中心。

担当：

- ログイン確認
- 利用者情報表示
- 月間予定読み込み
- 予定保存
- 今日の予定表示
- 今日のアナウンス表示
- カレンダー / 週間 / リスト表示
- アナウンス表示
- 週一報告未記入通知
- 支援員返信あり通知
- 右上メニュー / ログアウト

重要定数：

```js
DEFAULT_OFFICE_ID
DEFAULT_GROUP_ID
WEEKLY_REPORT_CHECK_WEEKS
WEEKLY_REPORT_START_WEEK
```

今後、通知開始日と対象週開始日を分けるなら：

```js
WEEKLY_REPORT_NOTICE_START_DATE
```

の追加を検討。

### weekly-report.js

利用者の週一報告ページ。

担当：

- 週一報告の読み込み
- 週移動
- 入力フォーム表示
- バリデーション
- 保存
- 支援員返信がある報告のロック表示
- 支援員返信の既読処理
- 報告詳細の読みやすい表示

注意：

- 支援員返信あり・`locked: true` の場合は利用者編集不可
- `noActivityReason === "1"` は表示しない
- 支援員側と同じ表示フォーマットにする

### staff.js

支援員ページ全体。

担当：

- ログイン確認
- タブ切り替え
- 日別予定一覧
- 利用者別予定表示・編集
- アナウンス管理
- ワークショップ・教材管理
- 運用チェック
- 週一報告提出状況
- 週一報告詳細表示
- 支援員返信保存
- 週一報告キャッシュ
- 右上メニュー / ログアウト

週一報告関連で重要：

- 週単位キャッシュを壊さない
- 提出済み一覧を左揃えにする
- 名前クリックで詳細表示へスクロール
- 返信保存後は `locked: true`
- 返信保存後はキャッシュ内の該当データも更新

### workshops.js

利用者側のワークショップ・教材ページ。

担当：

- ログイン確認
- `system/workshopResources_{officeId}` を読み込み
- activeなワークショップ・リンク・締切を表示
- 予定ページへ戻る
- 右上メニュー / ログアウト

### firebase-config.js

Firebase初期化。

現在の設定は公開フロント用のFirebase config。  
秘匿値ではないが、APIキーの扱いはFirebaseルール前提で安全性を担保する。

---

## 12. GitHub Pages / キャッシュ対策

変更後は以下で確認する。

```text
user.html?test=8000
staff.html?test=8000
weekly-report.html?test=8000
workshops.html?test=8000
```

反映されない場合：

1. GitHub上の実ファイルを開く
2. 検索用コメントを探す
3. `?v=36` になっているか確認
4. ブラウザで `?test=XXXX` を変えて開く
5. DevTools > Network > Disable cache で確認

---

## 13. 次にやるとよい作業 / V36候補

### 最優先：週一報告開始日の調整

ユーザーは「次の月曜から開始したい」と言っている。  
2026-06-20時点の次の月曜は2026-06-22。

実装案：

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const WEEKLY_REPORT_NOTICE_START_DATE = "2026-06-22";
```

または：

```js
const WEEKLY_REPORT_START_WEEK = "2026-06-22";
```

運用意図を確認して決めること。

### 次点：週一報告のFirestoreルール強化

- `locked: true` の報告を利用者が更新できないようにする
- 利用者が `staffFeedbackText` など支援員フィールドを更新できないようにする
- 支援員は報告本文ではなくフィードバック系フィールドだけ更新できるようにする

### UI微調整

- ボタン色・サイズ
- 本日の予定/アナウンス横並びの高さ調整
- タブのスマホ表示
- 歯車メニューの見た目
- ロゴ画像差し替え

### 運用機能

- 未提出者への連絡文生成
- Chatwork貼り付け用テキスト生成
- 週一報告の月次集計
- 支援記録・報告書向けの要約

---

## 14. Codexへの最終注意

このプロジェクトは、コードの機能追加よりも「既存運用を壊さない」ことが重要です。

特に以下は壊さないでください。

- 利用者ログイン
- 支援員ログイン
- 予定登録
- 支援員日別一覧
- 利用者別予定編集
- アナウンス管理
- ワークショップ・教材表示
- 週一報告保存
- 支援員返信
- 利用者側の未記入/返信通知

作業前に現在の `user.html`, `schedule.js`, `weekly-report.html`, `weekly-report.js`, `staff.html`, `staff.js`, `workshops.html`, `workshops.js`, `style.css` を必ず確認してください。

次のバージョンは **V36** です。
