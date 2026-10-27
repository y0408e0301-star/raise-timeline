// img.evaluate に渡す関数はブラウザで動くので、DOM の型を使う
/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { noisePng } from '../perf/png.ts'
import { api, postCard, runId, signup, user } from './helpers.ts'
import type { PostView } from './helpers.ts'

// 投稿の編集・削除（FN-03）、画像（FN-04）、コメントの削除（FN-05）を、画面を通して確かめる。
// 削除の前の確認ダイアログ（G-11、N-19）は「キャンセル」で何も消えないことも確かめる

const image = (n: number) => ({ name: `e2e-${n}.png`, mimeType: 'image/png', buffer: noisePng(64, 48) })

// 投稿フォームから投稿し、その投稿を API から取って返す
async function post(page: Page, body: string): Promise<PostView> {
  await page.getByRole('textbox', { name: '投稿の本文' }).fill(body)
  const created = page.waitForResponse((r) => r.url().endsWith('/api/posts') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '投稿する' }).click()
  const res = await created
  expect(res.status()).toBe(201)
  return (await res.json()) as PostView
}

test('自分の投稿を編集し、確認ダイアログを通して削除できる', async ({ browser }) => {
  const taro = user('pe', 'たろう')
  const page = await signup(browser, taro)
  const created = await post(page, `編集する前 ${runId()}`)
  const card = postCard(page, taro)

  await test.step('「…」→「編集」で本文を直すと、（編集済み）が付き DB も変わる', async () => {
    await card.getByRole('button', { name: 'メニュー' }).click()
    await card.getByRole('menuitem', { name: '編集' }).click()
    await card.getByRole('textbox', { name: '投稿の本文を編集' }).fill(`編集した後 ${runId()}`)
    await card.getByRole('button', { name: '保存する' }).click()
    await expect(card.getByText(`編集した後 ${runId()}`)).toBeVisible()
    await expect(card.getByText('（編集済み）')).toBeVisible()
    expect((await api<PostView>(page, `/api/posts/${created.id}`)).body).toBe(`編集した後 ${runId()}`)
  })

  await test.step('確認ダイアログで「キャンセル」を押すと、投稿は残る', async () => {
    await card.getByRole('button', { name: 'メニュー' }).click()
    await card.getByRole('menuitem', { name: '削除' }).click()
    const dialog = page.getByRole('alertdialog', { name: '投稿を削除' })
    await expect(dialog).toContainText('元に戻せません')
    // 誤って Enter キーで消さないよう、最初は「キャンセル」にカーソルがある
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeFocused()
    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    await expect(dialog).toBeHidden()
    await expect(card).toBeVisible()
    expect((await page.request.get(`/api/posts/${created.id}`)).status()).toBe(200)
  })

  await test.step('詳細画面（G-4）で「削除」を押すと消え、タイムラインに戻る', async () => {
    await card.getByRole('link', { name: `編集した後 ${runId()}` }).click()
    await expect(page).toHaveURL(new RegExp(`/posts/${created.id}$`))
    await page.getByRole('button', { name: 'メニュー' }).click()
    await page.getByRole('menuitem', { name: '削除' }).click()
    await page.getByRole('alertdialog', { name: '投稿を削除' }).getByRole('button', { name: '削除' }).click()
    // 前の画面（タイムライン。開いていたタブが URL に付く）に戻る
    await expect(page).toHaveURL(/\/(\?tab=following)?$/)
    await expect(card).toHaveCount(0)
    expect((await page.request.get(`/api/posts/${created.id}`)).status()).toBe(404)
  })
})

test('本文は 280 文字まで。281 文字では投稿できない', async ({ browser }) => {
  const page = await signup(browser, user('pl', 'ながい'))
  const textbox = page.getByRole('textbox', { name: '投稿の本文' })
  const button = page.getByRole('button', { name: '投稿する' })

  await textbox.fill('あ'.repeat(281))
  await expect(page.getByText('-1', { exact: true })).toBeVisible()
  await expect(button).toBeDisabled()

  // 絵文字（サロゲートペア）も 1 文字と数える
  const body = `${'あ'.repeat(278)}🍣🍣`
  await textbox.fill(body)
  await expect(page.getByText('残り 0', { exact: true })).toBeVisible()
  const created = await post(page, body)
  expect(created.body).toBe(body)
})

test('画像 4 枚を添えて投稿し、拡大して見られる。投稿を消すと画像も消える', async ({ browser }) => {
  const hana = user('pi', 'はなこ')
  const page = await signup(browser, hana)
  const files = page.getByLabel('添える画像のファイル')

  await test.step('5 枚選ぶと、4 枚までにしてメッセージを出す（M-12）', async () => {
    await files.setInputFiles([1, 2, 3, 4, 5].map(image))
    await expect(page.getByText('画像は 1 つの投稿に 4 枚までです。')).toBeVisible()
    await expect(page.getByRole('list', { name: '添える画像' }).getByRole('listitem')).toHaveCount(4)
  })

  const created = await post(page, `画像つき ${runId()}`)
  const card = postCard(page, hana)

  await test.step('4 枚とも S3 から読み込めて、押すと G-10 で拡大し、左右に切り替えられる', async () => {
    expect(created.images).toHaveLength(4)
    const imgs = card.locator('img')
    await expect(imgs).toHaveCount(4)
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(64)
    }

    await card.getByRole('button', { name: '画像 2 / 4 を拡大' }).click()
    const dialog = page.getByRole('dialog', { name: '画像の拡大' })
    await expect(dialog.getByRole('img', { name: '画像 2 / 4' })).toBeVisible()
    await dialog.getByRole('button', { name: '次の画像' }).click()
    await expect(dialog.getByRole('img', { name: '画像 3 / 4' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByRole('img', { name: '画像 1 / 4' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  await test.step('投稿を消すと、S3 の画像も読めなくなる（後片付けも兼ねる）', async () => {
    await card.getByRole('button', { name: 'メニュー' }).click()
    await card.getByRole('menuitem', { name: '削除' }).click()
    await page.getByRole('alertdialog', { name: '投稿を削除' }).getByRole('button', { name: '削除' }).click()
    await expect(card).toHaveCount(0)
    // 署名付き URL は 15 分有効なので、読めないのは画像そのものが消えたため
    for (const { url } of created.images) {
      expect((await page.request.get(url)).ok(), url).toBe(false)
    }
  })
})

test('自分のコメントを、確認ダイアログを通して削除できる', async ({ browser }) => {
  const jiro = user('pc', 'じろう')
  const page = await signup(browser, jiro)
  const created = await post(page, `コメントを付ける投稿 ${runId()}`)
  await page.goto(`/posts/${created.id}`)

  await page.getByRole('textbox', { name: 'コメントの本文' }).fill('消すコメント')
  await page.getByRole('button', { name: 'コメントする' }).click()
  const comment = page.getByRole('listitem', { name: `${jiro.displayName}のコメント` })
  await expect(comment).toContainText('消すコメント')
  await expect(page.getByLabel('コメント 1 件')).toBeVisible()

  await comment.getByRole('button', { name: '削除' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'コメントを削除' })
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await expect(comment).toBeVisible()

  await comment.getByRole('button', { name: '削除' }).click()
  await dialog.getByRole('button', { name: '削除' }).click()
  await expect(comment).toHaveCount(0)
  await expect(page.getByLabel('コメント 0 件')).toBeVisible()
  expect((await api<PostView>(page, `/api/posts/${created.id}`)).commentCount).toBe(0)
})
