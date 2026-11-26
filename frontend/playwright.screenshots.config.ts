import { defineConfig } from '@playwright/test'

// README のスクリーンショットを撮る（npm run screenshots）。テストではないので、npm run test:e2e（e2e/）とは分け、CI でも動かさない。
// サーバー（DB 5432・API 8080・画面 5173）と S3 の開発用のバケットを使う（README「起動方法」）。
// サンプルのユーザー（ID が「demo_」で始まる）を作り直してから撮り、画像は docs/images/ に書き出す
export default defineConfig({
  testDir: './screenshots',
  workers: 1,
  fullyParallel: false,
  timeout: 3 * 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'off',
  },
})
