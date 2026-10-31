import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

// API に送るファイル（Playwright の multipart の形）
export type FilePayload = { name: string, mimeType: string, buffer: Buffer }

// E2E のテストで共通に使う部品。ユーザーを作る・ログインする・API を直接呼ぶ・ヘッダーで検索する

export type User = { username: string, displayName: string }

export const PASSWORD = 'e2e-pass1'

// 前の実行の消し残しと重ならないように、時刻を付ける
const run = Date.now().toString(36).slice(-6)

// この実行とこの project だけを表す文字（project の名前の頭文字。playwright.config.ts の名前は頭文字が重ならないようにする）。
// ユーザー ID と表示名に入れ、検索して自分たちだけが出るようにする
export const runId = () => `${run}${test.info().project.name[0]}`

// ユーザー ID は 15 文字まで（「e2e_」4 文字 ＋ runId 7 文字 ＋ suffix 4 文字まで）
export const user = (suffix: string, name: string): User =>
  ({ username: `e2e_${runId()}${suffix}`, displayName: `E2E ${name} ${runId()}` })

// テストの中で開いたブラウザ。テストが終わったら closeContexts で閉じる
const opened = new Set<BrowserContext>()

// project の設定（baseURL・画面の幅・端末のエミュレーションなど）で、Cookie を分けた新しいブラウザを開く
export async function newContext(browser: Browser): Promise<BrowserContext> {
  const { baseURL, viewport, locale, timezoneId, isMobile, hasTouch, userAgent, deviceScaleFactor } = test.info().project.use
  const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, isMobile, hasTouch, userAgent, deviceScaleFactor })
  opened.add(context)
  return context
}

// テストで開いたブラウザを閉じる。各ファイルの test.afterEach で呼ぶ。
// 閉じずに残すと、同じワーカーの後のテストで開いたままの画面がたまり、WebKit では描画が止まって操作が時間切れになる
export async function closeContexts(): Promise<void> {
  await Promise.all([...opened].map((context) => context.close()))
  opened.clear()
}

// 新しいブラウザで G-2 から登録し、ログインした状態のページを返す
export async function signup(browser: Browser, { username, displayName }: User): Promise<Page> {
  const page = await (await newContext(browser)).newPage()
  await page.goto('/signup')
  await page.getByLabel('ユーザー ID').fill(username)
  await page.getByLabel('表示名').fill(displayName)
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD)
  await page.getByLabel('パスワード（確認）').fill(PASSWORD)
  await page.getByRole('button', { name: '登録する' }).click()
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toBeVisible()
  return page
}

// G-1 で ID とパスワードを入れてログインのボタンを押す。結果は呼んだ側で確かめる
export async function submitLogin(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('ユーザー ID').fill(username)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

// API を呼ぶ（そのページのログインの Cookie を使う。読むだけなので CSRF のトークンは要らない）
export async function api<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path)
  expect(res.ok(), `${path} → ${res.status()}`).toBe(true)
  return (await res.json()) as T
}

// GET 以外の API を画面の外から呼ぶときの CSRF のヘッダー（機能定義書 3.2）。
// XSRF-TOKEN の Cookie は API の応答で届くので、ページを開いた直後などでまだなければ、先に GET で受け取る
export async function xsrfHeader(page: Page): Promise<Record<string, string>> {
  const find = async () => (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')
  let token = await find()
  if (!token) {
    await page.request.get('/api/auth/me')
    token = await find()
  }
  expect(token, 'XSRF-TOKEN の Cookie がありません').toBeDefined()
  return { 'X-XSRF-TOKEN': decodeURIComponent(token!.value) }
}

// GET 以外の API を画面の外から呼び、成功したことを確かめて応答の本文を返す（データを用意するとき）
export async function send<T>(page: Page, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string,
  options: { data?: unknown, multipart?: Record<string, string | FilePayload> } = {}): Promise<T> {
  const res = await page.request.fetch(path, { method, headers: await xsrfHeader(page), ...options })
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBe(true)
  return (res.status() === 204 ? undefined : await res.json()) as T
}

export type PostView = {
  id: number
  body: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  images: { id: number, url: string }[]
}

export type Profile = {
  displayName: string
  bio: string
  iconUrl: string | null
  followerCount: number
  followingCount: number
  postCount: number
  followedByMe: boolean
}

// 画面を通さずに API で投稿する（続きの読み込みなど、数を揃えたいとき）
export const createPostByApi = (page: Page, body: string, image?: FilePayload): Promise<PostView> =>
  send<PostView>(page, 'POST', '/api/posts', { multipart: image ? { body, images: image } : { body } })

export const postCard = (page: Page, author: User) => page.getByRole('article', { name: `${author.displayName}の投稿` })

// ヘッダーの検索欄で探す。600px 未満では、先に虫めがねのボタンで検索欄を開く（画面設計書 3.6）
export async function searchUsers(page: Page, q: string): Promise<void> {
  const toggle = page.getByRole('button', { name: 'ユーザーを検索' })
  if (await toggle.isVisible()) await toggle.click()
  const search = page.getByRole('searchbox', { name: 'ユーザーを検索する文字' })
  await search.fill(q)
  await search.press('Enter')
}
