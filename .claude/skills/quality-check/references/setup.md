# コードチェックの導入

kadai で導入した形（PR #20）。新しいリポジトリでは、kadai の該当ファイルをひな形にする。どれも Issue → ブランチ → PR で入れる。

## 画面：oxlint（Vite の React テンプレートが oxlint のとき）

ひな形：`C:\Users\kanza\kadai\frontend\.oxlintrc.json`

- plugins：`react` `typescript` `oxc` `unicorn` `jsx-a11y` `import` `promise`
- categories：`correctness` はエラー、`suspicious` は警告
- rules：`react/rules-of-hooks`・`react/exhaustive-deps` をエラー（Vite の ESLint テンプレートと同じ）。`react/react-in-jsx-scope` は off（新しい JSX 変換では不要）。`import/no-unassigned-import` は CSS を許可
- `package.json` の `"lint": "oxlint --deny-warnings"`（警告でも失敗させる）
- `.oxlintrc.json` にはコメントを書ける。ルールを外したら理由を書く
- 効いているかの確認：依存配列の抜けた useEffect を一時ファイルに書いて `npx oxlint` し、エラーが出たら消す
- ESLint のテンプレートなら、typescript-eslint の `recommendedTypeChecked`・react-hooks・jsx-a11y を足す

## API サーバー：spring-javaformat + SpotBugs + コンパイラー警告（Maven）

ひな形：`C:\Users\kanza\kadai\backend\pom.xml` の `<build><plugins>` と `backend/spotbugs-exclude.xml`

- 最新版を確かめる：`curl -s https://repo1.maven.org/maven2/io/spring/javaformat/spring-javaformat-maven-plugin/maven-metadata.xml | grep release`（SpotBugs は `com/github/spotbugs/spotbugs-maven-plugin`）
- spring-javaformat：`validate` ゴール（validate フェーズ）。初回は `mvnw spring-javaformat:apply` で全体を整え、差分を確かめる（長いコメントが途中で折り返されることがあるので手で直す）
- SpotBugs：`check` ゴール（verify フェーズ）、`effort=Max`、`threshold=Low`
  - `EI_EXPOSE_REP` / `EI_EXPOSE_REP2` は Spring のコンストラクター注入と record の DTO で出る誤検知なので、理由を書いて除外する
  - `DM_CONVERT_CASE`（`toLowerCase()` にロケールがない）は本物の指摘。`Locale.ROOT` を付ける
- maven-compiler-plugin：`<showWarnings>true</showWarnings>` と `-Xlint:all,-processing,-serial`
- Gradle なら Spotless（`palantirJavaFormat` か spring-javaformat）と SpotBugs の Gradle プラグイン

## CI：GitHub Actions

ひな形：`C:\Users\kanza\kadai\.github\workflows\ci.yml`

- `pull_request` と `push`（main）で動かす。`permissions: contents: read`
- 画面：setup-node（npm キャッシュ）→ `npm ci` → `npm run lint` → `npm run build`
- API：setup-java（temurin 21、maven キャッシュ）→ `./mvnw -B verify`。テストが DB を使うなら `services:` で compose.yaml と同じ設定の DB を起動し、ヘルスチェックを付ける
- アクションの最新版：`gh api repos/actions/checkout/releases/latest --jq .tag_name`（setup-java・setup-node も同様）
- `mvnw` に実行権限がないと Linux で失敗する：`git ls-files -s backend/mvnw` が 100644 なら `git update-index --chmod=+x backend/mvnw`
- 導入したら PR で `gh pr checks <番号> --watch` を実行し、通ることを確かめてから報告する

## Terraform：fmt + validate + tflint + trivy

`run-checks.sh` は、`*.tf` があるフォルダごとに次を実行する。AWS には接続しない（plan はしない）。

| チェック | 中身 | 導入（Windows） |
| --- | --- | --- |
| `terraform fmt -check -diff -recursive` | 書式 | Terraform に入っている |
| `terraform validate` | 構文・参照・型（`.terraform` がなければ `init -backend=false` してから） | Terraform に入っている |
| tflint | Terraform の書き方（recommended）と AWS のルール（存在しないインスタンスタイプなど） | `winget install TerraformLinters.tflint` |
| `trivy config` | セキュリティの設定ミス（暗号化・公開範囲・IMDS など）。HIGH・CRITICAL で失敗 | `winget install AquaSecurity.Trivy` |
| shellcheck | `*.sh`（デプロイ・サーバーの設定） | `winget install koalaman.shellcheck` |

- winget で入れた直後は、開き直す前のシェルの PATH に入らない。`run-checks.sh` は winget のパッケージフォルダも探す
- tflint の設定：リポジトリの Terraform のフォルダに `.tflint.hcl` があればそれを、なければ [tflint.hcl](tflint.hcl)（このスキルの既定）を使う。リポジトリに入れるときは既定のものをコピーし、AWS のルールの版を最新にする（`gh api repos/terraform-linters/tflint-ruleset-aws/releases/latest --jq .tag_name`）
- `tflint --init` はプラグインを GitHub から取る。回数制限に当たったら `GITHUB_TOKEN=$(gh auth token)` を付ける
- trivy の指摘を直さないと決めたら、Terraform のフォルダの `.trivyignore` に ID と理由を書く（`# 理由` の行のあとに `AWS-0104` など）

### CI に入れるとき

```yaml
  terraform:
    name: Terraform（書式・構文・lint）
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: deploy/terraform
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@v4
      - run: terraform fmt -check -diff -recursive
      - run: terraform init -backend=false -input=false
      - run: terraform validate -no-color
      - uses: terraform-linters/setup-tflint@v6
      - run: tflint --init && tflint --format=compact
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

アクションの版は導入するときに `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` で確かめる。CI で tflint を動かすなら `.tflint.hcl` をリポジトリに入れる。

## 文書

README の「テストとコードチェック」と、要件定義書の技術構成（リポジトリ版と Claude Docs 版の両方）にコマンドとツールを書く。
