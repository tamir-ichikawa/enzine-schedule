# 本番反映前の安全手順

この文書は本番反映の準備手順です。記載したコマンドや候補ファイルを作っただけでは、本番Firebaseは変更されません。実際のデプロイ、Firebase Consoleでの編集、バックアップ取得は、対象と日時を再確認しユーザーが明示承認した回だけ実施します。2026年8月2日の初回バックアップだけは、ユーザー承認後に取得・検証済みです。

## 現在の安全境界

- 本番用 `firebase.json` と `.firebaserc` は変更しない
- 本番候補は `firebase.production.candidate.json` に分離する
- Hosting候補は `.firebase-deploy/public` の許可リスト配布物だけを公開対象にする
- Firestore候補はローカルでテスト済みのルールと同一ハッシュから生成する
- 準備・監査スクリプトに `firebase deploy` を含めない
- PC内の監査は `127.0.0.1` と `demo-enzine-schedule-local` に固定する

## ローカル総合事前監査

Emulatorを起動して架空データを投入した後に実行します。

```powershell
npm run firebase:emulators
```

別のターミナル:

```powershell
npm run firebase:seed
npm run production:preflight:local
```

次をまとめて確認します。

1. JavaScript・Functions構文と安全テスト
2. Hosting配布物にscripts、tests、docs、rules、package、secret系が含まれない
3. 本番候補ルールがローカル検証済みルールと同一
4. 会社・事業所・権限分離とメンテナンス制御のEmulatorテスト
5. 有効な全体管理者が1名以上いる
6. 全ユーザーに会社ID、事業所ID、正しいaccessScopeがある
7. 参照先の会社・事業所が存在し、メンテナンスが解除済み

本番相当データの確認では、実在名・メール・本文を匿名化した複製をEmulatorへ投入します。本番データをこのリポジトリへ保存してはいけません。

## 本番の読み取り専用監査

本番プロジェクトを変更せず、必須項目の不足件数だけを確認する場合に使います。Firebase CLIのメール、トークン、実在名、メール、UID、本文は出力しません。

```powershell
npm run production:access:check
npm run production:readiness:readonly
```

監査スクリプトは対象を `enzine-schedule` に固定し、Firestore・Authentication・Cloud Resource ManagerへGETリクエストだけを送ります。TLS検証を無効化した環境では停止し、Windowsの信頼済み証明書ストアを使います。この監査はデータ補完、バックアップ、メンテナンス切替、ルール変更、デプロイを行いません。

## 取得済みの移行前バックアップ

2026年8月2日17時01分ごろ（日本時間）、ユーザー承認後に次のバックアップを取得しました。

- 対象プロジェクト: `enzine-schedule`
- Firestore保存先: `gs://enzine-schedule-486612480549-backups/pre-multi-office/2026-08-02T08-01-46-184Z`
- Firestore: 4オブジェクト、`overall_export_metadata` あり
- Authentication: 28アカウント
- パスワード復元設定: 署名鍵を含めて取得済み（値は出力しない）
- ローカル保管先: `.production-backups/2026-08-02T08-01-46-184Z`
- 本番データ補完、メンテナンス切替、Functions・Hosting・ルールのデプロイ: 未実施

専用Cloud Storageバケットは `ASIA-NORTHEAST1`、均一バケットレベルアクセス有効、公開アクセス防止、バージョニング有効です。Functions用の既存システムバケットは利用していません。

ローカルのAuthエクスポートとハッシュ設定には、パスワードハッシュ・ソルト・署名鍵などの機密情報が含まれます。`.production-backups/` はGit対象外で、バックアップフォルダのWindows ACLは現在の実行ユーザー、SYSTEM、Administratorsだけへ制限しています。メール送付、チャット添付、リポジトリへの追加は禁止します。

再検証はデータ内容を表示せず、次で実行できます。

```powershell
npm run production:backup:verify
```

検証済み項目は、Auth 28件とチェックサム、ハッシュ設定と署名鍵の存在、Firestore 4オブジェクトの件数・合計サイズ・復元メタデータ、バケット設定、ローカルACLです。別Firebase環境への実インポートは書き込みと追加コストを伴うため、まだ実施していません。

## 初回導入の順序

初回はHosting、Functions、Firestoreルールを一括反映しません。

本番の読み取り監査結果と、既存IDを変更しない所属補完案は [PRODUCTION_DATA_MIGRATION_PLAN.md](PRODUCTION_DATA_MIGRATION_PLAN.md) を確認します。

2026年8月2日に移行前バックアップ、31件の本番所属データ補完、Functions 11件の段階反映、期限付きHostingプレビューの作成まで完了しました。その後、正式な運営会社名・事業所名と正式な事業所管理者1件が登録され、Authentication / Firestore usersは29件になりました。事業所名を安全に取得する `getCurrentOfficeBrand` 1件を個別追加し、本番Functionsは候補と一致する12件です。修正版プレビューに合格し、検証済み24ファイルを本番 `live` Hostingへ反映しました。全体管理者・事業所管理者・支援員・利用者の4役割による本番確認も合格しています。Firestoreルール反映前監査を経て、ユーザー明示承認後にRules専用設定で本番反映しました。新しい公開Rulesetは監査済み候補SHA-256と一致し、未認証スモークと反映後データ監査も合格しています。さらに反映後の4役割による本番実機確認も問題なしと判定され、Firestoreルール段階は完了しました。旧Rulesetは復旧用に上書きせず保持しています。メンテナンスは `active=false` です。詳細は [PRODUCTION_RULES_CANDIDATE.md](PRODUCTION_RULES_CANDIDATE.md) を確認します。

Functionsの現在・候補差分、Secret除外、dry-run、ロールバック候補は [PRODUCTION_FUNCTIONS_RELEASE_PLAN.md](PRODUCTION_FUNCTIONS_RELEASE_PLAN.md) を確認します。

Hostingプレビューの公開範囲、1日失効、手元確認項目は [PRODUCTION_HOSTING_PREVIEW_PLAN.md](PRODUCTION_HOSTING_PREVIEW_PLAN.md) を確認します。プレビューはHosting専用設定を使い、Authの承認済みドメインを変更しません。

本番 `live` Hostingの固定対象、直前version、停止条件、確認・ロールバック条件は [PRODUCTION_HOSTING_LIVE_PLAN.md](PRODUCTION_HOSTING_LIVE_PLAN.md) を確認します。

### 1. 反映前停止条件

次のどれかに該当したら作業を開始しません。

- 有効な `role=admin`, `accessScope=global` の全体管理者でログイン確認できない
- 全体管理者が1名だけで、Firebase Consoleを操作できる別の復旧担当者がいない
- 既存ユーザーの `organizationId`, `groupId`, `officeId`, `accessScope` に未設定がある
- FirestoreとAuthenticationの復元可能なバックアップ・エクスポートを確認していない
- 現行HostingリリースとFunctionsソースを戻せる状態にしていない
- ローカル総合事前監査が合格していない

### 2. 事前データ準備

固定IDを先に決め、変更可能な名前とは分離します。

1. 千葉の `organizationId` を決める
2. 千葉の `officeId` を既存互換値を確認して決める
3. `organizations/{organizationId}` と `offices/{officeId}` を準備する
4. 全体管理者へ `accessScope=global` を設定する
5. 事業所管理者・支援員・利用者へ所属項目を段階的に補完する
6. 補完後の匿名化データで事前監査を再実行する

会社名・事業所名は後から変更できますが、確定したIDは変更しません。

### 3. 段階リリース

各段階で異常があれば次へ進みません。

1. メンテナンスを開始せず、Functions候補だけを反映
2. 全体管理者用Callableと既存Callableの動作を確認
3. Hosting候補をプレビューチャンネルで確認
4. Hostingを通常公開状態のまま反映し、4役割でログイン確認
5. 本番候補ルールを反映し、同一事業所の許可と他事業所の拒否を確認
6. `system/maintenanceMode.active=false` を再確認
7. 別日にメンテナンス開始・解除の短時間リハーサルを行う

実際のFirebaseコマンドは、対象プロジェクトと選択中アカウントを直前に読み取り確認してから、その回の承認を得て実行します。この文書には誤実行防止のため本番デプロイコマンドを固定記載しません。

## メンテナンス中の管理者入口

- 公開画面からリンクしない `maintenance-admin-login.html` を、管理者の安全な運用資料またはパスワード管理ツールへ保存する
- URLを知っていることは権限と扱わず、Firebase Authenticationと `users/{uid}.role=admin` で確認する
- 通常公開中は専用入口が通常ログインへ戻ることを確認する
- 管理者アカウントは強固な固有パスワードを使い、可能ならMFAを有効にする

## 緊急解除

管理画面またはFunctionsが動かず解除できない場合は、Firebase Consoleへアクセスできる復旧担当者が次を行います。

1. 対象が本番プロジェクトであることを再確認
2. Firestore Databaseで `system/maintenanceMode` を開く
3. `active` をbooleanの `false` に変更する
4. 公開ログイン画面が通常表示へ戻ることを確認
5. 支援員・利用者各1名で必要データの読み取りを確認
6. 障害原因、操作者、解除時刻を運用記録へ残す

Firebase ConsoleのIAM権限を持つ担当者が不在の場合、この復旧はできません。メンテナンス開始前に必ず担当者とログイン手段を確認します。

## ロールバック

- Hosting: Firebase Hostingのリリース履歴から直前の正常リリースへ戻す
- Functions: 直前の正常コミットのFunctionsだけを再反映する
- Firestoreルール: 直前の正常ルールを保存しておき、その版へ戻す
- データ: 事前バックアップから復元する。名前変更ではなく固定ID変更を伴う移行は、復元確認なしに実行しない

ロールバック後は `maintenanceMode.active=false`、全体管理者ログイン、支援員・利用者の主要画面、Chatwork連携、週一報告を確認します。

## 初回導入後に追加する防御

初回の安全導入後、次を順に検討します。

1. メンテナンス・会社・事業所・管理者操作の追記型監査ログ（ローカル実装・Emulator検証済み。本番未反映。詳細は [ADMIN_AUDIT_LOG_FOUNDATION.md](ADMIN_AUDIT_LOG_FOUNDATION.md)）
2. 管理者MFA
3. Firebase App Check
4. 管理者停止時のセッション失効
5. Content-Security-Policyの互換テストと導入
