import { defineConfig } from '@playwright/test'

// 画面を操作して、本物の API と DB で動くかを確かめる E2E テスト（開発計画書 3-1・3-9、N-24）。
// サーバー（DB 5432・API 8080・画面 5173）は起動しておく（README「起動方法」）。
// CI では公開用の jar（8080）に画面も入れて動かすので、環境変数 E2E_BASE_URL で行き先を変える。
// テストで作るユーザーは ID が「e2e_」で始まり、始める前と終わった後に DB から消す（e2e/cleanup.ts）
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/cleanup.ts',
  globalTeardown: './e2e/cleanup.ts',
  // 同じ DB を使うので 1 つずつ順に動かす
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // パソコンに入っている Microsoft Edge を使う（ブラウザのダウンロードは要らない。kadai と同じ）
    channel: 'msedge',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pc', use: { viewport: { width: 1280, height: 900 } } },
    // スマートフォンの幅（N-20 の 375px）。主な流れと、すべての画面の確認だけを流す
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
      testMatch: ['main-flow.spec.ts', 'screens.spec.ts'],
    },
  ],
})
