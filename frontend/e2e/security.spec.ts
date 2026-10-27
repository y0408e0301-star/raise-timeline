import { expect, test } from '@playwright/test'
import { api, createPostByApi, newContext, PASSWORD, postCard, send, signup, submitLogin, user, xsrfHeader } from './helpers.ts'
import type { PostView } from './helpers.ts'

// 要件定義書 11.3 のセキュリティの要件のうち、画面を通して確かめられるものを確かめる。
// API の層ごとの細かい確認は、API の単体テスト（3-5）で行っている

test('N-10 ログインしていないと、どの画面も G-1 に移り、API も 401 を返す', async ({ browser }) => {
  const context = await newContext(browser)
  const page = await context.newPage()
  for (const path of ['/', '/posts/1', '/posts/1/likes', '/users/someone', '/users/someone/followers',
    '/search?q=a', '/settings/profile']) {
    await page.goto(path)
    await expect(page, path).toHaveURL(/\/login$/)
  }
  for (const path of ['/api/timeline', '/api/posts/1', '/api/users/someone', '/api/search/users?q=a',
    '/api/auth/me']) {
    expect((await page.request.get(path)).status(), path).toBe(401)
  }
  await context.close()
})

test('N-11 他人の投稿・コメントは、画面に操作が出ず、API を直接呼んでも変えられない', async ({ browser }) => {
  const taro = user('st', 'たろう')
  const hana = user('sh', 'はなこ')
  const taroPage = await signup(browser, taro)
  const post = await createPostByApi(taroPage, 'たろうの投稿')
  const { id: commentId } = await send<{ id: number }>(taroPage, 'POST', `/api/posts/${post.id}/comments`,
    { data: { body: 'たろうのコメント' } })

  const page = await signup(browser, hana)
  await page.goto(`/posts/${post.id}`)
  await expect(postCard(page, taro)).toContainText('たろうの投稿')
  // 他人の投稿には「…」メニュー（編集・削除）がなく、他人のコメントには「削除」がない
  await expect(postCard(page, taro).getByRole('button', { name: 'メニュー' })).toHaveCount(0)
  const comment = page.getByRole('listitem', { name: `${taro.displayName}のコメント` })
  await expect(comment).toContainText('たろうのコメント')
  await expect(comment.getByRole('button', { name: '削除' })).toHaveCount(0)

  // 画面を通さずに API を呼んでも、サーバー側で断る
  const headers = await xsrfHeader(page)
  expect((await page.request.patch(`/api/posts/${post.id}`, { headers, data: { body: '書き換え' } })).status())
    .toBe(403)
  expect((await page.request.delete(`/api/posts/${post.id}`, { headers })).status()).toBe(403)
  expect((await page.request.delete(`/api/comments/${commentId}`, { headers })).status()).toBe(403)
  expect(await api<PostView>(page, `/api/posts/${post.id}`)).toMatchObject({ body: 'たろうの投稿', commentCount: 1 })
})

test('N-15 本文の HTML は文字のまま出て、スクリプトは動かない', async ({ browser }) => {
  const jiro = user('sx', 'じろう')
  const page = await signup(browser, jiro)
  let dialogs = 0
  page.on('dialog', (dialog) => {
    dialogs++
    void dialog.dismiss()
  })
  const body = '<img src=x onerror="alert(1)"><script>alert(2)</script><b>太字</b>'
  await page.getByRole('textbox', { name: '投稿の本文' }).fill(body)
  await page.getByRole('button', { name: '投稿する' }).click()

  for (const path of ['/', `/users/${jiro.username}`]) {
    await page.goto(path)
    const card = postCard(page, jiro)
    await expect(card.getByText(body, { exact: true })).toBeVisible()
    await expect(card.locator('img, script, b')).toHaveCount(0)
  }
  expect(dialogs).toBe(0)
})

test('N-13 5 回続けてパスワードを間違えると、正しいパスワードでもログインできない', async ({ browser }) => {
  const saburo = user('sl', 'さぶろう')
  const page = await signup(browser, saburo)
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page).toHaveURL(/\/login$/)

  const alert = page.getByRole('alert')
  for (let i = 1; i <= 4; i++) {
    await submitLogin(page, saburo.username, 'wrong-pass1')
    await expect(alert).toHaveText('ユーザー ID かパスワードが違います。')
  }
  // 5 回目の失敗でロックする
  await submitLogin(page, saburo.username, 'wrong-pass1')
  await expect(alert).toHaveText('ログインに続けて失敗したため、15 分間ログインできません。')
  await submitLogin(page, saburo.username, PASSWORD)
  await expect(alert).toHaveText('ログインに続けて失敗したため、15 分間ログインできません。')
  await expect(page).toHaveURL(/\/login$/)
})
