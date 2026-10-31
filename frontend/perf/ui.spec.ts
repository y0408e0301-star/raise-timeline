// page.evaluate などに渡す関数はブラウザで動くので、DOM の型を使う
/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fillLogin, newContext, RUNS, record, throttle, UNDER_LOAD, username, xsrfHeader } from './measure.ts'
import { noisePng } from './png.ts'

// 画面の性能テスト（開発計画書 3-8、基本設計書 2.4）。要件定義書 11.1 の「画面に出るまで」を、ブラウザで押してから
// 表示されるまでの時間で測り、RUNS 回（20 回）の P95 で判定する。データは perf/seed.sql で入れておく。
// 動かし方は frontend/perf/cli.ts（npm run perf -- ui / mixed）

// 時間を測る。押してから表示されるまでを、Node 側の時計で測る
const now = () => performance.now()

// タイムラインに 20 件以上の投稿カードが出るまで待つ
async function waitForTimeline(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('article').length >= 20, null,
    { polling: 'raf', timeout: 30_000 })
}

// 画面に見えている投稿の画像が、すべて読み込み終わるまで待つ（画像の外は loading="lazy" で読まない）
async function waitForVisibleImages(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.querySelectorAll('article img')]
    .filter((img) => img.getBoundingClientRect().top < window.innerHeight)
    .every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
  null, { polling: 'raf', timeout: 30_000 })
}

// 本文 text の投稿のカードに画像が 4 枚あるか。loaded なら、4 枚とも読み込み終わっているか（ブラウザで動く）。
// ユーザーにアイコンはないので、カードの img は投稿の画像だけ
function hasFourImages({ text, loaded }: { text: string, loaded: boolean }): boolean {
  const card = [...document.querySelectorAll('article')].find((a) => a.textContent?.includes(text))
  const imgs = card ? [...card.querySelectorAll('img')] : []
  return imgs.length === 4 && (!loaded || imgs.every((img) => img.complete && img.naturalWidth > 0))
}

// LCP（いちばん大きな内容が出るまで）と CLS（表示のずれの合計）。ページを開いてからの値
async function webVitals(page: Page): Promise<{ lcp: number, cls: number }> {
  return page.evaluate(() => new Promise<{ lcp: number, cls: number }>((resolve) => {
    let lcp = 0
    let cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lcp = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number, hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
    setTimeout(() => resolve({ lcp, cls }), 100)
  }))
}

// 最初に開いたときに読んだ JS・CSS の大きさ（KB。圧縮されて届いたときは圧縮後）
async function assetKilobytes(page: Page): Promise<number> {
  return page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => /\.(js|css)(\?|$)/.test(entry.name))
    .reduce((sum, entry) => sum + entry.encodedBodySize, 0) / 1024)
}

test('N-1 ログインしてからタイムラインの最初の 20 件が出るまで', async ({ browser }, info) => {
  const shown: number[] = []
  const images: number[] = []
  const lcp: number[] = []
  const cls: number[] = []
  for (let i = 0; i < RUNS; i++) {
    // 毎回、Cookie もキャッシュもないブラウザで、ログイン画面から始める
    const context = await newContext(browser, info)
    const page = await context.newPage()
    await throttle(page, info)
    await fillLogin(page, 41)
    const start = now()
    await page.getByRole('button', { name: 'ログイン' }).click()
    await waitForTimeline(page)
    shown.push(now() - start)
    // 画像は S3 から遅れて届くので、合否には入れず参考として記録する（要件定義書 11.1）
    await waitForVisibleImages(page)
    images.push(now() - start)

    if (!UNDER_LOAD) {
      if (i === 0) {
        record(info, 'assets', '参考', '最初に読む JS・CSS の大きさ', [await assetKilobytes(page)], { unit: 'KB' })
      }
      // タイムラインを開き直したときの LCP・CLS
      await page.reload()
      await waitForTimeline(page)
      const vitals = await webVitals(page)
      lcp.push(vitals.lcp)
      cls.push(vitals.cls)
    }
    await context.close()
  }
  const result = record(info, 'n1', 'N-1', 'ログイン → タイムラインの 20 件', shown, { target: 3000 })
  record(info, 'n1-images', '参考', 'ログイン → 見えている画像まで', images)
  if (!UNDER_LOAD) {
    record(info, 'lcp', '参考', 'タイムラインを開き直したときの LCP', lcp)
    record(info, 'cls', '参考', 'タイムラインを開き直したときの CLS', cls, { unit: '' })
  }
  expect.soft(result.p95, `N-1 の P95（${result.samples.join(', ')}）`).toBeLessThanOrEqual(3000)
})

test('N-3 いいね・フォローを押してから画面に出るまで', async ({ browser }, info) => {
  const context = await newContext(browser, info)
  const page = await context.newPage()
  await throttle(page, info)
  await fillLogin(page, 42)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await waitForTimeline(page)

  // 画面は押した直後に表示を変え（楽観的な表示）、応答が届いて確定する。両方を測り、両方で判定する
  const likeShown: number[] = []
  const likeConfirmed: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const card = page.getByRole('article').nth(i % 10)
    const button = card.getByRole('button', { name: /^いいね(する|を取り消す)$/ })
    // もともといいねしている投稿は、先に取り消しておく（測らない）
    if (await button.getAttribute('aria-label') === 'いいねを取り消す') {
      const undone = page.waitForResponse((r) => r.url().endsWith('/like') && r.request().method() === 'DELETE')
      await button.click()
      await undone
    }
    let confirmedAt = 0
    const confirmed = page.waitForResponse((r) => {
      if (!(r.url().endsWith('/like') && r.request().method() === 'PUT')) return false
      confirmedAt = now()
      return true
    })
    const start = now()
    await button.click()
    await card.getByRole('button', { name: 'いいねを取り消す' }).waitFor()
    likeShown.push(now() - start)
    expect((await confirmed).ok()).toBe(true)
    likeConfirmed.push(confirmedAt - start)
    // 元に戻す（測らない）
    const undone = page.waitForResponse((r) => r.url().endsWith('/like') && r.request().method() === 'DELETE')
    await card.getByRole('button', { name: 'いいねを取り消す' }).click()
    await undone
  }

  // 測るユーザーは全員をフォローしているので、外してから（測らない）フォローし直す
  const target = username(800)
  await page.goto(`/users/${target}`)
  const button = page.getByRole('region', { name: 'プロフィール' }).getByRole('button', { name: /^フォロー/ })
  await expect(button).toHaveText('フォロー中')
  const followShown: number[] = []
  const followConfirmed: number[] = []
  const followUrl = `/api/users/${target}/follow`
  for (let i = 0; i < RUNS; i++) {
    const undone = page.waitForResponse((r) => r.url().endsWith(followUrl) && r.request().method() === 'DELETE')
    await button.click()
    await undone
    await expect(button).toHaveText('フォローする')

    let confirmedAt = 0
    const confirmed = page.waitForResponse((r) => {
      if (!(r.url().endsWith(followUrl) && r.request().method() === 'PUT')) return false
      confirmedAt = now()
      return true
    })
    const start = now()
    await button.click()
    await expect(button).toHaveText('フォロー中')
    followShown.push(now() - start)
    expect((await confirmed).ok()).toBe(true)
    followConfirmed.push(confirmedAt - start)
  }
  await context.close()

  const results = [
    record(info, 'n3-like-shown', 'N-3', 'いいね：押す → ♥ が出る', likeShown, { target: 500 }),
    record(info, 'n3-like-confirmed', 'N-3', 'いいね：押す → 応答で確定', likeConfirmed, { target: 500 }),
    record(info, 'n3-follow-shown', 'N-3', 'フォロー：押す → 「フォロー中」が出る', followShown, { target: 500 }),
    record(info, 'n3-follow-confirmed', 'N-3', 'フォロー：押す → 応答で確定', followConfirmed, { target: 500 }),
  ]
  for (const r of results) {
    expect.soft(r.p95, `${r.label} の P95（${r.samples.join(', ')}）`).toBeLessThanOrEqual(500)
  }
})

test('N-4 画像 4 枚（合計 20MB）を投稿してからタイムラインに出るまで', async ({ browser }, info) => {
  // 手元では API から S3 への送信が家の回線を通り、公開先（EC2 → S3 は AWS の中）と条件が違うので、
  // PERF_UPLOAD=1 のとき（GitHub Actions のランナーの中の MinIO・公開先で測るとき）だけ測る。
  // スマートフォンでは測らない（20MB の送信を 20 回ずつ 2 通り行うと時間がかかるため。回線の条件は同じ）
  test.skip(process.env.PERF_UPLOAD !== '1', '画像の送信は PERF_UPLOAD=1 のときだけ測る')
  test.skip(info.project.name === 'mobile' || UNDER_LOAD, 'パソコンの幅で、負荷をかけないときだけ測る')
  const context = await newContext(browser, info)
  const page = await context.newPage()
  await throttle(page, info)
  await fillLogin(page, 43)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await waitForTimeline(page)

  // 1 枚 約 5.07MB（上限 5MB = 5,242,880 バイトの少し下）を 4 枚。合計 約 20.3MB
  const files = [1, 2, 3, 4].map((k) => ({ name: `perf-${k}.png`, mimeType: 'image/png', buffer: noisePng(1300, 1300) }))
  const shown: number[] = []
  const images: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const body = `N-4 の測定 ${Date.now()}`
    await page.getByRole('textbox', { name: '投稿の本文' }).fill(body)
    await page.getByLabel('添える画像のファイル').setInputFiles(files)
    const created = page.waitForResponse((r) => r.url().endsWith('/api/posts') && r.request().method() === 'POST',
      { timeout: 180_000 })
    const start = now()
    await page.getByRole('button', { name: '投稿する' }).click()
    // 画像 4 枚の枠が付いた投稿のカードが出るまで（N-1 と同じく、画像の読み込みは合否に入れない。要件定義書 11.1）
    await page.waitForFunction(hasFourImages, { text: body, loaded: false }, { polling: 'raf', timeout: 180_000 })
    shown.push(now() - start)
    // 4 枚の画像を読み込み終わるまで（参考。20MB を下り 10Mbps で読むと、それだけで約 16 秒かかる）
    await page.waitForFunction(hasFourImages, { text: body, loaded: true }, { polling: 'raf', timeout: 180_000 })
    images.push(now() - start)

    // 投稿を消して、S3 の画像も消す（測らない）。応答の本文は大きくてブラウザの記録から消えるので、ID はカードのリンクから取る
    expect((await created).status()).toBe(201)
    const id = (await page.getByRole('link', { name: body }).getAttribute('href'))?.split('/').pop()
    const deleted = await page.request.delete(`/api/posts/${id}`, { headers: await xsrfHeader(context) })
    expect(deleted.ok(), `投稿 ${id} を消せません（${deleted.status()}）`).toBe(true)
    // 消した投稿のカードが残らないよう、読み直す（測らない）
    await page.reload()
    await waitForTimeline(page)
  }
  await context.close()

  const result = record(info, 'n4', 'N-4', '画像 4 枚（20MB）の投稿 → タイムラインにカード', shown, { target: 10_000 })
  record(info, 'n4-images', '参考', '画像 4 枚（20MB）の投稿 → 画像まで', images)
  expect.soft(result.p95, `N-4 の P95（${result.samples.join(', ')}）`).toBeLessThanOrEqual(10_000)
})

// タブ（tabpanel）の中に、投稿のカードが count 件以上出るまで待つ
async function waitForTabCards(page: Page, label: string, count: number): Promise<void> {
  await page.waitForFunction((arg) =>
    document.querySelectorAll(`[role="tabpanel"][aria-label="${arg.label}"] article`).length >= arg.count,
  { label, count }, { polling: 'raf', timeout: 30_000 })
}

// TC-02-7
test('N-2 タブを切り替えてから 20 件が出るまで、一番下まで見てから続きの 20 件が出るまで', async ({ browser }, info) => {
  const context = await newContext(browser, info)
  const page = await context.newPage()
  await throttle(page, info)
  await fillLogin(page, 44)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.getByRole('link', { name: '自分のプロフィール' }).waitFor()
  // 最後に開いたタブは覚えられるので、「フォロー中」から始める
  await page.goto('/?tab=following')
  await waitForTabCards(page, 'フォロー中', 20)

  // 「すべて」⇔「フォロー中」を交互に押す。切り替えるとすぐタブの名前は変わるが、一覧は API の応答で入れ替わるので、
  // 応答が届いた後に 20 件そろうまでを測る（応答を待つ前の古い 20 件で止めない）
  const tabs = { すべて: [] as number[], フォロー中: [] as number[] }
  for (let i = 0; i < RUNS * 2; i++) {
    const label = i % 2 === 0 ? 'すべて' : 'フォロー中'
    const responded = page.waitForResponse((r) => r.url().includes('/api/timeline?') && !r.url().includes('cursor='))
    const start = now()
    await page.getByRole('tab', { name: label }).click()
    expect((await responded).ok()).toBe(true)
    await waitForTabCards(page, label, 20)
    tabs[label].push(now() - start)
  }

  // 続きの読み込み（T-2）。毎回読み直して最初の 20 件にしてから（測らない）、一番下まで動かす
  const more: number[] = []
  for (let i = 0; i < RUNS; i++) {
    await page.goto('/?tab=following')
    await waitForTabCards(page, 'フォロー中', 20)
    const start = now()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await waitForTabCards(page, 'フォロー中', 40)
    more.push(now() - start)
  }
  await context.close()

  const results = [
    record(info, 'n2-tab-all', 'N-2', 'タブ：「すべて」を押す → 20 件', tabs.すべて, { target: 1000 }),
    record(info, 'n2-tab-following', 'N-2', 'タブ：「フォロー中」を押す → 20 件', tabs.フォロー中, { target: 1000 }),
    record(info, 'n2-more', 'N-2', '一番下まで見る → 続きの 20 件', more, { target: 1000 }),
  ]
  for (const r of results) {
    expect.soft(r.p95, `${r.label} の P95（${r.samples.join(', ')}）`).toBeLessThanOrEqual(1000)
  }
})

// TC-08-8
test('N-5 ユーザー検索で Enter を押してから結果が出るまで', async ({ browser }, info) => {
  const context = await newContext(browser, info)
  const page = await context.newPage()
  await throttle(page, info)
  await fillLogin(page, 44)
  await page.getByRole('button', { name: 'ログイン' }).click()
  // ヘッダーが出てから（600px 未満の虫めがねのボタンが見えるかを確かめるため）
  await page.getByRole('link', { name: '自分のプロフィール' }).waitFor()

  const shown: number[] = []
  for (let i = 0; i < RUNS; i++) {
    // 毎回違う文字で探す（perf_050〜perf_069。どれも 10 人が一致する）
    const q = `perf_0${50 + i}`
    // 600px 未満では、検索欄は虫めがねのボタンで開く（測らない）
    const toggle = page.getByRole('button', { name: 'ユーザーを検索' })
    if (await toggle.isVisible()) await toggle.click()
    const search = page.getByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await search.fill(q)
    const responded = page.waitForResponse((r) => r.url().includes(`/api/search/users?q=${q}`))
    const start = now()
    await search.press('Enter')
    expect((await responded).ok()).toBe(true)
    await page.getByRole('heading', { name: `「${q}」の検索結果` }).waitFor()
    await expect(page.getByRole('list', { name: '検索結果' }).getByRole('listitem')).toHaveCount(10)
    shown.push(now() - start)
  }
  await context.close()

  const result = record(info, 'n5', 'N-5', '検索：Enter → 結果の一覧', shown, { target: 1000 })
  expect.soft(result.p95, `N-5 の P95（${result.samples.join(', ')}）`).toBeLessThanOrEqual(1000)
})
