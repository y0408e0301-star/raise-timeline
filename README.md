# Raise timeline

X（Twitter）のようなタイムライン形式のテキスト SNS です。ユーザー登録した人どうしでフォローし合い、文章と画像を投稿し、いいね・コメントで反応できます。インプレッション数を出さないこと、リツイートがないことが特徴です。

学習用に、Spring Boot・React・PostgreSQL で作ります。画像は AWS S3（開発中は MinIO）に保存します。

## 文書

要件定義書・基本設計書・技術スタック定義書は [docs/](docs/README.md) にあります。最初に [docs/README.md](docs/README.md)（文書一覧と読む順番）を読んでください。

## 開発ルール

変更はすべて Issue → ブランチ → Pull Request の順で取り込みます。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。
