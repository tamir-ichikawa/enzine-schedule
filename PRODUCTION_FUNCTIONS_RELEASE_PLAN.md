# 本番Functions段階反映計画

## 2026年8月2日 Hostingプレビュー追補

事業所管理者のヘッダーで、現行本番Firestoreルールが `offices/{officeId}` の直接読み取りを許可しない場合に旧表示へ戻ることを確認しました。本人の所属事業所名だけを認証付きで返す `getCurrentOfficeBrand` を12件目の候補として追加します。

- 未認証・停止ユーザーを拒否する
- Authenticationの本人プロフィールから会社ID・事業所IDを確定し、リクエスト値を信用しない
- 有効な所属事業所かつ会社所属が一致する場合だけ、事業所IDと表示名を返す
- 他事業所、ユーザー、メール、UIDは返さない
- エミュレーターで全体管理者・事業所管理者・支援員・利用者・別事業所を検証済み
- 既存11 Functionsの削除は行わず、新規1件だけを個別反映する
- Functions候補監査: 4ファイル / 12 Functionsで合格
- Firebase CLI dry-run: 合格、パッケージ46.9KB
- 本番との差分読み取り: 既存11件一致、新規 `getCurrentOfficeBrand` 1件、削除0件

この追補の反映後は本番Functions 12件を期待値とします。Hostingプレビューの更新は、Functions反映と独立して実施します。

### 追補の本番反映結果

- `getCurrentOfficeBrand` 1件だけを新規作成
- 既存11 Functionsの更新・削除なし
- 本番Functions一覧: 候補12件と完全一致
- 新Functionを含む認証必須6件: 未認証・空データをすべて `401 UNAUTHENTICATED` で拒否
- 本番データ、Firestoreルール、本番 `live` Hosting: 変更なし
- ローカル安全テスト: 24件合格
- 修正版Hosting: 同じ1日限定プレビューチャンネルだけを更新

2026年8月2日時点の `enzine-schedule` を読み取り専用で確認し、Functionsだけを他の公開物から分離して反映した計画と実施記録です。Firebase Authenticationのメール、UID、パスワード、Secret値、環境変数、Functions URLは記録・表示していません。

## 現在と候補の差分

| 区分 | 件数 |
| --- | ---: |
| 現在の本番Functions | 6 |
| 候補Functions | 11 |
| 既存Functionの更新 | 6 |
| 新規Function | 5 |
| 削除Function | 0 |

新規Functions:

- `getOrganizationManagementData`
- `upsertOrganization`
- `upsertOffice`
- `createOfficeAdminAccount`
- `setMaintenanceMode`

既存6 Functionsは削除せず、所属・権限分離とメンテナンス制御に対応させます。Chatwork系は `maintenanceMode.active=true` の間だけ支援員を拒否し、管理者は継続利用できます。通常時は `active=false` のため従来動作を維持します。

## 事業所ID修正Function

`migrateLegacyOfficeIdToEnzineChiba` はすでに本番に存在します。本番監査では `engine_chiba` が0件で補正不要ですが、今回削除するとFunctions削除という別の破壊的変更になるため維持します。候補では呼び出し権限を全体管理者だけに狭めています。現在の画面からは呼び出さず、自動実行もされません。

## 配布範囲

Functions候補は元の `functions` フォルダを直接指定せず、次の4ファイルだけを `.firebase-deploy/functions` へコピーします。

- `index.js`
- `chatwork.js`
- `package.json`
- `package-lock.json`

PC内の `functions/.secret.local` は存在だけを確認し、値を読み取らず、候補へコピーしていません。`.env*`、`.secret*`、`node_modules`、Git情報、Firebase debug logはupload ignoreへ固定しています。依存関係は候補フォルダでlockファイルどおりにインストールしますが、uploadには含めません。

## ロールバック

Git基準版 `fd68b3dcd2ddb769ced6ec007a6aa3e93488ab97` から、現在の本番一覧と一致する6 Functions・4ファイルのロールバック候補を `.firebase-deploy/functions-rollback` に生成済みです。ロールバック設定もFunctionsだけを対象にし、HostingとFirestoreルールを含みません。

ロールバックは、候補反映後に既存Functionが異常となり、新規5 Functionsを取り下げて既存6 Functionsへ戻す必要がある場合だけ、別途判断して実行します。自動ロールバックは行いません。

## 検証結果

- ローカル安全テスト: 19件合格
- Functions候補監査: 4ファイル / 11 Functions
- ローカルEmulator: 会社・事業所・事業所管理者・権限分離・メンテナンス・既存連携に合格
- Firebase CLI `--dry-run`: 合格
- dry-runパッケージサイズ: 46.66KB
- dry-run後の本番Functions: 6件のまま、変更なし
- 本番所属データ監査: 必須補完0件、メンテナンス `active=false`

## 実反映時の停止条件

次のどれかに該当した場合はデプロイしません。

1. 本番Functionsが6件から変わっている
2. 本番所属データ監査が不合格
3. バックアップ検証が不合格
4. 候補監査または `--dry-run` が不合格
5. Secret値の再入力・表示を要求された
6. Functions以外の削除・更新が提示された

実反映はFunctions専用設定を使用し、Hosting・Firestoreルール・本番データ・メンテナンス状態を同時変更しません。反映後は本番Functionsが11件で削除0件、全Functionが正常状態、所属データ監査合格、メンテナンス `active=false` をGET中心に確認します。

## 本番反映結果

2026年8月2日、ユーザーの明示承認後にFunctions専用設定で反映しました。

- 既存6 Functions: 更新成功
- 新規5 Functions: 作成成功
- 削除Functions: 0
- 本番Functions一覧: 候補11件と完全一致
- Authentication 28件 / Firestore `users` 28件: 維持
- 所属・権限不足: 0
- メンテナンス: `active=false` を維持
- Hosting・Firestoreルール: 変更なし
- ロールバック: 不要、未実行

新規5 Functionsには認証情報なし・空データの確認リクエストだけを送り、すべて `401 UNAUTHENTICATED` で拒否されることを確認しました。個人情報、認証情報、変更入力は送信していません。

反映後のローカル安全テストは20件合格です。現在の停止位置は本番Hostingのプレビューチャンネル作成前です。
