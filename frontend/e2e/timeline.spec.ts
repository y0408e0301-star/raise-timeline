import { expect, test } from '@playwright/test'
import { createPostByApi, postCard, runId, signup, user } from './helpers.ts'

// タイムライン（FN-02）の「フォロー中」「すべて」のタブ、続きの読み込み（T-2）、フォロー解除（FN-07）を確かめる

test('フォローした人の投稿だけが「フォロー中」に出て、21 件目は一番下まで見ると読み込まれる', async ({ browser }) => {
  const taro = user('tt', 'たろう')
  const hana = user('th', 'はなこ')
  const taroPage = await signup(browser, taro)
  // 21 件（20 件ずつ読むので、続きが 1 件ある）。画面で 21 回投稿すると時間がかかるので API で作る
  for (let i = 1; i <= 21; i++) await createPostByApi(taroPage, `たろうの投稿 ${i} ${runId()}`)

  const page = await signup(browser, hana)
  const following = page.getByRole('tabpanel', { name: 'フォロー中' })

  await test.step('まだ誰もフォローしていなければ、「フォロー中」は空で「すべて」に誘う（M-8）', async () => {
    await expect(following.getByText('まだ誰もフォローしていません。')).toBeVisible()
    await following.getByRole('button', { name: '「すべて」タブを開く' }).click()
    await expect(page).toHaveURL(/\?tab=all$/)
    await expect(page.getByRole('tab', { name: 'すべて' })).toHaveAttribute('aria-selected', 'true')
    // 「すべて」には、フォローしていない人の投稿も新しい順に出る
    await expect(page.getByRole('tabpanel', { name: 'すべて' }).getByRole('article').first())
      .toContainText(`たろうの投稿 21 ${runId()}`)
  })

  await test.step('たろうをフォローすると、「フォロー中」に新しい順で 20 件出る', async () => {
    await page.goto(`/users/${taro.username}`)
    await page.getByRole('region', { name: 'プロフィール' }).getByRole('button', { name: 'フォローする' }).click()
    await expect(page.getByRole('region', { name: 'プロフィール' }).getByRole('button', { name: 'フォロー中' }))
      .toBeVisible()
    // 「/」は最後に開いたタブ（「すべて」）を出すので、タブを指定して開く
    await page.goto('/?tab=following')
    const cards = postCard(page, taro)
    await expect(cards).toHaveCount(20)
    await expect(cards.first()).toContainText(`たろうの投稿 21 ${runId()}`)
    await expect(cards.last()).toContainText(`たろうの投稿 2 ${runId()}`)
  })

  await test.step('一番下まで見ると続きの 1 件が足され、終わりの表示が出る', async () => {
    await page.getByRole('article').last().scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 10_000)
    await expect(postCard(page, taro)).toHaveCount(21)
    await expect(postCard(page, taro).last()).toContainText(`たろうの投稿 1 ${runId()}`)
    await expect(page.getByText('これ以上の投稿はありません')).toBeVisible()
  })

  await test.step('フォローを外すと、「フォロー中」から消える', async () => {
    await page.goto(`/users/${taro.username}`)
    const profile = page.getByRole('region', { name: 'プロフィール' })
    await profile.getByRole('button', { name: 'フォロー中' }).click()
    await expect(profile.getByRole('button', { name: 'フォローする' })).toBeVisible()
    await page.goto('/?tab=following')
    await expect(following.getByText('まだ誰もフォローしていません。')).toBeVisible()
    await expect(postCard(page, taro)).toHaveCount(0)
  })
})
