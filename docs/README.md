# 文書一覧：タイムライン型 SNS アプリ（Raise timeline）

## 文書の構成

```
docs/
├── README.md                          … 本書（文書一覧）
├── requirements/                      … 要件定義書（何を作るか）
│   ├── requirements.md                … 本体（概要と各文書へのリンク）
│   ├── functional-requirements.md     … 機能要件定義書
│   ├── screens.md                     … 画面一覧
│   └── data-requirements.md           … データ要件定義書
├── design/                            … 基本設計書（どう作るか）
│   ├── basic-design.md                … 本体（概要と各文書へのリンク）
│   ├── screen-design.md               … 画面設計書
│   ├── data-design.md                 … データ設計書（ER 図）
│   └── infra-design.md                … インフラ設計書（AWS の構成図）
└── tech-stack.md                      … 技術スタック定義書
```

| 文書 | 文書番号 | 内容 | 承認 |
| --- | --- | --- | --- |
| [要件定義書](requirements/requirements.md) | RT-REQ | 背景・目的、範囲、利用者、前提、用語、非機能要件、検収、納品、運用・保守、変更管理 | 要件定義書の本体で、詳細文書とまとめて行う |
| [機能要件定義書](requirements/functional-requirements.md) | RT-REQ-FR | 機能要件、メッセージ一覧 | 〃 |
| [画面一覧](requirements/screens.md) | RT-REQ-SCR | 画面一覧、画面遷移、タイムライン画面のイメージ | 〃 |
| [データ要件定義書](requirements/data-requirements.md) | RT-REQ-DATA | 扱うデータの項目、上限、保存する個人情報 | 〃 |
| [基本設計書](design/basic-design.md) | RT-BD | 設計全体の概要、表記のルール、これから行う設計 | 基本設計書の本体で、詳細文書とまとめて行う |
| [画面設計書](design/screen-design.md) | RT-BD-SCR | 画面ごとのレイアウト・表示項目・操作、共通仕様 | 〃 |
| [データ設計書](design/data-design.md) | RT-BD-DATA | ER 図、テーブル定義、データのルール、CRUD 表 | 〃 |
| [インフラ設計書](design/infra-design.md) | RT-BD-INFRA | AWS の構成図、ネットワーク、通信の許可、費用の目安 | 〃 |
| [技術スタック定義書](tech-stack.md) | RT-TECH | 使う言語・フレームワーク・サービス・開発ツールと選んだ理由 | 本書で行う |

開発計画書・テスト仕様書・操作マニュアルは、作成した時点でここに追加する。

## 読む順番

1. [要件定義書](requirements/requirements.md)：全体像をつかむ
2. 必要に応じて、要件定義書の詳細文書（機能要件・画面・データ）
3. [基本設計書](design/basic-design.md) → [画面設計書](design/screen-design.md)・[データ設計書](design/data-design.md)・[インフラ設計書](design/infra-design.md)
4. [技術スタック定義書](tech-stack.md)

## ID の一覧

文書の中で使う ID と、それを定めている文書である。

| ID | 意味 | 定めている文書 |
| --- | --- | --- |
| P-1〜 | 前提条件・制約 | 要件定義書 4 章 |
| N-1〜 | 非機能要件 | 要件定義書 11 章 |
| R-1〜 | リスク | 要件定義書 12 章 |
| U-1〜 | 未決事項 | 要件定義書 17 章 |
| A・T・W・I・C・L・F・S・PF | 機能要件（登録・ログイン、タイムライン、投稿、画像、コメント、いいね、フォロー、ユーザー検索、プロフィール） | 機能要件定義書 2 章 |
| M-1〜 | メッセージ | 機能要件定義書 3 章 |
| G-1〜 | 画面 | 画面一覧 1 章 |
| BR-1〜 | データのルール | データ設計書 7 章 |
| SG-1〜 | セキュリティグループ（通信の許可） | インフラ設計書 4 章 |
| Q-1〜 | 設計中に見つかった要件の不足 | 基本設計書 3 章 |

## 文書の書き方のルール

- 文書はすべて Markdown で書き、このフォルダーに置く。図は Mermaid 記法かテキストで書き、画像ファイルにしない（GitHub 上で読めて、差分も追えるようにする）
- 同じ内容を 2 か所に詳しく書かない。本体の文書には概要とリンクだけを書き、詳しい内容は詳細文書に書く
- 文書ごとに版数と改訂履歴を持つ。詳細文書を変えたときは、本体の版数も上げて改訂履歴に記録する
- ほかの文書を参照するときは、ID（例：F-3）か「文書名＋章番号」で書く
