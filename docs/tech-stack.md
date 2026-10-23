# 技術スタック定義書：タイムライン型 SNS アプリ（Raise timeline）

| 項目 | 内容 |
| --- | --- |
| 文書番号 | RT-TECH |
| 版数 | 0.9 |
| 作成日 | 2026-10-16 |
| 最終更新日 | 2026-10-24 |
| 作成者 | （氏名） |
| 元にした文書 | [要件定義書](requirements/requirements.md) 版数 0.6、[基本設計書](design/basic-design.md) 版数 0.4 |
| 状態 | 承認待ち |

## 改訂履歴

| 版数 | 日付 | 内容 | 作成者 |
| --- | --- | --- | --- |
| 0.1 | 2026-10-16 | 初版。kadai と同じ構成（Spring Boot・React・PostgreSQL）に、S3（開発では MinIO）を足して選定 | （氏名） |
| 0.2 | 2026-10-16 | 技術スタックをタスク管理アプリ（kadai）とほぼ同じにし、バージョンも kadai と同じものに指定（3 章）。EC2 を t4g.micro（ARM）に、AWS の構築を Terraform に決定。kadai との違いを 4 章にまとめ、候補の比較を 5 章に移した | （氏名） |
| 0.3 | 2026-10-17 | ログインをセッション認証から JWT 認証に変更。Spring Security の OAuth2 Resource Server（JWT の作成・確認）を追加し、4 章を直し、5.3（ログインの方式の比較）を追加した | （氏名） |
| 0.4 | 2026-10-18 | 画面を作り、React Router（7.18.4）と Testing Library のバージョンを決めた。画面の部品のテストに使う jsdom・user-event・jest-dom を 3.5 に追加した | （氏名） |
| 0.5 | 2026-10-19 | 開発中の画像の保存先を、MinIO から S3 の開発用のバケットに変更した。MinIO の公式のイメージが配られなくなったため、自動のテストでは chainguard/minio を使う（3.3・3.5）。AWS SDK のバージョン（2.56.0）を決めた（3.1） | （氏名） |
| 0.6 | 2026-10-23 | 公開の入口を ALB から CloudFront に変更し、ACM・Route 53 をなくした（3.4・4 章）。Actuator の用途を、公開した後の稼働の確認に直した（3.1） | （氏名） |
| 0.7 | 2026-10-23 | 画面を通したテスト（Playwright 1.63.0）を入れ、ブラウザはパソコンの Microsoft Edge を使うことにした（3.5） | （氏名） |
| 0.8 | 2026-10-24 | API のテストに、Controller・Service・Repository を 1 つずつ確かめる単体テストを足した。Mockito と、Spring Boot のテスト用の部品（@WebMvcTest・@DataJpaTest）を使う（3.5）。テスト用の DB は今までどおり Testcontainers の PostgreSQL とし、H2 は使わない | （氏名） |
| 0.9 | 2026-10-24 | API の仕様書（OpenAPI）をコードから作る springdoc-openapi（3.1.1）を 3.1 に、画面の型を作る openapi-typescript（7.13.0）と、配布用の HTML を作る Redocly CLI（2.62.1）を 3.5 に追加した（基本設計書 2.1.1） | （氏名） |

## 承認

| 役割 | 氏名 | 承認日 | 署名 |
| --- | --- | --- | --- |
| 承認者 | | | |
| 作成者 | | | |

---

## 1. 本書の目的

使う言語・フレームワーク・サービス・開発ツールとそのバージョンを決め、その理由を記録する。要件定義書の次の項目に対応する。

| 要件定義書 | 内容 |
| --- | --- |
| P-1 | データを保存する RDB（PostgreSQL）のバージョンと動かす場所を決める |
| P-2 | 画像を保存するクラウドストレージ（S3）と、自動のテストで使う代わり（MinIO）を決める |
| P-3 | 公開する場合の AWS のサービスを決める。構成は[インフラ設計書](design/infra-design.md)に書く |

### 1.1 基本の方針

技術スタックは、タスク管理アプリ（[kadai](https://github.com/y0408e0301-star/kadai)）とほぼ同じにする。**バージョンも kadai と同じものを使う**。kadai にないもの（S3・Parameter Store など、本アプリで新しく必要になるもの）だけを新しく選ぶ。kadai との違いは 4 章にまとめる。

| 理由 | 内容 |
| --- | --- |
| 学習 | kadai で覚えたことをそのまま使い、新しく学ぶことを S3・フォロー・検索などに絞る |
| 動作の実績 | kadai で一緒に動くことを確かめた組み合わせなので、相性の問題が起きにくい |
| 保守 | 2 つのリポジトリで、バージョンを上げる作業を同じ手順で行える |

3 章のバージョンは、2026-10-16 時点で kadai の pom.xml・package-lock.json・compose.yaml・deploy/terraform で使っているものである。kadai でバージョンを上げたときは、本アプリも合わせて上げるかどうかを決め、本書の版数を上げて記録する。

---

## 2. 選定の条件

要件定義書と基本設計書から、使うものには次のことが求められる。

| No | 確認すること | 理由 |
| --- | --- | --- |
| 1 | RDB で、部分一致の検索を索引で速くできる | P-1、S-4、N-5 |
| 2 | パスワードを BCrypt で保存でき、JWT の作成・確認を自分で一から作らなくてよい | N-12、N-25、A-5〜A-8 |
| 3 | 画像をクラウドストレージに置き、署名付き URL を発行できる | P-2、N-14 |
| 4 | 開発中は AWS を使わずに、手元で同じ動きを確かめられる | P-4（費用） |
| 5 | 画面と API の両方で自動テストを書け、GitHub Actions で動かせる | N-24 |
| 6 | スマートフォンの幅でも使える画面を作れる | N-20 |

あわせて、次の前提も満たす。

| 前提 | 根拠 |
| --- | --- |
| kadai と同じ技術・同じバージョンを使う | 1.1 |
| ソースコードは GitHub で管理する | N-21 |

---

## 3. 使う技術とバージョン

「kadai」の列：○ は kadai と同じもの・同じバージョン、新 は本アプリで新しく足すもの。

### 3.1 API（バックエンド）

| 区分 | 使うもの | バージョン | kadai | 用途・理由 |
| --- | --- | --- | --- | --- |
| 言語 | Java | 21 | ○ | 長期サポート版 |
| フレームワーク | Spring Boot | 4.1.1 | ○ | spring-boot-starter-parent で指定 |
| Web | Spring Boot Starter Web MVC | Spring Boot 4.1.1 に合わせる | ○ | API |
| データベースの読み書き | Spring Boot Starter Data JPA（Hibernate） | 同上 | ○ | 検索の SQL（データ設計書 8 章）はネイティブクエリで書く |
| 入力の確認 | Spring Boot Starter Validation | 同上 | ○ | 文字数などの確認 |
| 表の作成・変更 | Flyway（spring-boot-starter-flyway・flyway-database-postgresql） | 同上 | ○ | 表の変更の履歴をリポジトリに残す |
| データベースの接続 | PostgreSQL JDBC Driver | 同上 | ○ | |
| ログイン・権限 | Spring Boot Starter Security | 同上 | 新 | BCrypt・CSRF 対策・権限の確認（条件 2）。セッションは使わない（STATELESS）。kadai はログインがないため新しく使う |
| JWT の作成・確認 | Spring Boot Starter Security OAuth2 Resource Server（spring-boot-starter-security-oauth2-resource-server。中で Nimbus JOSE + JWT を使う） | 同上 | 新 | JWT（HS256）の署名・期限の確認と、ログインのときの JWT の作成（JwtEncoder）。Cookie から JWT を読むところだけを自分で書く（機能定義書 3.2）。JWT を作るライブラリ（jjwt など）を別に足さなくてよい |
| 稼働の確認 | Spring Boot Starter Actuator | 同上 | 新 | 公開した後の稼働の確認（/actuator/health。反映・起動のスクリプトが CloudFront の URL で確かめる） |
| API の仕様書 | springdoc-openapi（springdoc-openapi-starter-webmvc-ui） | 3.1.1（pom.xml の springdoc.version） | 新 | Controller・record から OpenAPI 3.1 の仕様書を作り、開発中は Swagger UI で見る（基本設計書 2.1.1）。3.x が Spring Boot 4 に対応している。公開先では出さない |
| S3 の操作 | AWS SDK for Java 2.x（s3） | 2.56.0（BOM の software.amazon.awssdk:bom で固定し、pom.xml の aws-sdk.version に書く） | 新 | 画像の保存・削除と署名付き URL（条件 3）。接続先を変えれば MinIO にも使える |
| ビルド | Maven | 3.9.16（Maven Wrapper 3.3.4） | ○ | mvnw をリポジトリに入れる |

「同上」は、バージョンを自分で書かず、Spring Boot 4.1.1 が決めるバージョンを使うという意味である（kadai と同じ書き方）。

### 3.2 画面（フロントエンド）

| 区分 | 使うもの | バージョン | kadai | 用途・理由 |
| --- | --- | --- | --- | --- |
| 実行環境 | Node.js | 24 | ○ | GitHub Actions の setup-node と同じ |
| 言語 | TypeScript | 6.0.3（package.json は ~6.0.2） | ○ | |
| ライブラリ | React・React DOM | 19.3.0（package.json は ^19.2.8） | ○ | |
| 開発サーバー・ビルド | Vite | 8.3.2（package.json は ^8.3.0） | ○ | ポート 5173 |
| Vite の React 対応 | @vitejs/plugin-react | 6.1.1 | ○ | |
| 型定義 | @types/react・@types/react-dom・@types/node | 19.3.0・19.3.0・24.19.1 | ○ | |
| 画面の切り替え | React Router（react-router） | 7.18.4 | 新 | 11 個の画面（G-1〜G-11）を URL で切り替える。kadai は 1 画面のため新しく使う |
| 見た目 | CSS Modules | （Vite に含まれる） | 新 | 部品ごとに CSS を分けられ、追加のライブラリが要らない |

kadai で使っている dnd-kit（ドラッグ＆ドロップ）は、本アプリでは使わない。

バージョンの「（package.json は …）」は、package.json に書く範囲である。実際に入るバージョンは package-lock.json で固定し、kadai の package-lock.json と同じものにそろえる。

### 3.3 データベース・ストレージ

| 区分 | 開発環境 | AWS | kadai | 用途・理由 |
| --- | --- | --- | --- | --- |
| データベース | PostgreSQL 17（Docker のイメージ postgres:17） | Amazon RDS for PostgreSQL 17（engine_version = "17"） | ○ | pg_trgm で部分一致の検索を速くできる（条件 1） |
| 画像の保存先 | Amazon S3 の開発用のバケット。自動のテストでは MinIO（Docker のイメージ chainguard/minio。ダイジェストで固定。中身は MinIO RELEASE.2026-09-22T19-25-18Z） | Amazon S3 | 新 | 開発中は本番と同じ S3 で確かめる（費用は月 1 円未満）。テストは S3 と同じ API の MinIO を使い、AWS の鍵を GitHub に渡さない（条件 4）。MinIO の公式のイメージ（minio/minio）は配られなくなったため、Chainguard が作り直したものを使う |

### 3.4 公開（AWS）

構成と費用は[インフラ設計書](design/infra-design.md)に書く。

| 区分 | 使うもの | バージョン・種類 | kadai | 用途・理由 |
| --- | --- | --- | --- | --- |
| サーバー | Amazon EC2 | t4g.micro（ARM・メモリ 1GB）、Amazon Linux 2023（arm64） | ○ | Spring Boot の jar を systemd で動かす |
| サーバーの Java | Amazon Corretto | 21（java-21-amazon-corretto-headless） | ○ | ヒープの上限は kadai と同じ -Xmx384m から始める |
| データベース | Amazon RDS for PostgreSQL | 17、db.t4g.micro | ○ | |
| 入口・HTTPS | Amazon CloudFront | PriceClass_200 | ○ | HTTPS の終端（*.cloudfront.net の証明書。独自ドメインは取らない）。EC2 は 1 台なので ALB は置かない（インフラ設計書 方針 2） |
| 画像の保存先 | Amazon S3 | | 新 | P-2 |
| 秘密の値 | AWS Systems Manager Parameter Store | | 新 | N-16。kadai は AMI を探すのにだけ使っている |
| サーバーの操作 | AWS Systems Manager Session Manager | | 新 | SSH を開けずに EC2 を操作する |
| ログ・監視 | Amazon CloudWatch | | 新 | |
| 費用の通知 | AWS Budgets | | 新 | R-1 |
| AWS の構築 | Terraform | 1.16.5（required_version = ">= 1.9"） | ○ | 消して作り直すことが多いため（インフラ設計書 8 章） |
| Terraform の AWS プロバイダー | hashicorp/aws | 6.68.0（version = "~> 6.0"） | ○ | |
| Terraform の lint | TFLint ＋ tflint-ruleset-aws | ruleset 0.49.0 | ○ | |

### 3.5 開発ツール

| 区分 | 使うもの | バージョン | kadai | 用途・理由 |
| --- | --- | --- | --- | --- |
| ソース管理 | Git・GitHub | | ○ | N-21 |
| 自動のチェック | GitHub Actions | actions/checkout@v7、actions/setup-node@v7、actions/setup-java@v6（temurin 21）、actions/upload-artifact@v7、hashicorp/setup-terraform@v4、terraform-linters/setup-tflint@v6 | ○ | N-24。Pull Request ごとに書式・lint・テスト・ビルドを動かす |
| 開発用のコンテナ | Docker Compose | | ○ | PostgreSQL を起動する |
| API のテスト | JUnit 5、MockMvc、Testcontainers（testcontainers-junit-jupiter・testcontainers-postgresql・testcontainers-minio） | Spring Boot 4.1.1 に合わせる | ○ | 本物の PostgreSQL と MinIO（S3 の代わり）でテストする。開発用の DB は使わない |
| API の単体テスト | Mockito（Service のテストで Repository・S3 を偽物にする）、@WebMvcTest（Controller だけを動かす）、@DataJpaTest（Repository だけを動かす） | Spring Boot 4.1.1 に合わせる（Mockito 5.23.0） | 新 | 層ごとに確かめ、落ちたときに原因の層が分かるようにする。Repository のテストの DB も Testcontainers の PostgreSQL にする。H2 は pg_trgm・照合順序（COLLATE "C"）など PostgreSQL にしかない機能を確かめられないため使わない |
| 画面のテスト | Vitest | 5.0.3 | ○ | |
| 画面の部品のテスト | Testing Library（@testing-library/react・@testing-library/user-event・@testing-library/jest-dom） | 16.3.3・14.6.8・7.0.1 | 新 | 画面が増えるため、部品を表示して確かめる。user-event で入力・クリックをまね、jest-dom で「押せない」「フォーカスがある」などを確かめる |
| テストの中のブラウザ | jsdom | 30.1.3 | 新 | Vitest の中で画面の部品を表示するため（Node.js にはブラウザの DOM がない） |
| 画面を通したテスト | Playwright（@playwright/test） | 1.63.0 | ○ | 主な流れ（登録 → 投稿 → いいね → フォロー → 検索）を確かめる。ブラウザはパソコンの Microsoft Edge（kadai と同じ。ブラウザのダウンロードは要らない） |
| Java の書式 | spring-javaformat | 0.0.48 | ○ | |
| Java の静的解析 | SpotBugs（spotbugs-maven-plugin） | 4.10.4.1 | ○ | |
| TypeScript の lint | oxlint | 1.86.0（package.json は ^1.81.0） | ○ | |
| API の型の生成 | openapi-typescript | 7.13.0 | 新 | API の仕様書（docs/api/openapi.yaml）から画面の型（src/api-schema.d.ts）を作る（npm run gen:api）。TypeScript 5 向けと書かれているが、6 でも動くので package.json の overrides で本アプリの TypeScript を使わせる |
| API の仕様書の HTML | Redocly CLI（@redocly/cli） | 2.62.1 | 新 | CI で仕様書から 1 ファイルの HTML を作る。npx で使い、package.json には入れない |
| エディタ | Visual Studio Code | | ○ | |

---

## 4. kadai との違い

| 項目 | kadai | 本アプリ | 理由 |
| --- | --- | --- | --- |
| ログイン | なし | Spring Security（JWT 認証・BCrypt） | 複数のユーザーが使うため（FN-01） |
| 画面の数 | 1 画面 | 11 画面（React Router） | G-1〜G-11 |
| 公開の入口 | CloudFront → EC2 の nginx | CloudFront → EC2 の Spring Boot | 画面も Spring Boot から配るので nginx は使わない |
| 画像 | なし | S3（テストでは MinIO）、AWS SDK for Java | FN-04 |
| 稼働の確認 | なし | Spring Boot Actuator | 反映・起動のスクリプトが、アプリが動き出したことを確かめるため |
| ドラッグ＆ドロップ | dnd-kit | 使わない | 本アプリに並べ替えの機能がないため |

---

## 5. 候補の比較

kadai と同じものを使うことを前提にしたため、比較したのは新しく足すものだけである。「2. 選定の条件」の No ごとに ○・△・× をつける。

### 5.1 画像の保存先

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **S3（テストでは MinIO）** | — | — | ○ | ○ | ○ | — | 採用。P-2 |
| データベースに保存 | — | — | × | ○ | ○ | — | 署名付き URL が使えず、データベースが大きくなる |
| EC2 のディスクに保存 | — | — | × | ○ | ○ | — | EC2 を作り直すと消える。2 台以上にできない |

### 5.2 画面の切り替え

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **React Router** | — | — | — | ○ | ○ | ○ | 採用。利用者が最も多く、情報を探しやすい |
| TanStack Router | — | — | — | ○ | ○ | ○ | URL の型を確かめられるが、学ぶことが増える |

### 5.3 ログインの方式

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **JWT 認証（Cookie に入れる）** | — | ○ | — | ○ | ○ | — | 採用。サーバーにログインの状態を持たないため、EC2 を 2 台以上にしても使える。Web API の認証として広く使われている方式を学べる。HttpOnly の Cookie に入れて JavaScript から読めなくする（N-25） |
| JWT 認証（Authorization ヘッダー） | — | ○ | — | ○ | ○ | — | CSRF 対策は要らなくなるが、JWT を画面の JavaScript で持つため、XSS で盗まれるおそれがある |
| セッション認証（Spring Security の既定） | — | ○ | — | ○ | ○ | — | 作るのは一番簡単だが、ログインの状態をサーバーのメモリに持つため、EC2 を作り直す・2 台にするとログインが切れる |

### 5.4 ユーザー検索

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **PostgreSQL の LIKE ＋ pg_trgm の索引** | ○ | — | — | ○ | ○ | — | 採用。追加のサービスが要らない |
| OpenSearch などの全文検索サービス | ○ | — | — | △ | △ | — | 1,000 人の検索には大きすぎ、費用もかかる |

---

## 6. 費用

AWS の月額の概算は[インフラ設計書](design/infra-design.md) 7 章のとおり（常に動かした場合 約 5,600 円）。構築の前に AWS Pricing Calculator で確かめ、ここに記録する。

| サービス | 項目 | 金額 | 確認日 | 確認した URL |
| --- | --- | --- | --- | --- |
| （構築前に記入） | | | | |
