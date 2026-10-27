// img.evaluate に渡す関数はブラウザで動くので、DOM の型を使う
/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { noisePng } from '../perf/png.ts'
import { api, runId, send, signup, user } from './helpers.ts'
import type { Profile } from './helpers.ts'

// プロフィールの編集（G-7、FN-09 第 2 版）と、フォロー中・フォロワーの一覧（G-8、FN-07）を確かめる

// 画像が読み込み終わっているか
async function expectLoaded(img: Locator): Promise<void> {
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
}

test('表示名・自己紹介・アイコンを変えると、ヘッダーとプロフィールに出る。アイコンは外せる', async ({ browser }) => {
  const taro = user('ft', 'たろう')
  const page = await signup(browser, taro)
  const newName = `新しい名前 ${runId()}`
  let oldIconUrl = ''

  await test.step('表示名を空にすると保存できない（M-5）', async () => {
    await page.goto('/settings/profile')
    // 今の値を読み込んで入れ終わってから書き換える（読み込みが後から入力欄を上書きするため）
    await expect(page.getByLabel('表示名')).toHaveValue(taro.displayName)
    await page.getByLabel('表示名').fill(' ')
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page.getByText('表示名を入力してください。')).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/profile$/)
  })

  await test.step('アイコン・表示名・自己紹介を変えて保存すると、G-6 とヘッダーに出る', async () => {
    await page.getByLabel('アイコン画像のファイル').setInputFiles(
      { name: 'icon.png', mimeType: 'image/png', buffer: noisePng(96, 96) })
    await page.getByLabel('表示名').fill(newName)
    await page.getByLabel('自己紹介').fill('E2E の自己紹介です。')
    await page.getByRole('button', { name: '保存する' }).click()

    await expect(page).toHaveURL(new RegExp(`/users/${taro.username}$`))
    const profile = page.getByRole('region', { name: 'プロフィール' })
    await expect(profile.getByRole('heading', { name: newName })).toBeVisible()
    await expect(profile.getByText('E2E の自己紹介です。')).toBeVisible()
    await expectLoaded(profile.getByRole('img', { name: `${newName}のアイコン` }))
    const me = page.getByRole('link', { name: '自分のプロフィール' })
    await expect(me).toHaveAttribute('title', `${newName}（@${taro.username}）`)
    await expectLoaded(me.getByRole('img'))

    const saved = await api<Profile>(page, `/api/users/${taro.username}`)
    expect(saved).toMatchObject({ displayName: newName, bio: 'E2E の自己紹介です。' })
    expect(saved.iconUrl).not.toBeNull()
    oldIconUrl = saved.iconUrl ?? ''
  })

  await test.step('「アイコンを外す」で保存すると、頭文字の表示に戻り、S3 の前のアイコンも消える', async () => {
    await page.getByRole('link', { name: 'プロフィールを編集' }).click()
    await page.getByRole('button', { name: 'アイコンを外す' }).click()
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page).toHaveURL(new RegExp(`/users/${taro.username}$`))
    await expect(page.getByRole('region', { name: 'プロフィール' }).getByRole('img')).toHaveCount(0)
    expect((await api<Profile>(page, `/api/users/${taro.username}`)).iconUrl).toBeNull()
    expect((await page.request.get(oldIconUrl)).ok()).toBe(false)
  })
})

test('フォロー中・フォロワーの一覧をタブで切り替え、一覧からフォローできる', async ({ browser }) => {
  const taro = user('fa', 'たろう')
  const hana = user('fb', 'はなこ')
  const jiro = user('fc', 'じろう')
  const taroPage = await signup(browser, taro)
  // はなこ・じろうがたろうをフォローし、たろうははなこだけをフォローする
  for (const follower of [hana, jiro]) {
    const page = await signup(browser, follower)
    await send(page, 'PUT', `/api/users/${taro.username}/follow`)
    await page.context().close()
  }
  await send(taroPage, 'PUT', `/api/users/${hana.username}/follow`)

  await taroPage.goto(`/users/${taro.username}`)
  await taroPage.getByRole('link', { name: '2 フォロワー' }).click()
  await expect(taroPage).toHaveURL(new RegExp(`/users/${taro.username}/followers$`))
  await expect(taroPage.getByRole('tab', { name: 'フォロワー' })).toHaveAttribute('aria-selected', 'true')
  const followers = taroPage.getByRole('list', { name: 'フォロワー' })
  // 新しくフォローした順
  await expect(followers.getByRole('listitem')).toHaveCount(2)
  await expect(followers.getByRole('listitem').first()).toHaveAccessibleName(jiro.displayName)

  await test.step('フォロワーの行から、まだフォローしていない人をフォローできる', async () => {
    await expect(followers.getByRole('listitem', { name: hana.displayName }).getByRole('button'))
      .toHaveText('フォロー中')
    const jiroRow = followers.getByRole('listitem', { name: jiro.displayName })
    await jiroRow.getByRole('button', { name: 'フォローする' }).click()
    await expect(jiroRow.getByRole('button', { name: 'フォロー中' })).toBeVisible()
    expect((await api<Profile>(taroPage, `/api/users/${taro.username}`)).followingCount).toBe(2)
  })

  await test.step('「フォロー中」のタブに切り替えると URL も変わり、2 人が出る', async () => {
    await taroPage.getByRole('tab', { name: 'フォロー中' }).click()
    await expect(taroPage).toHaveURL(new RegExp(`/users/${taro.username}/following$`))
    const following = taroPage.getByRole('list', { name: 'フォロー中' })
    await expect(following.getByRole('listitem')).toHaveCount(2)
    await expect(following.getByRole('listitem').first()).toHaveAccessibleName(jiro.displayName)
  })

  await test.step('名前を押すと、その人のプロフィールに移る', async () => {
    await taroPage.getByRole('listitem', { name: hana.displayName }).getByRole('link').first().click()
    await expect(taroPage).toHaveURL(new RegExp(`/users/${hana.username}$`))
    await expect(taroPage.getByRole('region', { name: 'プロフィール' }).getByRole('button', { name: 'フォロー中' }))
      .toBeVisible()
  })
})
