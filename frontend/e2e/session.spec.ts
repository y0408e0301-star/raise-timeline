import { expect, test } from '@playwright/test'
import type { BrowserContext, Cookie } from '@playwright/test'
import { signup, user, xsrfHeader } from './helpers.ts'

// ログインの続き（FN-01 A-8、N-25）。JWT（access_token）は 15 分で Cookie ごと消えるので、
// 15 分待つ代わりに Cookie を消して、リフレッシュトークン（refresh_token）で取り直せることを確かめる

const cookie = async (context: BrowserContext, name: string): Promise<Cookie | undefined> =>
  (await context.cookies()).find((c) => c.name === name)

test('JWT が切れても、リフレッシュトークンで取り直して使い続けられる', async ({ browser }) => {
  const page = await signup(browser, user('ar', 'たろう'))
  const context = page.context()

  await context.clearCookies({ name: 'access_token' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toBeVisible()
  // 書き込みもできる（取り直しの後に CSRF のトークンも使える）
  await page.getByRole('textbox', { name: '投稿の本文' }).fill('取り直した後の投稿')
  await page.getByRole('button', { name: '投稿する' }).click()
  await expect(page.getByRole('article').getByText('取り直した後の投稿')).toBeVisible()
  expect(await cookie(context, 'access_token')).toBeDefined()

  // リフレッシュトークンも消えたら、G-1 に戻る
  await context.clearCookies({ name: 'access_token' })
  await context.clearCookies({ name: 'refresh_token' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('ログアウトした後は、前のリフレッシュトークンを使えない', async ({ browser }) => {
  const page = await signup(browser, user('ao', 'はなこ'))
  const context = page.context()
  const refresh = await cookie(context, 'refresh_token')
  expect(refresh).toBeDefined()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // 盗まれた Cookie を後から使われた場合と同じ
  await context.addCookies([refresh!])
  const res = await page.request.post('/api/auth/refresh', { headers: await xsrfHeader(page) })
  expect(res.status()).toBe(401)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('一度使ったリフレッシュトークンをもう一度使うと、その人のトークンがすべて無効になる', async ({ browser }) => {
  const page = await signup(browser, user('aw', 'じろう'))
  const context = page.context()
  const first = await cookie(context, 'refresh_token')

  // 取り直すと、リフレッシュトークンも新しくなる（データ設計書 BR-9）
  await context.clearCookies({ name: 'access_token' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toBeVisible()
  expect((await cookie(context, 'refresh_token'))?.value).not.toBe(first?.value)

  // 古いもの（盗まれたもの）を別のブラウザで使うと断られ、本人の新しいトークンも無効になる。
  // 画面を開くと画面自身が取り直しを試みて競合するので、API だけを呼ぶ（GET で XSRF-TOKEN の Cookie を受け取ってから送る）
  const thief = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  await thief.addCookies([first!])
  await thief.request.get('/api/auth/me')
  const xsrf = (await thief.cookies()).find((c) => c.name === 'XSRF-TOKEN')
  expect(xsrf).toBeDefined()
  const stolen = await thief.request.post('/api/auth/refresh',
    { headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf!.value) } })
  expect(stolen.status()).toBe(401)
  await thief.close()

  await context.clearCookies({ name: 'access_token' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('通信が切れたらお知らせ欄に M-20 を出し、戻ったら消す（機能定義書 2 章）', async ({ browser }) => {
  const page = await signup(browser, user('of', 'じろう'))
  const context = page.context()
  const notice = page.getByRole('banner').getByRole('alert')

  await context.setOffline(true)
  await expect(notice).toHaveText('インターネットに接続されていません。接続を確認してください。')
  await context.setOffline(false)
  await expect(notice).toBeHidden()
})
