# 本番所属データ移行計画

2026年8月2日に `enzine-schedule` を読み取り専用で監査した結果に基づく計画と実施記録です。実在名、メール、UID、本文、認証情報は監査結果へ出力していません。移行前バックアップの取得・検証後、ユーザーの明示承認を受けて本番所属データ補完を実施しました。デプロイとメンテナンス有効化はまだ行っていません。

## 読み取り監査結果

| 項目 | 件数 |
| --- | ---: |
| Authentication | 28 |
| Firestore `users` | 28 |
| `user` | 26（有効24） |
| `staff` | 1（有効1） |
| `admin` | 1（有効1） |
| `organizations` | 0 |
| `offices` | 0 |
| `groupId=enzine` 設定済み | 10 |
| `officeId=enzine_chiba` 設定済み | 10 |
| `groupId` / `officeId` 未設定 | 18 |
| その他の `groupId` / `officeId` | 0 |
| 有効な `accessScope=global` | 0 |
| `system/maintenanceMode` | 未作成 |

AuthとFirestoreプロフィールは28件すべて対応していました。既存の所属IDに競合はなく、`engine_chiba` やその他事業所IDへの一括修正は不要です。

## 固定ID

- 運営会社ID: `enzine`
- 互換用 `groupId`: `enzine`
- 千葉事業所ID: `enzine_chiba`

関連付けは変更可能な名前ではなく、この固定IDを使います。運営会社名・事業所名は空欄で開始しても既存表示を継続でき、後から全体管理画面で追加・変更できます。名前の変更時にIDは変更しません。

## 初回補完案

### 新規ドキュメント

1. `organizations/enzine`
   - `name: ""`
   - `active: true`
   - `groupId: "enzine"`
2. `offices/enzine_chiba`
   - `name: ""`
   - `active: true`
   - `organizationId: "enzine"`
   - `groupId: "enzine"`
   - `officeId: "enzine_chiba"`
3. `system/maintenanceMode`
   - `active: false`
   - `message: ""`
   - `scheduledEndText: ""`

### `users` 28件

- 全28件へ `organizationId: "enzine"` を追加
- 未設定18件だけへ `groupId: "enzine"` を追加
- 未設定18件だけへ `officeId: "enzine_chiba"` を追加
- 唯一の既存 `admin` 1件へ `accessScope: "global"` を追加
- `staff` 1件へ `accessScope: "office"` を追加
- `user` 26件へ `accessScope: "self"` を追加
- 既存の `active`、role、名前、メール、予定、週一報告は変更しない
- 無効な利用者2件を有効化しない

## 直前dry-run結果

2026年8月2日、バックアップ検証後にGET専用のdry-runを実行し、次を確認しました。

| 予定処理 | 件数 |
| --- | ---: |
| 新規ドキュメント | 3 |
| 更新対象 `users` | 28 |
| `organizationId=enzine` の追加 | 28 |
| `groupId=enzine` の追加 | 18 |
| `officeId=enzine_chiba` の追加 | 18 |
| role別 `accessScope` の追加 | 28 |
| 合計Firestore書き込み | 31 |

Authentication 28件とFirestore `users` 28件はすべて対応し、role件数・有効件数も監査基準と一致しました。既存の異なる値、空値、想定外ID、未対応role、Authとの不一致はありませんでした。dry-runは個人情報やUIDを出力せず、本番へGETリクエストだけを送っています。

実書き込み候補は31書き込みを単一のFirestore `commit` にまとめます。既存28文書にはdry-run直後に再取得する `updateTime` を前提条件として付け、新規3文書には `exists=false` を付けます。1件でも監査後に変更された場合、または作成予定文書が先に作られた場合はcommit全体を失敗させ、部分反映を防ぎます。

再dry-run:

```powershell
npm run production:data:plan:readonly
```

## 書き込み安全条件

実行前に次をすべて満たす必要があります。

1. FirestoreとAuthenticationの復元可能なバックアップを取得済み
2. バックアップの保存先と復元担当者を確認済み
3. 読み取り監査を再実行し、件数と既存IDがこの計画から変わっていない
4. 有効な既存adminが正確に1件であることを再確認
5. 移行処理は不足フィールドだけを追加し、既存値を上書きしない
6. 読み取り時の更新時刻を前提条件にし、監査後に変更されたドキュメントを自動更新しない
7. 途中失敗時はメンテナンスを開始せず、追加内容を監査してから継続または復元を判断する

2026年8月2日時点で1は、Firestore管理エクスポート、AuthユーザーJSON、パスワード復元用ハッシュ設定の取得と非機密検証まで完了しました。別Firebase環境への実インポートは未実施です。2の復元担当者と機密ローカルコピーの長期保管方法は、本番補完の承認前に運用上の確認が必要です。3と4は直前再監査とdry-runで一致を確認済みですが、実commitの直前にも同じ確認を再実行します。

## 移行後の確認

1. 同じ読み取り監査で必須補完が0件になる
2. 既存adminが全体管理者としてログインできる
3. 既存staffと利用者が従来画面を利用できる
4. 無効利用者2件が無効のままである
5. `enzine_chiba` の事業所名が空欄の間は従来の `enzine スケジュール` 表示を継続する
6. 運営会社名・事業所名を後から追加・変更しても固定IDが変わらない

## 本番補完の実施結果

2026年8月2日、直前のバックアップ再検証とGET専用dry-runが両方合格した後、31書き込みを1回のFirestoreアトミックcommitで実行しました。

- `organizations/enzine`: 新規作成、`active=true`、名前は空欄
- `offices/enzine_chiba`: 新規作成、`active=true`、運営会社は `enzine`、名前は空欄
- `system/maintenanceMode`: 新規作成、`active=false`
- `users` 28件: 不足フィールドだけを追加
- 既存role・有効状態・既に設定済みの `groupId` / `officeId`: 保持
- Authentication: 変更なし
- Functions・Hosting・Firestoreルール: デプロイなし

commit直後の内部検証に加え、独立したGET専用監査で次を確認しました。

| 確認項目 | 結果 |
| --- | ---: |
| Authentication | 28 |
| Firestore `users` | 28 |
| 運営会社 | 1 |
| 事業所 | 1 |
| 有効な全体管理者 | 1 |
| `organizationId` 不足 | 0 |
| `groupId` 不足 | 0 |
| `officeId` 不足 | 0 |
| `accessScope` 不足・不正 | 0 |
| 警告 | 0 |

移行前dry-runは旧状態を厳密に固定しているため、補完成功後の再実行は意図的に不合格になります。今後の通常確認には次を使います。

```powershell
npm run production:readiness:readonly
```

## 次の承認境界

本番所属データ補完は完了しました。次は候補Functionsだけの段階反映です。既存Callableへの影響、直前ソースへ戻す手順、対象プロジェクトを確認し、別途明示承認を受けてから実施します。Functionsと同時にHostingやFirestoreルールを反映せず、メンテナンスは `active=false` のまま維持します。
