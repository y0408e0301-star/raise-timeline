# 文書一覧：タイムライン型 SNS アプリ（Raise timeline）

## 文書の構成

```
docs/
├── README.md                          … 本書（文書一覧）
├── requirements/                      … 要件定義書（何を作るか）
│   ├── requirements.md                … 本体（概要・機能一覧・各文書へのリンク）
│   ├── screens.md                     … 画面一覧
│   └── data-requirements.md           … データ要件定義書
├── functions/                         … 機能定義書（機能ごとに何をするか）
│   ├── function-definition.md         … 本体（共通の決まり・API の共通仕様・メッセージ一覧）
│   ├── fn01-auth.md                   … FN-01 ユーザー登録・ログイン
│   ├── fn02-timeline.md               … FN-02 タイムライン
│   ├── fn03-post.md                   … FN-03 投稿
│   ├── fn04-image.md                  … FN-04 画像
│   ├── fn05-comment.md                … FN-05 コメント
│   ├── fn06-like.md                   … FN-06 いいね
│   ├── fn07-follow.md                 … FN-07 フォロー
│   ├── fn08-user-search.md            … FN-08 ユーザー検索
│   └── fn09-profile.md                … FN-09 プロフィール
├── design/                            … 基本設計書（どう作るか）
│   ├── basic-design.md                … 本体（概要と各文書へのリンク）
│   ├── screen-design.md               … 画面設計書
│   ├── data-design.md                 … データ設計書（ER 図）
│   └── infra-design.md                … インフラ設計書（AWS の構成図）
├── api/
│   └── openapi.yaml                   … API の仕様書（OpenAPI。コードから自動で作る。手で直さない）
├── test/
│   ├── test-specification.md          … テスト仕様書（テストの方針・要件 ID とテストの対応・結果）
│   ├── requirement-coverage.md        … 要件 ID とテストの対応表（スクリプトで作る）
│   ├── performance-test-report.md     … 性能テスト報告書（要件定義書 11.1 の測定の結果）
│   └── acceptance-report.md           … 検収書（要件定義書 13 章の合格の条件の確認と署名）
├── manual/
│   └── operation-manual.md            … 操作マニュアル（アプリを使う人向け）
├── tech-stack.md                      … 技術スタック定義書
└── development-plan.md                … 開発計画書（作る順番と進み具合）
```

| 文書 | 文書番号 | 内容 | 承認 |
| --- | --- | --- | --- |
| [要件定義書](requirements/requirements.md) | RT-REQ | 背景・目的、範囲、利用者、前提、用語、機能一覧、非機能要件、検収、納品、運用・保守、変更管理 | 要件定義書の本体で、詳細文書とまとめて行う |
| [画面一覧](requirements/screens.md) | RT-REQ-SCR | 画面一覧、画面遷移、タイムライン画面のイメージ | 〃 |
| [データ要件定義書](requirements/data-requirements.md) | RT-REQ-DATA | 扱うデータの項目、上限、保存する個人情報 | 〃 |
| [機能定義書](functions/function-definition.md) | RT-FD | 機能ごとの文書の章立て、画面と API の共通の決まり、メッセージ一覧 | 機能定義書の本体で、機能ごとの文書とまとめて行う |
| [FN-01〜FN-09 の機能定義書](functions/function-definition.md#12-機能定義書の構成) | RT-FD-01〜09 | 機能ごとの機能要件、処理の流れ、入力の確認、業務ルール、API（案）、使うデータ、権限、エラー、テストの観点 | 〃 |
| [基本設計書](design/basic-design.md) | RT-BD | 設計全体の概要、表記のルール、これから行う設計 | 基本設計書の本体で、詳細文書とまとめて行う |
| [画面設計書](design/screen-design.md) | RT-BD-SCR | 画面ごとのレイアウト・表示項目・操作、共通仕様 | 〃 |
| [データ設計書](design/data-design.md) | RT-BD-DATA | ER 図、テーブル定義、データのルール、CRUD 表 | 〃 |
| [インフラ設計書](design/infra-design.md) | RT-BD-INFRA | AWS の構成図、ネットワーク、通信の許可、費用の目安 | 〃 |
| [API の仕様書](api/openapi.yaml) | | API ごとの入力・出力の項目（型・必須・条件）とエラーの一覧。API のコードから自動で作る（基本設計書 2.1.1） | 承認しない（コードが正本） |
| [テスト仕様書](test/test-specification.md) | RT-TEST | テストの方針、テストに要件 ID を書く決まり、要件 ID とテストの対応（[対応表](test/requirement-coverage.md) はスクリプトで作る）、テストの観点、環境ごとの結果（要件定義書 13 章） | 本書で行う |
| [性能テスト報告書](test/performance-test-report.md) | RT-TEST-PERF | 性能（要件定義書 11.1、N-1〜N-5）を測った条件・結果・分かったこと。測り方は基本設計書 2.4 | 本書で行う |
| [操作マニュアル](manual/operation-manual.md) | RT-MAN | アプリを使う人向けの、画面ごとの操作・決まり・メッセージが出たときにすること（要件定義書 14 章 No.9） | 本書で行う |
| [検収書](test/acceptance-report.md) | RT-TEST-ACC | 要件定義書 13.4 の合格の条件ごとの確認、見つけて直した不具合、納品物、署名 | 検収者・承認者が署名する |
| [技術スタック定義書](tech-stack.md) | RT-TECH | 使う言語・フレームワーク・サービス・開発ツールと選んだ理由 | 本書で行う |
| [開発計画書](development-plan.md) | RT-PLAN | 作る順番（段階と Pull Request の単位）、段階ごとの完了条件、どこまでできたか | 本書で行う |

## 読む順番

1. [要件定義書](requirements/requirements.md)：全体像と機能一覧（8 章）をつかむ
2. 必要に応じて、要件定義書の詳細文書（画面・データ）
3. [機能定義書](functions/function-definition.md)：共通の決まりを読み、作る機能の文書（FN-01〜FN-09）を読む
4. [基本設計書](design/basic-design.md) → [画面設計書](design/screen-design.md)・[データ設計書](design/data-design.md)・[インフラ設計書](design/infra-design.md)
5. [開発計画書](development-plan.md)：作る順番と、いまどこまでできたか

1 つの機能を作るときは、その機能の機能定義書と、そこから参照している画面設計書・データ設計書の章を読めばよい。

## ID の一覧

文書の中で使う ID と、それを定めている文書である。

| ID | 意味 | 定めている文書 |
| --- | --- | --- |
| P-1〜 | 前提条件・制約 | 要件定義書 4 章 |
| FN-01〜 | 機能 | 要件定義書 8 章（機能一覧） |
| N-1〜 | 非機能要件 | 要件定義書 11 章 |
| R-1〜 | リスク | 要件定義書 12 章 |
| U-1〜 | 未決事項 | 要件定義書 17 章 |
| G-1〜 | 画面 | 画面一覧 1 章 |
| A・T・W・I・C・L・F・S・PF | 機能要件（登録・ログイン、タイムライン、投稿、画像、コメント、いいね、フォロー、ユーザー検索、プロフィール） | 各機能定義書 2 章（A は FN-01、T は FN-02 … PF は FN-09） |
| M-1〜 | メッセージ | 機能定義書 4 章 |
| BR-1〜 | データのルール | データ設計書 7 章 |
| SG-1〜 | セキュリティグループ（通信の許可） | インフラ設計書 4 章 |
| Q-1〜 | 設計中に見つかった要件の不足 | 基本設計書 3 章 |
| TC-01-1〜 | テストの観点（機能の番号と連番） | 機能定義書 FN-01〜FN-09 の 10 章 |

## 文書の書き方のルール

- 文書はすべて Markdown で書き、このフォルダーに置く。図は Mermaid 記法かテキストで書き、画像ファイルにしない（GitHub 上で読めて、差分も追えるようにする）
- 同じ内容を 2 か所に詳しく書かない。本体の文書には概要とリンクだけを書き、詳しい内容は詳細文書に書く
- 機能を足すときは、要件定義書 8 章の機能一覧に行を足し、機能定義書の章立て（機能定義書 1.3）に合わせて新しい文書を作る
- 文書ごとに版数と改訂履歴を持つ。詳細文書を変えたときは、本体の版数も上げて改訂履歴に記録する
- ほかの文書を参照するときは、ID（例：F-3）か「文書名＋章番号」で書く
