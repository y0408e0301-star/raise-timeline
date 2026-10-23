import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

// 主な流れ（登録 → 投稿 → 検索 → フォロー → いいね・コメント）を、本物の API と DB につないで確かめる（開発計画書 3-1、N-24）。
// 2 人のユーザーをそれぞれ別のブラウザ（コンテキスト）で操作し、操作の後は
// (1) API（＝ DB）の中身が操作どおりに変わっていること
// (2) 読み直しても同じ表示になること、相手の画面にも出ること
// を確かめる。作ったユーザーは e2e/cleanup.ts が消す

type User = { username: string, displayName: string }

// 前の実行の消し残しと重ならないように、時刻を付ける（ユーザー ID は 15 文字まで）
const run = Date.now().toString(36).slice(-6)
const PASSWORD = 'e2e-pass1'
const user = (suffix: string, name: string): User => ({ username: `e2e_${run}${suffix}`, displayName: `E2E ${name} ${run}` })

// 新しいブラウザ（Cookie を分ける）で G-2 から登録し、ログインした状態のページを返す
async function signup(browser: Browser, { username, displayName }: User): Promise<Page> {
  const { baseURL, viewport, locale, timezoneId } = test.info().project.use
  const context = await browser.newContext({ baseURL, viewport, locale, timezoneId })
  const page = await context.newPage()
  await page.goto('/signup')
  await page.getByLabel('ユーザー ID').fill(username)
  await page.getByLabel('表示名').fill(displayName)
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD)
  await page.getByLabel('パスワード（確認）').fill(PASSWORD)
  await page.getByRole('button', { name: '登録する' }).click()
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toBeVisible()
  return page
}

// API を呼ぶ（そのページのログインの Cookie を使う。読むだけなので CSRF のトークンは要らない）
async function api<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path)
  expect(res.ok(), `${path} → ${res.status()}`).toBe(true)
  return (await res.json()) as T
}

type PostView = { id: number, body: string, likeCount: number, commentCount: number, likedByMe: boolean }
type Profile = { followerCount: number, followingCount: number, postCount: number, followedByMe: boolean }

const postCard = (page: Page, author: User) => page.getByRole('article', { name: `${author.displayName}の投稿` })

test('登録 → 投稿 → 検索 → フォロー → いいね・コメントが、相手の画面と DB に反映される', async ({ browser }) => {
  const taro = user('t', 'たろう')
  const hana = user('h', 'はなこ')
  const body = `はじめての投稿です ${run}`

  const taroPage = await signup(browser, taro)
  let postId = 0

  await test.step('たろうが投稿する', async () => {
    // まだ誰もフォローしていないので「フォロー中」タブは M-8
    await expect(taroPage.getByText('まだ誰もフォローしていません。')).toBeVisible()
    await taroPage.getByRole('textbox', { name: '投稿の本文' }).fill(body)
    await taroPage.getByRole('button', { name: '投稿する' }).click()
    await expect(postCard(taroPage, taro).getByText(body)).toBeVisible()

    const posts = await api<{ items: PostView[] }>(taroPage, `/api/users/${taro.username}/posts`)
    expect(posts.items.map((p) => p.body)).toEqual([body])
    postId = posts.items[0].id
  })

  const hanaPage = await signup(browser, hana)

  await test.step('はなこがヘッダーの検索欄でたろうを探してフォローする', async () => {
    const search = hanaPage.getByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await search.fill(`@${taro.username}`)
    await search.press('Enter')
    await expect(hanaPage.getByRole('heading', { name: `「@${taro.username}」の検索結果` })).toBeVisible()
    const results = hanaPage.getByRole('list', { name: '検索結果' })
    const row = results.getByRole('listitem', { name: taro.displayName })
    // ユーザー ID が完全に一致するので先頭（S-6）
    await expect(results.getByRole('listitem').first()).toHaveAccessibleName(taro.displayName)
    await row.getByRole('button', { name: 'フォローする' }).click()
    await expect(row.getByRole('button', { name: 'フォロー中' })).toBeVisible()

    expect(await api<Profile>(hanaPage, `/api/users/${taro.username}`))
      .toMatchObject({ followedByMe: true, followerCount: 1 })
  })

  await test.step('自分も検索結果に出て、自分の行にはフォローボタンがない', async () => {
    const search = hanaPage.getByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await search.fill(run)
    await search.press('Enter')
    const results = hanaPage.getByRole('list', { name: '検索結果' })
    await expect(results.getByRole('listitem')).toHaveCount(2)
    await expect(results.getByRole('listitem', { name: hana.displayName }).getByRole('button')).toHaveCount(0)
    await expect(results.getByRole('listitem', { name: taro.displayName })
      .getByRole('button', { name: 'フォロー中' })).toBeVisible()
  })

  await test.step('はなこの「フォロー中」タブにたろうの投稿が出て、いいねとコメントができる', async () => {
    await hanaPage.goto('/?tab=following')
    const card = postCard(hanaPage, taro)
    await expect(card.getByText(body)).toBeVisible()
    await card.getByRole('button', { name: 'いいねする' }).click()
    await expect(card.getByRole('button', { name: 'いいねを取り消す' })).toBeVisible()
    await expect(card.getByRole('link', { name: 'いいね 1 件' })).toBeVisible()

    await card.getByRole('link', { name: body }).click()
    await expect(hanaPage).toHaveURL(new RegExp(`/posts/${postId}$`))
    await hanaPage.getByRole('textbox', { name: 'コメントの本文' }).fill('フォローしました！')
    await hanaPage.getByRole('button', { name: 'コメントする' }).click()
    await expect(hanaPage.getByRole('listitem', { name: `${hana.displayName}のコメント` })).toContainText('フォローしました！')

    expect(await api<PostView>(hanaPage, `/api/posts/${postId}`))
      .toMatchObject({ likeCount: 1, commentCount: 1, likedByMe: true })
  })

  await test.step('はなこが読み直しても、いいねしたままになっている', async () => {
    await hanaPage.goto('/?tab=following')
    await expect(postCard(hanaPage, taro).getByRole('button', { name: 'いいねを取り消す' })).toBeVisible()
  })

  await test.step('たろうの画面にも、いいね・コメント・フォロワーが出る', async () => {
    await taroPage.goto(`/posts/${postId}`)
    await expect(taroPage.getByRole('link', { name: 'いいね 1 件' })).toBeVisible()
    await expect(taroPage.getByRole('listitem', { name: `${hana.displayName}のコメント` })).toContainText('フォローしました！')

    await taroPage.getByRole('link', { name: 'いいね 1 件' }).click()
    await expect(taroPage.getByRole('listitem', { name: hana.displayName })).toBeVisible()

    await taroPage.getByRole('link', { name: '自分のプロフィール' }).click()
    await expect(taroPage.getByRole('link', { name: '1 フォロワー' })).toBeVisible()
    expect(await api<Profile>(taroPage, `/api/users/${taro.username}`))
      .toMatchObject({ followerCount: 1, followingCount: 0, postCount: 1 })
  })
})

test('ログアウトして、ログインし直せる。パスワードが違えばログインできない', async ({ browser }) => {
  const jiro = user('j', 'じろう')
  const page = await signup(browser, jiro)

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page).toHaveURL(/\/login$/)
  // ログアウトした後は、ログインが要る画面を開けない
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('ユーザー ID').fill(jiro.username)
  await page.getByLabel('パスワード').fill('wrong-pass1')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('alert')).toContainText('ユーザー ID かパスワードが違います。')

  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toHaveAttribute('title',
    `${jiro.displayName}（@${jiro.username}）`)
})
