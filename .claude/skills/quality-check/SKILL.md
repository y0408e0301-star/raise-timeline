---
name: quality-check
description: バックエンド（Spring Boot など）・フロントエンド（React など）・インフラ（Terraform・デプロイ用のシェルスクリプト）の全体的な品質チェック。要件定義書・README を読んだうえで、コードチェック（lint・書式・静的解析・型チェック・テスト）を実行し、デファクトスタンダード（React・Spring Boot の標準的な書き方）から外れている点や、要件定義書と実装の差を重要度順に報告する。チェックの仕組みがなければ導入する。「品質チェック」「全体をレビューして」「標準から外れていないか」「lint を入れて」「要件定義書と実装が合っているか」「PR の前にチェックして」「Terraform をチェックして」「インフラの設定を見て」と言われたとき、機能をひととおり作り終えたときは、明示的に頼まれていなくてもこのスキルを使う。Raise timeline（Spring Boot + React + PostgreSQL + S3）用。
---

# 品質チェック

## 進め方

1. **リポジトリのルールを読む**：CONTRIBUTING.md・CLAUDE.md。ファイルを変えるときは必ず Issue → ブランチ → PR の順で行う（チェックの導入や書式の修正も同じ）
2. **文書を読む**：[docs/README.md](../../../docs/README.md) の文書一覧から、要件定義書（機能一覧・非機能要件）、機能定義書（機能ごとの API（案）・入力の確認・エラー）、基本設計書（画面・データ・インフラ）、技術スタック定義書（ツールとバージョン）と、README（機能の一覧・コマンド）を読む。チェックの基準はここに書かれた内容
3. **自動チェックを実行する**：リポジトリのルートで `bash .claude/skills/quality-check/scripts/run-checks.sh .`。画面の lint・ビルド（型チェック込み）、API サーバーの verify（書式・静的解析・テスト）、Terraform の fmt・validate・tflint・trivy、シェルスクリプトの shellcheck をまとめて動かし、結果を表で出す（ツールがないものは「未導入」と出る）
   - チェックの仕組みがない・弱いときは [references/setup.md](references/setup.md) の手順で導入する（ユーザーに頼まれたとき。頼まれていなければ報告で提案する）
   - API サーバーのテストが DB を使うなら、先に DB を起動する（start-servers スキル）
4. **コードを全部読む**：ファイル数が少なければ全ファイル、多ければ controller・service・entity・主要な画面コンポーネントを優先する。観点は [references/checklist.md](references/checklist.md)
5. **要件定義書と実装を突き合わせる**：
   - 機能定義書（docs/functions/fn01〜fn09）の「6. API（案）」とコントローラーの `@*Mapping` の数・パス・メソッドが一致するか（`grep -rn "Mapping(" backend/src/main/java`、`grep -hE "^\| (GET|POST|PUT|PATCH|DELETE) " docs/functions/*.md`）
   - 機能定義書のエラー（エラーコード・HTTP ステータス）、入力の上限（280 文字、画像 4 枚・5MB など）、メッセージ一覧（M-1〜）と実装が合っているか
   - データ設計書のテーブル定義・索引と Flyway の SQL が合っているか
   - 機能一覧にない機能が実装されていないか、実装済みの機能が README の「機能の一覧」で「予定」のままになっていないか
   - インフラ設計書（構成図・リソース一覧・セキュリティグループ SG-1〜）と Terraform が合っているか（ポート・インスタンスタイプ・セキュリティグループ・バージョン）
   - 技術スタック定義書のバージョンと、pom.xml・package-lock.json・compose.yaml・Terraform が合っているか
6. **報告する**（下の形式）

## 報告の形式

1. **実行したチェックと結果**：コマンドごとに成功・失敗、失敗なら件数と主な内容。導入・変更したチェックがあれば PR の URL
2. **標準から外れている点・直したほうがよい点**：バックエンド・フロントエンド・インフラに分け、**重要度の高い順**に番号を付ける。各項目に「何が問題か」「標準的なやり方は何か」「いまの規模で実害があるか」を書く。直していないものは直していないと明記する
3. **良い点**：標準どおりにできている点を短く（直さなくてよいものを判断できるように）
4. **要件定義書との差**

- 指摘はするが、**頼まれていない修正はしない**。直す項目はユーザーに選んでもらい、項目ごとに Issue を立てる
- lint の指摘を消すためにルールを外すときは、設定ファイルかコードのコメントに理由を書く。意図した書き方かどうか迷うものは外さずに報告する
- 文書の正本は docs/ の Markdown だけ（Claude Docs とは同期しない）。直すときは docs/README.md の書き方のルール（版数・改訂履歴・本体の版数も上げる）に従う

## Raise timeline のチェック

正は README の「テストとコードチェック」。食い違ったらそちらに合わせ、この表を直す。API（`backend/`）と CI は作った。画面・Terraform はまだない（作成予定）。導入するときは技術スタック定義書 3.5 のツールとバージョンを使い、kadai の設定をひな形にする（[references/setup.md](references/setup.md)）。

| 対象 | コマンド（それぞれのフォルダで） | 中身 | 設定 |
| --- | --- | --- | --- |
| 画面 | `npm run lint` | oxlint（警告もエラー） | `frontend/.oxlintrc.json` |
| 画面 | `npm test` | Vitest・Testing Library のテスト | `frontend/vite.config.ts` の `test` |
| 画面 | `npm run build` | `tsc -b`（型チェック）+ Vite のビルド | `frontend/tsconfig.*.json` |
| 画面 | `npm run test:e2e` | Playwright（登録 → 投稿 → いいね → フォロー → 検索。サーバーを全部起動しておく。start-servers スキル） | `frontend/playwright.config.ts` |
| API | `.\mvnw.cmd verify` | spring-javaformat・SpotBugs・テスト（DB は Testcontainers が起動するので、Docker Desktop を動かしておく） | `backend/pom.xml`、`backend/spotbugs-exclude.xml` |
| CI | PR ごとに自動 | いまは API の verify だけ。画面の lint・test・build と Terraform の fmt・validate・tflint は、作ったときに足す（E2E は除く） | `.github/workflows/ci.yml` |
| Terraform | `deploy/terraform` で `terraform fmt -check -recursive`・`terraform validate`・`tflint`・`trivy config .` | 書式・構文・lint・セキュリティ（plan・apply は AWS に接続するので、品質チェックでは実行しない） | `deploy/terraform/.tflint.hcl` |

- 書式で失敗したら `.\mvnw.cmd spring-javaformat:apply` で直す
- インフラの文書は [インフラ設計書](../../../docs/design/infra-design.md)。Terraform を変えたら、構成図・リソース一覧・セキュリティグループの表と合っているかを確かめる

### 理由があってチェックの対象外にしているもの

まだない。対象外にしたら、どこで・何を・理由をここに書く。見直すときは理由がまだ成り立つかを確かめる。

### 前回までのチェックで指摘し、まだ直していないもの

まだない。
