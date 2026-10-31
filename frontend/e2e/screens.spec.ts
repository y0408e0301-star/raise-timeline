import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { noisePng } from '../perf/png.ts'
import { closeContexts, createPostByApi, newContext, postCard, runId, send, signup, user } from './helpers.ts'

test.afterEach(closeContexts)

// すべての画面（G-1〜G-11）を、データを入れた状態で開いて確かめる。pc（1280px）と mobile（375px）の両方で動かす。
// (1) アクセシビリティ：axe-core で WCAG 2.1 の A・AA に違反がない（N-18 のコントラスト比を含む）
// (2) 画面の幅：横にスクロールしない（N-20）。長い表示名と、区切りのない 280 文字の本文も入れておく

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function check(page: Page, ready: Locator): Promise<void> {
  await expect(ready).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  const found = violations.map((v) => `${v.id}（${v.help}）: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect.soft(found, 'アクセシビリティの違反').toEqual([])
  const { scrollWidth, clientWidth } = await page.evaluate(() =>
    ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect.soft(scrollWidth, '横にスクロールしない').toBeLessThanOrEqual(clientWidth)
}

// N-18（axe のコントラストの検査）・N-20
test('すべての画面に、アクセシビリティの違反と横のスクロールがない', async ({ browser }) => {
  // 表示名は 30 文字まで（「E2E 」と runId を足して 30 文字）
  const taro = user('ga', 'とてもながいなまえのユーザーです')
  const hana = user('gb', 'はなこ')
  const page = await signup(browser, taro)
  const hanaPage = await signup(browser, hana)

  await createPostByApi(page, 'a'.repeat(280))
  const post = await createPostByApi(page, `画像つきの投稿 ${runId()}`,
    { name: 'e2e.png', mimeType: 'image/png', buffer: noisePng(320, 240) })
  try {
    await send(hanaPage, 'PUT', `/api/users/${taro.username}/follow`)
    await send(hanaPage, 'PUT', `/api/posts/${post.id}/like`)
    await send(hanaPage, 'POST', `/api/posts/${post.id}/comments`, { data: { body: 'すてきな写真です' } })

    await test.step('G-1 ログイン・G-2 ユーザー登録', async () => {
      const guest = await (await newContext(browser)).newPage()
      await guest.goto('/login')
      await check(guest, guest.getByRole('button', { name: 'ログイン' }))
      await guest.goto('/signup')
      await check(guest, guest.getByRole('button', { name: '登録する' }))
      await guest.context().close()
    })

    await test.step('G-3 タイムライン', async () => {
      await page.goto('/?tab=all')
      await check(page, postCard(page, taro).getByText('a'.repeat(280)))
    })

    await test.step('G-10 画像の拡大', async () => {
      // 開発用の DB には、ほかの人の画像つきの投稿もある
      await postCard(page, taro).getByRole('button', { name: '画像 1 / 1 を拡大' }).click()
      await check(page, page.getByRole('dialog', { name: '画像の拡大' }))
      await page.keyboard.press('Escape')
    })

    await test.step('G-4 投稿の詳細', async () => {
      await page.goto(`/posts/${post.id}`)
      await check(page, page.getByRole('listitem', { name: `${hana.displayName}のコメント` }))
    })

    await test.step('G-11 確認ダイアログ', async () => {
      await page.getByRole('button', { name: 'メニュー' }).click()
      await page.getByRole('menuitem', { name: '削除' }).click()
      await check(page, page.getByRole('alertdialog', { name: '投稿を削除' }))
      await page.keyboard.press('Escape')
    })

    await test.step('G-5 いいねした人の一覧', async () => {
      await page.goto(`/posts/${post.id}/likes`)
      await check(page, page.getByRole('list', { name: 'いいねした人' }).getByRole('listitem'))
    })

    await test.step('G-6 プロフィール', async () => {
      await page.goto(`/users/${taro.username}`)
      await check(page, postCard(page, taro).getByText('a'.repeat(280)))
    })

    await test.step('G-7 プロフィールの編集', async () => {
      await page.goto('/settings/profile')
      await check(page, page.getByLabel('表示名'))
    })

    await test.step('G-8 フォロー中・フォロワーの一覧', async () => {
      await page.goto(`/users/${taro.username}/followers`)
      await check(page, page.getByRole('list', { name: 'フォロワー' }).getByRole('listitem'))
    })

    await test.step('G-9 ユーザー検索の結果', async () => {
      await page.goto(`/search?q=${runId()}`)
      await check(page, page.getByRole('list', { name: '検索結果' }).getByRole('listitem').first())
    })
  } finally {
    // S3 に置いた画像を消す（DB のユーザーは e2e/cleanup.ts が消すが、S3 の画像は消さないため）
    await send(page, 'DELETE', `/api/posts/${post.id}`)
  }
})
