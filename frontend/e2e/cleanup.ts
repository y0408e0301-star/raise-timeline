import { execFileSync } from 'node:child_process'

// テストで作ったユーザー（ID が「e2e_」で始まる）を開発用 DB から消す。投稿・コメント・いいね・フォロー・
// リフレッシュトークンは ON DELETE CASCADE で一緒に消える。S3 の画像（投稿の画像・アイコン）は消えないので、
// 画像を使うテストは、テストの中で画面か API から投稿の削除・アイコンを外す操作をして消す。
// アカウントを消す機能はないので、compose.yaml の PostgreSQL に psql でつないで消す。
// 前の実行が途中で止まって残ったものも消せるよう、始める前（globalSetup）と終わった後（globalTeardown）に呼ぶ
export default function cleanup(): void {
  execFileSync('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', 'raise_timeline', '-d', 'raise_timeline', '-v', 'ON_ERROR_STOP=1', '-q',
    // LIKE だと「_」が 1 文字の記号になるので、先頭の 4 文字で比べる
    '-c', "DELETE FROM users WHERE left(username, 4) = 'e2e_'",
  ], { cwd: new URL('../..', import.meta.url), stdio: 'inherit' })
}
