# Firestore本番候補ルール

## 2026年8月2日 本番反映結果

ユーザーの明示承認後、`firebase.production.firestore.rules.candidate.json` を使い、Firestore Rulesだけを本番へ反映しました。Hosting・Functions・Firestoreデータ・本番用 `firebase.json` / `.firebaserc` は変更していません。

- 新しい公開Ruleset ID: `98e92155-417f-49ad-9453-c0c5605fb9c0`
- 公開ルールのSHA-256: `fae910b046b7f3ad00edbce21f4bee4ff3ee508a25b74ee0c4493bed02b096d4`
- 監査済み候補のSHA-256: `fae910b046b7f3ad00edbce21f4bee4ff3ee508a25b74ee0c4493bed02b096d4`
- 公開ルールと候補: 一致
- 反映後の未認証スモーク: `maintenanceMode` は200、`users`・旧 `schedules`・旧 `announcements` は403
- 反映後の本番データ監査: Authentication / Firestore users 29件、所属・権限不足0、警告0
- メンテナンス: 解除状態

復旧用の旧ルールは反映後に上書きせず、次の状態で保持しています。

- 旧Ruleset ID: `d6bace2f-c45f-42da-97cc-89435da1564c`
- 旧ルールSHA-256: `e883d14040690e2be7b86ce43518168846c718578812fad777daf972fa4ad4f3`
- 復旧用ローカルコピー: `.firebase-deploy/firestore.production.rollback.rules`
- 復旧設定: `firebase.production.firestore.rules.rollback.json`（Firestore Rulesのみ）

反映後、ユーザーが全体管理者、事業所管理者、支援員、利用者の4役割を本番実機で確認し、問題なしと判定しました。Firestoreルールの初回本番反映段階は完了です。旧Rulesetの復旧コピーは引き続き保持します。

## 2026年8月2日 反映前監査結果

反映前監査は完了しています。この監査段階では本番Firestoreルールの作成・更新・公開切替を行いませんでした。最終dry-run後にも反映前時点の公開RulesetをGETで再取得し、次の復旧基準から変わっていないことを確認しました。

- 対象プロジェクト: `enzine-schedule`
- 反映前の公開Ruleset ID: `d6bace2f-c45f-42da-97cc-89435da1564c`
- 反映前の公開ルールSHA-256: `e883d14040690e2be7b86ce43518168846c718578812fad777daf972fa4ad4f3`
- 監査済み候補のSHA-256: `fae910b046b7f3ad00edbce21f4bee4ff3ee508a25b74ee0c4493bed02b096d4`
- 復旧用ローカルコピー: `.firebase-deploy/firestore.production.rollback.rules`
- 復旧マニフェスト: `.firebase-deploy/firestore-rules-rollback-manifest.json`
- 本番候補設定: `firebase.production.firestore.rules.candidate.json`（Firestore Rulesのみ）
- 復旧設定: `firebase.production.firestore.rules.rollback.json`（Firestore Rulesのみ）
- 本番用 `firebase.json` / `.firebaserc`: 変更なし

反映前ルールと候補には差分があります。候補は会社・事業所・役割・メンテナンス状態でアクセスを分離し、末尾の未定義コレクション拒否を追加します。監査中に、課金安全チェックを全体管理者以外も直接読める条件を候補から検出したため、全体管理者だけが読めるよう修正しました。事業所管理者・支援員・利用者の拒否テストも追加済みです。また、`system/maintenanceMode` の直接更新だけでなく直接削除も拒否し、全体管理者を再確認するCallable経由だけで切り替えます。

ローカル検証結果:

- Node安全テスト: 30件すべて合格
- Firebase Emulator: 会社作成、事業所作成、事業所管理者発行、運営会社名変更、4役割、別事業所拒否、予定、週報、お知らせ、教材、事業所別キャッシュ、メンテナンス、クエリ制約、既存Chatwork Callableを確認
- Firebase CLI dry-run: Rules専用候補がコンパイル成功
- dry-run後の本番Ruleset: ID・SHA-256とも不変

本番データのGET専用監査結果:

| コレクション | 件数 | 所属不足 | userId不足 | 想定外会社・事業所 |
| --- | ---: | ---: | ---: | ---: |
| `monthlySchedules` | 66 | 0 | 0 | 0 |
| `weeklyReports` | 116 | 0 | 0 | 0 |
| `weeklyReportUserStatus` | 26 | 0 | 0 | 0 |
| `monthlyAnnouncements` | 6 | 0 | 対象外 | 0 |

Authentication / Firestore usersは29件で、会社・事業所・`accessScope` の不足は0件、警告も0件です。メンテナンスは解除状態です。

旧 `schedules` 109件と旧 `announcements` 24件は本番に残っていますが、現行Hostingソースと配布候補からの参照は0件です。両コレクションは会社・事業所フィールドを持たないため、複数事業所の安全性を優先し、候補ルールでは新規アクセスを許可しません。データ自体は削除しません。切替時に古い画面を開いたままの端末があれば、最新画面への再読み込みが必要です。

実反映はユーザーの明示承認後に完了しました。`firebase.production.firestore.rules.candidate.json` だけを使用し、Hosting・Functions・データは同時変更していません。

本番用 `firebase.json` と `.firebaserc` は変更しません。本番候補は、ローカルEmulatorでテスト済みの `firestore.emulator.rules` から、次のコマンドで `.firebase-deploy/firestore.production.candidate.rules` へ生成します。

```powershell
npm run rules:prepare:candidate
npm run rules:audit:candidate
```

本番候補設定は `firebase.production.firestore.rules.candidate.json` です。この設定を作っただけでは、本番プロジェクトや本番ルールは変更されません。Hosting・Functionsを含む複合設定はRules反映に使用しません。

候補ルールは次を前提にしています。

- 全体管理者に `role=admin`, `active=true`, `accessScope=global` が設定済み
- 事業所管理者・支援員・利用者に `organizationId`, `groupId`, `officeId`, `accessScope` が設定済み
- `organizations/{organizationId}` と `offices/{officeId}` が先に存在する
- `system/maintenanceMode` には公開可能な案内文だけを保存する

匿名化した千葉相当データで事前監査と操作テストが終わるまで、この候補を本番へデプロイしてはいけません。ルールだけを先に反映すると、必要項目がない既存アカウントを締め出す可能性があります。

ローカルEmulatorへ投入した架空データの必須項目は次で監査できます。

```powershell
npm run production:readiness:local
```

この監査は接続先を `127.0.0.1` と `demo-enzine-schedule-local` に固定しており、本番Firebaseを読み書きしません。本番相当の確認では、匿名化したデータをローカルEmulatorへ複製してから同じ監査を実行します。
