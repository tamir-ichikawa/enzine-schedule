# Chatwork 本日の予定送信 GAS

`chatwork-daily-schedule.gs` は、事業所分離後の Firestore 構成に対応したGASです。

## 修正内容

- 利用者キャッシュを旧共通ドキュメントではなく `system/activeUsers_{事業所ID}` から取得します。
- 月間予定を `groupId`、`officeId`、`month` の3条件で取得します。
- 千葉の旧事業所ID `engine_chiba` は千葉だけの互換読みに限定します。
- 支援員・事業所管理者では、GASに設定した所属ではなくFirebaseの本人プロフィールを基準にします。
- 全体管理者で実行する場合は、誤送信防止のため `OFFICE_ID` と `ORGANIZATION_ID` の指定を必須にします。

## GASへの反映方法

1. 現在のGASコードを別ファイルへ退避します。
2. GASエディタのコードを `chatwork-daily-schedule.gs` の内容へ置き換えます。
3. 既存のスクリプトプロパティは消さず、次の値を確認します。
   - `FIREBASE_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_EMAIL`
   - `FIREBASE_PASSWORD`
   - `CHATWORK_TOKEN`
   - `CHATWORK_ROOM_ID`
   - `OFFICE_ID`
   - `ORGANIZATION_ID`
   - `SELF_UNREAD`
   - `SKIP_WEEKEND`
4. 支援員または事業所管理者を使用する場合、`OFFICE_ID` は未設定でも構いません。設定する場合はアカウントの所属事業所と一致させます。`ORGANIZATION_ID` も同様です。
5. 全体管理者を使用する場合、送信対象の `OFFICE_ID` と `ORGANIZATION_ID` を必ず設定します。
6. 最初に `debugChatworkSchedule` を手動実行します。この関数はChatworkへ投稿しません。
7. ログの `Firebaseログイン・所属確認OK`、`activeUsers`、`monthlySchedules` を確認します。個人情報を含む送信予定本文は共有しないでください。
8. 利用者キャッシュがないというエラーの場合は、対象事業所の管理画面または支援員ページで「利用者一覧を更新」を1回実行します。
9. 問題がなければ `testPostTodayScheduleToChatwork` で1回だけ投稿確認します。

既存のトリガーは関数名 `postTodayScheduleToChatwork` が変わらないため、コードを置き換えても作り直す必要はありません。今回の修正だけでFirestoreルールやHostingを変更する必要もありません。

## セキュリティ

GASのソースへパスワードやChatworkトークンを直接書かず、スクリプトプロパティだけに保存してください。Firebaseアカウントは、送信対象事業所に所属する専用の支援員または事業所管理者アカウントを推奨します。
