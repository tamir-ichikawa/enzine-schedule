# 本番Hosting live反映計画

## 固定対象

- Firebaseプロジェクト: `enzine-schedule`
- Hostingサイト: `enzine-schedule`
- 専用設定: `firebase.production.hosting.live.json`
- 公開元: `.firebase-deploy/public`
- 公開候補: 許可リスト24ファイル
- 反映対象: Hostingのみ

`firebase.json` と `.firebaserc`、Functions、Firestoreルール、Authentication、本番データ、メンテナンス状態は同時変更しません。

## 2026年8月2日の反映直前記録

- 直前の `live` version: `38c212d94c178851`
- 直前の `live` 更新時刻: 2026年7月7日11時33分頃（日本時間）
- 検証済みpreview version: `b3965362451e56c5`
- 検証済みpreviewチャンネル: `multi-office-20260802`
- preview手元確認: 全体管理者と正式な事業所管理者で合格
- 本番Functions: 候補と一致する12件
- Authentication / Firestore users: 正式な29件
- メンテナンス: 解除状態

## 停止条件

次のいずれかが不一致なら `live` へ反映しません。

1. 公開候補が24ファイルではない
2. 秘密情報、Functions、Firestoreルール、開発資料がHosting候補に含まれる
3. `firebase.production.hosting.live.json` がHosting以外を含む
4. live設定が検証済みpreview設定と一致しない
5. 本番Functionsが候補12件と一致しない
6. 所属不足・不正、メンテナンス有効、全体管理者不在がある
7. `firebase.json` または `.firebaserc` に差分がある
8. 自動テストまたは構文検査が不合格

## 反映後の確認

1. `live` のversionと更新時刻が新しくなったことを確認する
2. 配信された `index.html`、`admin.html`、`admin.js?v=101`、`ui-common.js?v=84` が候補と一致する
3. HTMLが `no-store` で、主要セキュリティヘッダーが付いている
4. 本番Functions 12件、本番ユーザー29件、メンテナンス解除を再確認する
5. 全体管理者、事業所管理者、支援員、利用者で短い手元確認を行う

## 2026年8月2日の反映結果

- Hosting専用設定で24ファイルを `live` へ反映成功
- 新しい `live` version: `941df4488934ef7e`
- 直前の `live` version: `38c212d94c178851` をロールバック基準として維持
- `index.html`、`admin.html`、`admin.js?v=101`、`ui-common.js?v=84`: HTTP 200、候補と一致
- HTML: `no-store`、`nosniff`、frame拒否、referrer抑止、カメラ・マイク・位置情報無効、検索登録拒否を確認
- 本番Functions: 候補と一致する12件
- Authentication / Firestore users: 正式な29件を維持
- 所属不足・警告: 0
- メンテナンス: 解除状態を維持
- Functions、Firestoreルール、Authentication、本番データ: Hosting反映による変更なし
- ロールバック: 不要、未実行

現在の停止位置は、4役割の短い本番画面確認待ちです。

### 利用者による本番確認結果

2026年8月2日、利用者が本番 `live` で全体管理者・事業所管理者・支援員・利用者の4役割を確認し、すべて問題なしとの報告を受けました。

- 全体管理者: 正常
- 事業所管理者: 事業所名ヘッダー、役割表示、管理項目の非表示を含め正常
- 支援員: 正常
- 利用者: 正常
- Hostingロールバック: 不要、未実行

本番Hosting段階は完了です。次の停止位置はFirestoreルール反映前監査です。

## 2026年8月2日の事業所別キャッシュ更新修正

事業所管理者が「利用者一覧キャッシュ更新」を押した際、全体共通 `system/activeUsers` の読み取りで `permission-denied` になる問題を修正しました。Firestore Rulesは正しく全体共通キャッシュを拒否しており、画面側が不要な共通キャッシュ読み取りを行っていたことが原因です。

- 事業所管理者は `system/activeUsers_{officeId}` だけを作成・更新する
- 全体共通 `system/activeUsers` の読み取り・更新は全体管理者だけに維持する
- ローカルテスト32件とEmulatorの事業所分離確認に合格
- 期限付きプレビューで事業所管理者が更新成功することを実機確認
- Hosting専用設定で本番 `live` へ反映
- 新しい `live` version: `6d1e9dfb2901f57d`
- 主要4ファイルのHTTP 200・SHA-256一致、必須セキュリティヘッダーを確認
- 本番Functions 15件・削除0件を維持
- Functions、Firestore Rules、本番データ、メンテナンス状態はHosting反映では変更なし

## 異常時

新しい画面で重大な問題がある場合は利用を止め、Firebase Hostingのリリース履歴から直前の正常な `live` version `38c212d94c178851` へ戻します。データ、Functions、FirestoreルールはHostingロールバックに含めません。
