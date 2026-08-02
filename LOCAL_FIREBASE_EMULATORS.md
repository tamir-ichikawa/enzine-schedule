# ローカルFirebase検証環境

Authentication、Firestore、Cloud Functions、HostingをPC内だけで動かすための環境です。会社・事業所・権限分離の将来実装を、本番の千葉環境と本番データに触れず検証する土台として使います。全体管理者による運営会社・事業所・事業所管理者の管理機能と、管理者だけが利用できるサイトメンテナンスも、この環境だけで検証できます。実装範囲と残るセキュリティ課題は [MULTI_OFFICE_FOUNDATION.md](MULTI_OFFICE_FOUNDATION.md) を確認してください。

## 安全設計

- 本番用 `firebase.json` と `.firebaserc` は変更せず、ローカル専用 `firebase.emulators.json` を使います。
- 起動コマンドは実在しない `demo-enzine-schedule-local` を必ず指定します。`demo-` プロジェクトはFirebaseの実サービスへフォールバックしません。
- ブラウザは `localhost` / `127.0.0.1` かつ `?firebaseEmulators=1` を付けた場合だけエミュレーターへ接続します。
- ローカルホストで明示指定がない場合は、本番Firebaseへ接続せず停止します。
- 公開サイト上の `?firebaseEmulators=1` は無視されるため、本番がPC内エミュレーターへ誤接続することはありません。
- ローカルFirestoreルールは `users/{uid}` の役割・会社・事業所を確認し、本人または同一事業所に必要な操作だけを許可します。このルールは本番デプロイ設定から参照されません。
- シードは接続先を `127.0.0.1` と `demo-` プロジェクトに固定しています。実在ユーザー・本番データ・本番認証情報は使いません。

## 初回準備

Node.js 22、npm、JDK 21以上を用意し、リポジトリ直下で次を実行します。起動スクリプトは `JAVA_HOME` のほか、Windowsの一般的なJDK配置とAndroid Studio同梱JBR 21も自動検出します。

```powershell
npm install
npm --prefix functions install
```

## 起動とデータ投入

ターミナル1でエミュレーターを起動します。

```powershell
npm run firebase:emulators
```

起動後、ターミナル2でテストデータを投入し、3サービスの連携を検証します。

```powershell
npm run firebase:seed
npm run firebase:verify
```

常駐起動やブラウザ確認が不要な場合は、次の1コマンドでAuthentication、Firestore、Functionsを一時起動し、架空データの投入と検証後に自動停止できます。

```powershell
npm run firebase:test
```

ブラウザは次のURLから開きます。最初の1回だけ明示フラグが必要で、同じタブ内の画面遷移中は有効状態が維持されます。

- アプリ: `http://127.0.0.1:5000/?firebaseEmulators=1`
- メンテナンス中の管理者専用入口: `http://127.0.0.1:5000/maintenance-admin-login.html?firebaseEmulators=1`
- Emulator UI: `http://127.0.0.1:4000/`

接続を解除するときは `http://127.0.0.1:5000/?firebaseEmulators=0` を開くか、タブを閉じます。

全体管理者で支援員ページを開くと、「操作対象事業所」からローカル事業所A・Bなどを選択できます。選択するとページが再読み込みされ、ヘッダーと利用者一覧が選択先へ切り替わります。アナウンス、ワークショップ・教材、予定、週報の読み書きも同じ選択先を使用します。事業所管理者ではこの選択欄は表示されず、URLへ別事業所IDを付けても本人の所属事業所から変更されません。

管理者専用入口は公開メンテナンス画面からリンクしません。メンテナンス中だけログイン欄を表示し、通常公開中に直接開くと通常ログインへ戻ります。URLを知っていること自体を権限とは扱わず、認証後に `users/{uid}` の有効状態と `role=admin` を確認します。

ログイン画面とログイン後の各画面は、共通の `enzine_icon.png` を使用します。ロゴを変更するときはこの1ファイルを同名のPNG画像で上書きします。事業所別ロゴやURLによるロゴ切替は使用しません。

## ローカル専用アカウント

パスワードはすべて `LocalTest!2026` です。メールアドレスは予約ドメイン `example.test` の架空アドレスです。

| 想定権限 | メールアドレス | 現行role | 将来用scope | 事業所 |
| --- | --- | --- | --- | --- |
| 全体管理者 | `global.admin@example.test` | `admin` | `global` | `demo-office-a` |
| 事業所管理者 | `office.admin@example.test` | `admin` | `office` | `demo-office-a` |
| 支援員 | `staff@example.test` | `staff` | `office` | `demo-office-a` |
| 利用者A | `user.a@example.test` | `user` | `self` | `demo-office-a` |
| 利用者B | `user.b@example.test` | `user` | `self` | `demo-office-b` |

現行画面との互換性のため `role` は既存の `admin / staff / user` を維持し、`organizationId`、`officeId`、`accessScope` を追加しています。`organizations` と `offices` に架空の運営会社1件・事業所2件も作成します。会社・事業所管理用CallableとローカルFirestoreルールの両方で、役割と所属範囲を確認します。本番ルールへの反映はまだ行っていません。

## 確認内容

`npm run firebase:verify` は次をPC内だけで確認します。

1. Authentication Emulatorに5種類以上のテストアカウントがあること
2. Firestore Emulatorに対応する `users`、`organizations`、`offices` があること
3. 全体管理者が運営会社、事業所、事業所管理者を順に作成できること
4. 運営会社名を変更しても会社IDと事業所・事業所管理者の所属が維持されること
5. 事業所管理者による会社管理、管理者発行、旧事業所ID移行がサーバー側で拒否されること
6. 事業所管理者が支援員・利用者を作成すると、入力値にかかわらず本人の会社・事業所へ固定されること
7. 利用者一覧キャッシュが事業所別に分けて更新されること
8. 未認証、他事業所、権限外のFirestore直接アクセスが拒否されること
9. 全体管理者、事業所管理者、支援員、利用者に必要なFirestore操作が許可されること
10. 全件取得を拒否し、会社・事業所・役割で絞った一覧クエリだけが許可されること
11. 支援員としてローカル認証し、Functions Emulatorの認証付きCallableからFirestoreを読めること
12. 全体管理者だけがメンテナンスを切り替えられ、開始中は管理者だけが業務データを利用できること
13. メンテナンス解除後に支援員・利用者の通常アクセスが戻ること
14. 事業所管理者のお知らせ・教材は自事業所だけ書き込み可能で、他事業所は拒否されること
15. 全体管理者は操作対象として選べる別事業所のお知らせ・教材を書き込めること

静的な安全ガードとFunctions構文は `npm run check` で確認できます。エミュレーターを停止するとデータは消えるため、次回は再度 `npm run firebase:seed` を実行してください。
