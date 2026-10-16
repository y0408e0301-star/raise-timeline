# 品質チェックの観点

「標準」は、公式ドキュメント・公式テンプレート（Spring Initializr、create-vite）・公式ガイドが勧める書き方を指す。好みの問題は指摘しない。

## Spring Boot

| 観点 | 標準的なやり方 | よくある外れ方 |
| --- | --- | --- |
| 依存の注入 | コンストラクター注入（`final` フィールド） | `@Autowired` のフィールド注入 |
| 層の分け方 | controller は HTTP、service は業務処理、repository は DB | service が `ResponseStatusException` など Web の例外を投げる、controller に業務処理 |
| エラー処理 | 独自の例外 + `@RestControllerAdvice`、`spring.mvc.problemdetails.enabled=true` で RFC 9457 の形 | 例外ごとにバラバラな JSON、500 のまま返す |
| 入力チェック | DTO（record）に Bean Validation、`@Valid`。クエリパラメーターの制約も効く（Spring 6.1 以降） | controller で手書きの if |
| DTO | リクエスト・レスポンスは record。エンティティをそのまま返さない | エンティティを JSON で返す（遅延読み込み・循環参照の事故） |
| JPA | 関連は `@ManyToOne` など。`open-in-view=false`。`ddl-auto=validate` + Flyway/Liquibase | id を Long で持ち手で結合、`ddl-auto=update` |
| 決まった値の集合 | Java の enum（`@Enumerated(STRING)` やコンバーター） | String + 正規表現が何か所にも散らばる |
| トランザクション | service に `@Transactional`、読み取りは `readOnly = true` | controller に付ける、付け忘れ |
| 設定 | 環境ごとの値は環境変数・プロファイル | パスワードの直書き（開発用の既定値は可） |
| テスト | `@SpringBootTest` / `@WebMvcTest` + MockMvcTester、DB は Testcontainers + `@ServiceConnection` | 手元の開発用 DB が起動していないと動かない |
| 同時実行 | 並び順や採番は一意制約・ロックで守る | `max()+1` で採番（利用者 1 人なら実害は小さい） |
| パッケージ | 規模が大きくなったら機能別か層別に分ける | 全部 1 パッケージ（小規模なら後回しでよい） |

## React（Vite + TypeScript）

| 観点 | 標準的なやり方 | よくある外れ方 |
| --- | --- | --- |
| 型 | `strict`（TypeScript 6 は既定で有効。`tsc --showConfig` では出ないので、暗黙の any を書いて試す） | strict 無効、`any` だらけ |
| Hooks | rules-of-hooks・exhaustive-deps を守る | 依存配列の抜け、条件付きで呼ぶ |
| useEffect での fetch | AbortController か「無視フラグ」で後始末。データ取得が多いなら TanStack Query など | 後始末なし（遅れて返った結果で上書き） |
| 状態 | 派生できる値は state にしない。不変な更新（スプレッド） | state の重複、直接書き換え |
| リスト | 安定した `key`（id） | 配列の index を key に |
| アクセシビリティ | クリックできるものは `button`。独自の部品は role と キー操作。確認は `alertdialog`。ラベルは `label` / `aria-label` | `div` / `article` に onClick、ボタンの中にボタン |
| Fast Refresh | コンポーネントのファイルはコンポーネントだけ export | 定数や関数も一緒に export |
| エラー表示 | API のエラー理由を利用者に分かる言葉で出す | 「HTTP 400」だけ |
| テスト | ロジックは Vitest、操作は Playwright | 計算ロジックにテストがない |

## Terraform（AWS）

基準は HashiCorp の [Style Guide](https://developer.hashicorp.com/terraform/language/style) と、AWS の公式ドキュメント（Well-Architected のセキュリティの柱）。自動チェック（fmt・validate・tflint・trivy）で拾えないものを読んで確かめる。

| 観点 | 標準的なやり方 | よくある外れ方 |
| --- | --- | --- |
| ファイルの分け方 | `versions.tf`（terraform・required_providers）、`variables.tf`、`outputs.tf`、`main.tf`、規模に応じてリソースの種類別 | 1 ファイルに全部、provider の設定が散らばる |
| バージョン | `required_version` と各プロバイダーの `version`（`~>`）を固定、`.terraform.lock.hcl` をコミット | バージョン指定なし、lock ファイルを .gitignore |
| 変数・出力 | `type` と `description` を付ける。秘密は `sensitive = true` | 型なしの変数、説明のない出力 |
| 秘密情報 | パスワードは Secrets Manager などに置き、コードにも state にも残さない（RDS は `manage_master_user_password`）。`*.tfvars`・state・鍵は .gitignore | パスワードを変数の既定値や tfvars に直書き、state をコミット |
| state | 1 人なら手元の state でよい。複数人・複数台なら S3 のリモート state + ロック | 手元の state を共有フォルダで回す |
| ネットワーク | 受信は必要なポートと送信元だけ（CloudFront はプレフィックスリスト、DB は SG 参照）。DB は `publicly_accessible = false` | `0.0.0.0/0` で 22 番や DB のポートを開ける |
| IAM | 最小権限（Resource を特定の ARN に絞る）。EC2 にはインスタンスプロファイル | `*` の Action / Resource、アクセスキーを EC2 に置く |
| EC2 | IMDSv2 を必須（`http_tokens = "required"`）、EBS を暗号化 | IMDSv1 のまま、暗号化なし |
| RDS | ストレージの暗号化、自動バックアップ、本番なら削除保護 | 暗号化なし、`backup_retention_period = 0` |
| 作り直し | 作り直されると困るもの（EC2・DB）は `lifecycle`（`ignore_changes`・`prevent_destroy`）で守るか、plan の replace を必ず確かめる手順にする | AMI の更新で EC2 が勝手に作り直される |
| CI | PR ごとに `fmt -check`・`validate`・tflint（plan は AWS の認証が要るので任意） | 手元でしか確かめない |

trivy の指摘は、課題・個人の規模では実害が小さいもの（WAF・アクセスログ・マルチ AZ・KMS の顧客管理キーなど）が多い。直すかどうかは費用と規模で判断し、直さないものは理由を書いて報告する（`.trivyignore` に理由付きで書いてもよい）。

## シェルスクリプト

| 観点 | 標準的なやり方 | よくある外れ方 |
| --- | --- | --- |
| エラー処理 | `set -euo pipefail`、失敗したら理由を出して 0 以外で終わる | 途中で失敗しても続く |
| 変数 | `"$var"` とクォートする（shellcheck の SC2086 など） | クォートなしで空白や空の値で壊れる |
| 改行 | `.gitattributes` で `*.sh text eol=lf`（Windows で編集しても Linux で動く） | CRLF で `$'\r': command not found` |

## 共通

- コードチェックが CI（GitHub Actions など）で PR ごとに自動で動くか
- README のコマンド・機能一覧・API 一覧が実装と合っているか
- 依存関係のバージョンが古すぎないか（Spring Boot・React・Vite・Node・Java の LTS）
