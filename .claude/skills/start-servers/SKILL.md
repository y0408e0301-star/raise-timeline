---
name: start-servers
description: Raise timeline の開発サーバー（PostgreSQL・MinIO・API サーバー・画面の dev サーバー）を起動・再起動するときの手順とポートのルール。決められたポート（PostgreSQL 5432・MinIO 9000・Spring Boot 8080・Vite 5173）でだけ起動し、ポートが使われていたらそのプロセスを止めてから起動し直す。サーバーを起動するとき、動作確認・画面確認・API の確認をするとき、「ポートが使われている」「EADDRINUSE」「Port 8080 was already in use」が出たとき、新しく追加した API が 404 になるとき、画像が表示されないとき、port-guard フックに止められたときは、明示的に頼まれていなくても必ずこのスキルを使う。
---

# 開発サーバーの起動

## ルール

1. **サーバーは、そのアプリで決めたポート（決めていなければ既定のポート）でだけ起動する**
2. **ポートが使われていたら、使っているプロセスを止めてから、同じポートで起動し直す**
3. **別のポートでの一時起動や、接続先を差し替えた一時設定での起動はしない**

理由：画面の proxy、CORS、README の手順、ユーザーが開いているブラウザの URL は、どれも決めたポートを前提にしている。別のポートで起動すると、確認した構成と実際の構成がずれる。古いサーバーも残り続け、「動いたはずなのに手元では動かない」原因になる。ユーザーは別ポートへの退避をはっきり禁止している。

ルール 3 に当たる例：`--server.port=8081`、`-Dserver.port`、`npm run dev -- --port 5174`、`PORT=3001 npm start`、`$env:SERVER_PORT=...`、proxy 先だけ変えた `vite --config vite.tmp.config.ts`。

これらはフック `~/.claude/hooks/port-guard.mjs` が実行前に止める。止められたら回避策を探さず、下の手順 2（止めて起動し直す）に戻る。

## ポートを調べる

推測で決めず、リポジトリの記述を次の順で確かめる。

1. リポジトリの CLAUDE.md・README（ポートの一覧があればそれが正）
2. 設定ファイル：`compose.yaml` の `ports`、`application.properties` / `application.yml` の `server.port`、`vite.config.ts` の `server.port` と `proxy`、`package.json` の scripts
3. 書いていなければ既定値：Spring Boot 8080、Vite 5173、Next.js / CRA 3000、PostgreSQL 5432、MySQL 3306

### Raise timeline のサーバー

正は CLAUDE.md の「サーバーのポート」。食い違ったらそちらに合わせ、この表を直す。PostgreSQL と API サーバーの行は、実際に起動して確かめた。MinIO（`compose.yaml` に足す）と `frontend/` はまだない（作成予定。開発計画書 1-3・2-1）。作ったら、起動コマンドと起動の確認が実際と合っているかを確かめ、この表と README の「起動方法」を直す。

API サーバーは開発用の設定（DB の接続先・JWT の秘密の値）を `application.properties` の既定値で持つので、環境変数を渡さずに起動できる。

| サーバー | ポート | 決めている場所 | 起動コマンド | 起動の確認 |
| --- | --- | --- | --- | --- |
| データベース（PostgreSQL 17） | 5432 | `compose.yaml` | ルートで `docker compose up -d` | `docker compose ps` で `running` |
| 画像の保存先（MinIO。作成予定） | 9000 | `compose.yaml` | 同上（PostgreSQL と一緒に起動する） | `http://localhost:9000/minio/health/live` が 200 |
| API サーバー（Spring Boot） | 8080 | Spring Boot の既定値（`server.port` は指定しない） | `cd backend` → `.\mvnw.cmd spring-boot:run` | `http://localhost:8080/actuator/health` が `{"status":"UP"}` |
| 画面（Vite。作成予定） | 5173 | Vite の既定値（`--port` は指定しない） | `cd frontend` → `npm run dev`（初回は `npm install`） | `http://localhost:5173/` が 200 |

- 画面の `/api` へのリクエストは、`frontend/vite.config.ts` の proxy で 8080 へ転送する。API が 8080 で動いていないと、画面からは 502（止まっている）や 404（古いコード）になる
- 画像は、API が発行した署名付き URL で、ブラウザが MinIO（9000）から直接読む（インフラ設計書 5.1）。画像だけ出ないときは MinIO が 9000 で動いているかを確かめる
- データベースと MinIO を止めるときは `docker compose down`（データは残る）

## 手順

### 1. すでに動いているか確かめる

```powershell
powershell -NoProfile -File .claude/skills/start-servers/scripts/check-port.ps1 -Port 8080 -Repo .
```

ポートを使っているプロセスの PID、起動日時、コマンドラインと、リポジトリの最後のコミット日時を出す。

- **空いている** → 手順 3 へ
- **今のコードで動いている**（起動日時が最後のコミットより後で、ブランチの切り替えもしていない）→ そのまま使う。起動し直す必要はない
- **古いコードで動いている、または別のアプリが使っている** → 手順 2 へ。追加したばかりの API が 404 になるのは、たいてい古いコードで動いているため

### 2. 使っているプロセスを止める

```powershell
Stop-Process -Id <PID>
```

止めたら、もう一度 `check-port.ps1` でポートが空いたことを確かめる。

自分（このセッション）が `run_in_background` で起動したサーバーなら、TaskStop で止めるほうが確実（mvnw などの親プロセスも一緒に止まる）。

### 3. 決めたポートで起動する

- 起動コマンドは、リポジトリの README に書かれたものをそのまま使う。ポートを指定する引数は付けない
- 起動は Bash の `run_in_background` で行う。サーバーはこのセッションと一緒に止まる
- 必要な順に起動する：DB・MinIO → API → 画面

### 4. 起動を待つ

`sleep` を重ねず、Monitor の until ループで「起動した」と「失敗した」の両方を待つ。成功だけを待つと、起動に失敗したときにいつまでも待ち続けてしまう。

```bash
until curl -s -m 2 http://localhost:8080/actuator/health | grep -q UP; do
  grep -qE "BUILD FAILURE|APPLICATION FAILED|already in use|EADDRINUSE" "<起動ログ>" && { echo failed; exit 1; }
  sleep 2
done; echo ready
```

`failed` になったらログを読み、原因（ポートの使用、DB 未起動、コンパイルエラーなど）を直してから起動し直す。

### 5. 動作を確かめる

- API は直接（`http://localhost:8080/...`）と、画面の proxy 経由（`http://localhost:5173/api/...`）の両方で呼ぶ。proxy 経由で 404・502 なら、画面と API のどちらかが決めたポートで動いていない
- 画面の描画は、ヘッドレス Edge の `--dump-dom` で確かめられる

  ```bash
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
    --user-data-dir="<スクラッチパッド>/edge" --virtual-time-budget=8000 --dump-dom http://localhost:5173/
  ```

### 6. ユーザーに伝える

どのサーバーをどのポートで起動したか、止めたプロセスがあればその PID を伝える。サーバーを動かしたままにするのか、止めたのかも伝える。

## 確認のときのつまずき（Windows）

- Git Bash の curl に日本語のクエリをそのまま渡すと UTF-8 にならず、400 が返る。UTF-8 でパーセントエンコードして送る（例：ユーザー検索の `q=%E3%81%9F%E3%81%AA%E3%81%8B` ＝ たなか）。ブラウザの `URLSearchParams` は自動で UTF-8 にする
- PowerShell では `Invoke-RestMethod` ではなく `curl.exe` を使い、先に `[Console]::OutputEncoding = [Text.Encoding]::UTF8` を実行する
