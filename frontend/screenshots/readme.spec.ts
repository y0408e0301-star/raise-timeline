import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, request, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page } from '@playwright/test'
import { beach, icon, lake, skies, sunsetSea } from './scenes.ts'

// README のスクリーンショット（docs/images/）を、毎回同じサンプルのデータで撮る（npm run screenshots）。
// 1. 前回のサンプルのユーザー（ID が「demo_」で始まる）の投稿とアイコンを API で消し（S3 の画像も消える）、DB からユーザーを消す
// 2. ユーザー・フォロー・投稿（画像つき）・いいね・コメントを API で作り、投稿の時刻を DB でずらす
// 3. 画面を開いて撮る

const BASE = 'http://localhost:5173'
const PASSWORD = 'demo-pass1'
const OUT = new URL('../../docs/images/', import.meta.url)

type Demo = { username: string, displayName: string, bio: string }
const haru: Demo = { username: 'demo_haru', displayName: '春野 はる', bio: '本とコーヒーが好き。近所のカフェを少しずつ開拓しています。' }
const umi: Demo = { username: 'demo_umi', displayName: '海野 うみ', bio: '週末は海の近くを歩いています。写真は全部スマートフォンで。' }
const sora: Demo = { username: 'demo_sora', displayName: '空井 そら', bio: '山と湖が好きです。朝早く出かけがち。' }
const kai: Demo = { username: 'demo_kai', displayName: 'かい', bio: 'Web エンジニア。キーボードと空の写真を集めています。' }
const DEMOS = [haru, umi, sora, kai]

type Post = { id: number }
type Page_<T> = { items: T[], nextCursor: string | null }

// SQL を開発用の DB で実行する（e2e/cleanup.ts と同じつなぎ方）
function sql(statement: string): void {
  execFileSync('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', 'raise_timeline', '-d', 'raise_timeline', '-v', 'ON_ERROR_STOP=1', '-q', '-c', statement,
  ], { cwd: new URL('../..', import.meta.url), stdio: 'inherit' })
}

// そのユーザーでログインした API の窓口。GET 以外には CSRF のヘッダーを付ける
async function as(user: Demo, signup = false) {
  const ctx: APIRequestContext = await request.newContext({ baseURL: BASE })
  // XSRF-TOKEN の Cookie は API の応答で届く。ログインの前でも、GET の応答で受け取れる（機能定義書 3.2）
  const xsrf = async () => {
    const token = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')
    if (!token) throw new Error('XSRF-TOKEN の Cookie がありません')
    return { 'X-XSRF-TOKEN': decodeURIComponent(token.value) }
  }
  await ctx.get('/api/auth/username-availability?username=x')
  const path = signup ? '/api/auth/signup' : '/api/auth/login'
  const data = signup ? { username: user.username, displayName: user.displayName, password: PASSWORD } : { username: user.username, password: PASSWORD }
  const res = await ctx.post(path, { data, headers: await xsrf() })
  if (!res.ok()) {
    expect(signup, `${user.username} の登録 → ${res.status()} ${await res.text()}`).toBe(false)
    await ctx.dispose()
    return null
  }
  // ログインすると CSRF のトークンが入れ替わるので、受け取り直す
  await ctx.get('/api/auth/me')
  const headers = await xsrf()
  const call = async <T>(method: string, url: string, options: object = {}): Promise<T> => {
    const r = await ctx.fetch(url, { method, headers, ...options })
    expect(r.ok(), `${user.username} ${method} ${url} → ${r.status()} ${await r.text()}`).toBe(true)
    return (r.status() === 204 ? undefined : await r.json()) as T
  }
  return { ctx, call }
}

// 前回のサンプルを消す。投稿とアイコンは API で消して、S3 の画像も消す
async function removeDemos(): Promise<void> {
  for (const user of DEMOS) {
    const me = await as(user)
    if (!me) continue
    for (;;) {
      const page = await me.call<Page_<Post>>('GET', `/api/users/${user.username}/posts`)
      if (page.items.length === 0) break
      for (const post of page.items) await me.call('DELETE', `/api/posts/${post.id}`)
    }
    await me.call('DELETE', '/api/me/icon')
    await me.ctx.dispose()
  }
  sql("DELETE FROM users WHERE left(username, 5) = 'demo_'")
}

// SVG をブラウザで PNG にする
async function png(browser: Browser, svg: string, name: string, width = 1200, height = 800) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(`<body style="margin:0">${svg}</body>`)
  const buffer = await page.screenshot({ type: 'png' })
  await page.close()
  return { name, mimeType: 'image/png', buffer }
}

async function seed(browser: Browser): Promise<{ umiPost: number }> {
  const [h, u, s, k] = await Promise.all(DEMOS.map((d) => as(d, true)))
  const users = [h!, u!, s!, k!]
  for (const [i, user] of DEMOS.entries()) {
    await users[i].call('PATCH', '/api/me/profile', { data: { displayName: user.displayName, bio: user.bio } })
  }
  await u!.call('PUT', '/api/me/icon', { multipart: { icon: await png(browser, icon('#219ebc', '#023047', 'wave'), 'umi.png', 400, 400) } })
  await s!.call('PUT', '/api/me/icon', { multipart: { icon: await png(browser, icon('#a8dadc', '#457b9d', 'mountain'), 'sora.png', 400, 400) } })

  // はるは 3 人を、ほかの人どうしも少しフォローする
  for (const target of [umi, sora, kai]) await h!.call('PUT', `/api/users/${target.username}/follow`)
  await u!.call('PUT', `/api/users/${sora.username}/follow`)
  await s!.call('PUT', `/api/users/${umi.username}/follow`)
  await k!.call('PUT', `/api/users/${umi.username}/follow`)
  await k!.call('PUT', `/api/users/${haru.username}/follow`)

  // 古い順に作る（時刻はあとで DB でずらす）
  const post = async (who: NonNullable<typeof h>, body: string, images: { name: string, mimeType: string, buffer: Buffer }[] = []) => {
    // 同じ名前（images）の項目を複数送るため、FormData で渡す
    const form = new FormData()
    form.append('body', body)
    for (const image of images) form.append('images', new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), image.name)
    return who.call<Post>('POST', '/api/posts', { multipart: form })
  }
  const p1 = await post(s!, '数字を気にせずに書けるのがいい。今日は何も起きなかった、と書いてもいい場所。')
  const p2 = await post(k!, '今月撮った空。朝・昼・夕方・夜の 4 枚。', await Promise.all(skies.map((sky, i) => png(browser, sky, `sky${i + 1}.png`))))
  const p3 = await post(h!, '読みかけの本を持って、近所のカフェへ。今日は 3 章まで。')
  await h!.call('PATCH', `/api/posts/${p3.id}`, { data: { body: '読みかけの本を持って、近所のカフェへ。今日は 3 章まで読めた。' } })
  const p4 = await post(s!, '朝の湖。風がなくて、山がそのまま水に映っていた。', [await png(browser, lake, 'lake.png')])
  const p5 = await post(k!, '新しいキーボードが届いた。打ち心地が良くて、つい長い文章を書いてしまう。')
  const p6 = await post(u!, '週末は海へ。夕方の光がきれいだった。', [await png(browser, sunsetSea, 'sunset.png'), await png(browser, beach, 'beach.png')])

  for (const [who, ids] of [[h!, [p6, p4, p2]], [s!, [p6, p5, p3]], [k!, [p6, p4]], [u!, [p4, p2, p1]]] as const) {
    for (const p of ids) await who.call('PUT', `/api/posts/${p.id}/like`)
  }
  await s!.call('POST', `/api/posts/${p6.id}/comments`, { data: { body: 'いい色！ どこの海ですか？' } })
  await u!.call('POST', `/api/posts/${p6.id}/comments`, { data: { body: '電車で 1 時間くらいの海岸です。夕方がおすすめ。' } })
  await h!.call('POST', `/api/posts/${p6.id}/comments`, { data: { body: '行ってみたくなりました。' } })
  await k!.call('POST', `/api/posts/${p5.id}/comments`, { data: { body: '静かなキーですか？' } })

  // 投稿・コメントの時刻を、それらしい間隔にずらす
  const ago = [[p1, '1 day 2 hours'], [p2, '9 hours'], [p3, '5 hours'], [p4, '3 hours'], [p5, '1 hour 10 minutes'], [p6, '25 minutes']] as const
  sql(ago.map(([p, t]) => `UPDATE posts SET created_at = now() - interval '${t}' WHERE id = ${p.id};`).join(' ') +
    ` UPDATE posts SET edited_at = created_at + interval '20 minutes' WHERE id = ${p3.id};` +
    ` UPDATE comments SET created_at = now() - interval '18 minutes' WHERE post_id = ${p6.id} AND body LIKE 'いい色%';` +
    ` UPDATE comments SET created_at = now() - interval '12 minutes' WHERE post_id = ${p6.id} AND body LIKE '電車%';` +
    ` UPDATE comments SET created_at = now() - interval '5 minutes' WHERE post_id = ${p6.id} AND body LIKE '行って%';` +
    ` UPDATE comments SET created_at = now() - interval '40 minutes' WHERE post_id = ${p5.id};`)

  await Promise.all(users.map((x) => x.ctx.dispose()))
  return { umiPost: p6.id }
}

// 画面に見えている画像の読み込みが終わるまで待つ（署名付き URL で S3 から読む。画面の外の画像は遅れて読むので待たない）
async function imagesLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.images]
    .filter((img) => img.getBoundingClientRect().top < innerHeight)
    .every((img) => img.complete && img.naturalWidth > 0), undefined, { timeout: 30_000 })
  // 読み込んだ画像の描画と、表示の切り替わりを待つ
  await page.waitForTimeout(500)
}

async function login(browser: Browser, viewport: { width: number, height: number }, mobile = false): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE, viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('ユーザー ID').fill(haru.username)
  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('link', { name: '自分のプロフィール' })).toBeVisible()
  return page
}

const shot = (page: Page, name: string) => page.screenshot({ path: fileURLToPath(new URL(name, OUT)) })

test('README のスクリーンショット', async ({ browser }) => {
  await removeDemos()
  const { umiPost } = await seed(browser)

  const pc = await login(browser, { width: 1280, height: 900 })
  await expect(pc.getByRole('article')).toHaveCount(6)
  await imagesLoaded(pc)
  await shot(pc, 'timeline.png')

  await pc.goto(`/posts/${umiPost}`)
  await expect(pc.getByRole('listitem', { name: /のコメント$/ })).toHaveCount(3)
  await imagesLoaded(pc)
  await shot(pc, 'post-detail.png')

  await pc.goto(`/users/${umi.username}`)
  await expect(pc.getByRole('region', { name: 'プロフィール' })).toBeVisible()
  await imagesLoaded(pc)
  await shot(pc, 'profile.png')

  const mobile = await login(browser, { width: 375, height: 812 }, true)
  await expect(mobile.getByRole('article')).toHaveCount(6)
  await imagesLoaded(mobile)
  await shot(mobile, 'timeline-mobile.png')
})
