import { defineConfig } from '@playwright/test'

// 画面を操作して、本物の API と DB で主な流れが動くかを確かめる E2E テスト（開発計画書 3-1、N-24）。
// サーバー（DB 5432・API 8080・画面 5173）は起動しておく（README「起動方法」）。
// テストで作るユーザーは ID が「e2e_」で始まり、始める前と終わった後に開発用 DB から消す（e2e/cleanup.ts）
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/cleanup.ts',
  globalTeardown: './e2e/cleanup.ts',
  // 同じ DB を使うので 1 つずつ順に動かす
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // パソコンに入っている Microsoft Edge を使う（ブラウザのダウンロードは要らない。kadai と同じ）
    channel: 'msedge',
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
})
