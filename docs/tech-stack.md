# 技術スタック定義書：タイムライン型 SNS アプリ（Raise timeline）

| 項目 | 内容 |
| --- | --- |
| 文書番号 | RT-TECH |
| 版数 | 0.1 |
| 作成日 | 2026-10-16 |
| 最終更新日 | 2026-10-16 |
| 作成者 | （氏名） |
| 元にした文書 | [要件定義書](requirements/requirements.md) 版数 0.3、[基本設計書](design/basic-design.md) 版数 0.1 |
| 状態 | 承認待ち |

## 改訂履歴

| 版数 | 日付 | 内容 | 作成者 |
| --- | --- | --- | --- |
| 0.1 | 2026-10-16 | 初版。kadai と同じ構成（Spring Boot・React・PostgreSQL）に、S3（開発では MinIO）を足して選定 | （氏名） |

## 承認

| 役割 | 氏名 | 承認日 | 署名 |
| --- | --- | --- | --- |
| 承認者 | | | |
| 作成者 | | | |

---

## 1. 本書の目的

使う言語・フレームワーク・サービス・開発ツールを決め、その理由を記録する。要件定義書の次の項目に対応する。

| 要件定義書 | 内容 |
| --- | --- |
| P-1 | データを保存する RDB（PostgreSQL）のバージョンと動かす場所を決める |
| P-2 | 画像を保存するクラウドストレージ（S3）と、開発中の代わり（MinIO）を決める |
| P-3 | 公開する場合の AWS のサービスを決める。構成は[インフラ設計書](design/infra-design.md)に書く |

---

## 2. 選定の条件

要件定義書と基本設計書から、使うものには次のことが求められる。

| No | 確認すること | 理由 |
| --- | --- | --- |
| 1 | RDB で、部分一致の検索を索引で速くできる | P-1、S-4、N-5 |
| 2 | パスワードを BCrypt で保存でき、ログインの仕組みを自分で一から作らなくてよい | N-12、A-5〜A-8 |
| 3 | 画像をクラウドストレージに置き、署名付き URL を発行できる | P-2、N-14 |
| 4 | 開発中は AWS を使わずに、手元で同じ動きを確かめられる | P-4（費用） |
| 5 | 画面と API の両方で自動テストを書け、GitHub Actions で動かせる | N-24 |
| 6 | スマートフォンの幅でも使える画面を作れる | N-20 |

あわせて、次の前提も満たす。

| 前提 | 根拠 |
| --- | --- |
| kadai と同じ Spring Boot・React・PostgreSQL を使い、学んだことを生かす | 要件定義書 1.1（学習の目的） |
| ソースコードは GitHub で管理する | N-21 |

---

## 3. 選定の結果

### 3.1 API（バックエンド）

| 区分 | 決定 | バージョン | 理由 |
| --- | --- | --- | --- |
| 言語 | Java | 21 | kadai と同じ。長期サポート版 |
| フレームワーク | Spring Boot | 4.1 | kadai と同じ |
| ログイン・権限 | Spring Security | Spring Boot に合わせる | セッション認証・BCrypt・CSRF 対策がそろっている（条件 2） |
| データベースの読み書き | Spring Data JPA（Hibernate） | 同上 | kadai と同じ。検索の SQL（データ設計書 8 章）はネイティブクエリで書く |
| 入力の確認 | Spring Boot Starter Validation | 同上 | 文字数などの確認を宣言で書ける |
| 表の作成・変更 | Flyway | 同上 | kadai と同じ。表の変更の履歴をリポジトリに残せる |
| S3 の操作 | AWS SDK for Java | 2.x | 画像の保存・削除と署名付き URL の発行（条件 3）。接続先を変えれば MinIO にもそのまま使える |
| 稼働の確認 | Spring Boot Actuator | 同上 | ALB のヘルスチェック（/actuator/health）に使う |
| ビルド | Maven | 3.9（Maven Wrapper） | kadai と同じ |

### 3.2 画面（フロントエンド）

| 区分 | 決定 | バージョン | 理由 |
| --- | --- | --- | --- |
| 言語 | TypeScript | 6.0 | kadai と同じ。API の入出力の形を型で確かめられる |
| ライブラリ | React | 19 | kadai と同じ |
| 画面の切り替え | React Router | 7 | 11 個の画面（G-1〜G-11）を URL で切り替える。kadai は 1 画面だったため新しく使う |
| 開発サーバー・ビルド | Vite | 8 | kadai と同じ。ポート 5173 |
| 見た目 | CSS Modules | （Vite に含まれる） | 部品ごとに CSS を分けられ、追加のライブラリが要らない |

### 3.3 データベース・ストレージ

| 区分 | 開発環境 | AWS | 理由 |
| --- | --- | --- | --- |
| データベース | PostgreSQL 17（Docker のコンテナ） | Amazon RDS for PostgreSQL 17 | kadai と同じ。pg_trgm で部分一致の検索を速くできる（条件 1） |
| 画像の保存先 | MinIO（Docker のコンテナ、ポート 9000） | Amazon S3 | S3 と同じ API で使えるため、開発中に費用をかけずに試せる（条件 4） |

### 3.4 公開（AWS）

構成と費用は[インフラ設計書](design/infra-design.md)に書く。

| 区分 | 決定 | 理由 |
| --- | --- | --- |
| ロードバランサー | Elastic Load Balancing（ALB） | HTTPS の終端とヘルスチェック。P-3 |
| サーバー | Amazon EC2（t3.small、Amazon Linux 2023） | Spring Boot の jar をそのまま動かせる。P-3 |
| 証明書・DNS | AWS Certificate Manager、Amazon Route 53 | ALB を HTTPS にする（N-9）。独自ドメインは U-2 で決める |
| 秘密の値 | AWS Systems Manager Parameter Store | N-16 |
| サーバーの操作 | AWS Systems Manager Session Manager | SSH を開けずに EC2 を操作できる |
| ログ・監視 | Amazon CloudWatch | |
| 費用の通知 | AWS Budgets | R-1 |
| AWS の構築 | Terraform（候補） | 消して作り直すことが多いため（インフラ設計書 8 章）。構築を始めるときに決める |

### 3.5 開発ツール

| 区分 | 決定 | 理由 |
| --- | --- | --- |
| ソース管理 | Git・GitHub | N-21 |
| 自動のチェック | GitHub Actions | N-24。Pull Request ごとに書式・lint・テスト・ビルドを動かす |
| 開発用のコンテナ | Docker Compose | PostgreSQL と MinIO を 1 つのコマンドで起動する |
| API のテスト | JUnit 5、MockMvc、Testcontainers | kadai と同じ。本物の PostgreSQL でテストする |
| 画面のテスト | Vitest 5、Testing Library | kadai と同じ |
| 画面を通したテスト | Playwright | kadai と同じ。主な流れ（登録 → 投稿 → いいね → フォロー → 検索）を確かめる |
| Java の書式・静的解析 | spring-javaformat、SpotBugs | kadai と同じ |
| TypeScript の lint | oxlint | kadai と同じ |
| エディタ | Visual Studio Code | |

---

## 4. 候補の比較

kadai と構成をそろえることを前提にしたため、比較したのは新しく足すものだけである。「2. 選定の条件」の No ごとに ○・△・× をつける。

### 4.1 画像の保存先

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **S3（開発では MinIO）** | — | — | ○ | ○ | ○ | — | 採用。P-2 |
| データベースに保存 | — | — | × | ○ | ○ | — | 署名付き URL が使えず、データベースが大きくなる |
| EC2 のディスクに保存 | — | — | × | ○ | ○ | — | EC2 を作り直すと消える。2 台以上にできない |

### 4.2 画面の切り替え

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **React Router** | — | — | — | ○ | ○ | ○ | 採用。利用者が最も多く、情報を探しやすい |
| TanStack Router | — | — | — | ○ | ○ | ○ | URL の型を確かめられるが、学ぶことが増える |

### 4.3 ユーザー検索

| 候補 | 1 | 2 | 3 | 4 | 5 | 6 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **PostgreSQL の LIKE ＋ pg_trgm の索引** | ○ | — | — | ○ | ○ | — | 採用。追加のサービスが要らない |
| OpenSearch などの全文検索サービス | ○ | — | — | △ | △ | — | 1,000 人の検索には大きすぎ、費用もかかる |

---

## 5. 費用

AWS の月額の概算は[インフラ設計書](design/infra-design.md) 7 章のとおり（常に動かした場合 約 10,600 円）。構築の前に AWS Pricing Calculator で確かめ、ここに記録する。

| サービス | 項目 | 金額 | 確認日 | 確認した URL |
| --- | --- | --- | --- | --- |
| （構築前に記入） | | | | |
