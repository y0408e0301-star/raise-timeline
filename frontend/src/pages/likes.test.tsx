import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PostView, UserSummary } from '../api'
import App from '../App'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// いいね（FN-06）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'hana', displayName: 'はなこ', iconUrl: null }

function post(overrides: Partial<PostView> = {}): PostView {
  return {
    id: 1,
    author: { username: 'taro_y', displayName: 'たろう', iconUrl: null },
    body: '今日は晴れ',
    images: [],
    likeCount: 12,
    commentCount: 0,
    likedByMe: false,
    mine: false,
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...overrides,
  }
}

function user(i: number, overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    username: `user${i}`,
    displayName: `利用者 ${i}`,
    bioFirstLine: '',
    iconUrl: null,
    followedByMe: false,
    me: false,
    ...overrides,
  }
}

// G-3 の「フォロー中」に、渡した投稿を出す
function renderTimeline(posts: PostView[], routes: Record<string, Handler | Handler[]> = {}) {
  const fetch = mockFetch({
    'GET /api/auth/me': () => json(200, me),
    'GET /api/timeline?tab=following': () => json(200, { items: posts, nextCursor: null, followingCount: 1 }),
    ...routes,
  })
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
  return fetch
}

function renderAt(path: string, routes: Record<string, Handler | Handler[]>) {
  const fetch = mockFetch({ 'GET /api/auth/me': () => json(200, me), ...routes })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

const heart = () => screen.findByRole('button', { name: /いいね/ })
const count = () => screen.getByRole('link', { name: /^いいね \d+ 件$/ })

// 応答を返すまで待たせる API。resolve で返す
function deferred() {
  const pending: ((res: Response) => void)[] = []
  const handler: Handler = () => new Promise<Response>((resolve) => { pending.push(resolve) })
  return { handler, resolveNext: (res: Response) => pending.shift()?.(res), count: () => pending.length }
}

const likers = (items: UserSummary[], nextCursor: string | null, totalCount: number) => () =>
  json(200, { items, nextCursor, totalCount })

let io: ReturnType<typeof mockIntersectionObserver>

beforeEach(() => {
  io = mockIntersectionObserver()
})

describe('いいね・取り消し（L-1・L-2・L-6）', () => {
  it('押すとすぐに「♥」にして 1 増やし、返ってきた件数に合わせる', async () => {
    const put = deferred()
    renderTimeline([post()], { 'PUT /api/posts/1/like': put.handler })
    await userEvent.click(await heart())
    // 応答を待たずに変わる
    expect(await heart()).toHaveAccessibleName('いいねを取り消す')
    expect(await heart()).toHaveTextContent('♥')
    expect(count()).toHaveAccessibleName('いいね 13 件')
    // ほかの人のいいねも含めた最新の数に合わせる
    put.resolveNext(json(200, { liked: true, likeCount: 15 }))
    await waitFor(() => expect(count()).toHaveAccessibleName('いいね 15 件'))
    expect(await heart()).toHaveTextContent('♥')
  })

  it('いいねした投稿の「♥」を押すと取り消して「♡」に戻し、1 減らす', async () => {
    const fetch = renderTimeline([post({ likedByMe: true })], {
      'DELETE /api/posts/1/like': () => json(200, { liked: false, likeCount: 11 }),
    })
    await userEvent.click(await heart())
    expect(await heart()).toHaveTextContent('♡')
    expect(count()).toHaveAccessibleName('いいね 11 件')
    expect(fetch.keys()).toContain('DELETE /api/posts/1/like')
  })

  it('0 件のときも「0」と出す', async () => {
    renderTimeline([post({ likeCount: 0 })])
    await heart()
    expect(count()).toHaveTextContent('0')
  })

  it('10 回素早く押しても、送っている間に押した分はまとめ、最後に押した状態だけを送る', async () => {
    const put = deferred()
    const fetch = renderTimeline([post()], {
      'PUT /api/posts/1/like': put.handler,
      'DELETE /api/posts/1/like': () => json(200, { liked: false, likeCount: 12 }),
    })
    const button = await heart()
    for (let i = 0; i < 10; i++) await userEvent.click(button)
    // 押すたびに画面は変わり、10 回目は「♡」
    expect(button).toHaveTextContent('♡')
    expect(count()).toHaveAccessibleName('いいね 12 件')
    // 1 回目の PUT が終わってから、最後の状態（取り消し）だけを送る
    expect(put.count()).toBe(1)
    put.resolveNext(json(200, { liked: true, likeCount: 13 }))
    await waitFor(() => expect(fetch.keys().filter((k) => k.includes('/like'))).toEqual([
      'PUT /api/posts/1/like', 'DELETE /api/posts/1/like',
    ]))
    await waitFor(() => expect(count()).toHaveAccessibleName('いいね 12 件'))
    expect(button).toHaveTextContent('♡')
  })

  it('失敗したら「♡」と数を元に戻して M-18 を出す', async () => {
    renderTimeline([post()], { 'PUT /api/posts/1/like': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    await userEvent.click(await heart())
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(await heart()).toHaveTextContent('♡')
    expect(count()).toHaveAccessibleName('いいね 12 件')
  })

  it('API につながらないときも元に戻して M-18 を出す', async () => {
    renderTimeline([post()], { 'PUT /api/posts/1/like': () => Promise.reject(new TypeError('Failed to fetch')) })
    await userEvent.click(await heart())
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(await heart()).toHaveTextContent('♡')
    expect(count()).toHaveAccessibleName('いいね 12 件')
  })

  it('投稿が削除されていたら M-11 を出してカードを一覧から消す', async () => {
    renderTimeline([post(), post({ id: 2, body: '残る投稿' })], {
      'PUT /api/posts/1/like': () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' }),
    })
    await userEvent.click(within((await screen.findAllByRole('article'))[0]).getByRole('button', { name: 'いいねする' }))
    expect(await screen.findByRole('status')).toHaveTextContent('この投稿は削除されました。')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(screen.getByRole('article')).toHaveTextContent('残る投稿')
  })

  it('G-4 の投稿カードでもいいねできる', async () => {
    renderAt('/posts/1', {
      'GET /api/posts/1': () => json(200, post()),
      'GET /api/posts/1/comments': () => json(200, { items: [], nextCursor: null }),
      'PUT /api/posts/1/like': () => json(200, { liked: true, likeCount: 13 }),
    })
    await userEvent.click(await heart())
    await waitFor(() => expect(count()).toHaveAccessibleName('いいね 13 件'))
  })
})

describe('いいねした人の一覧（G-5、L-5）', () => {
  it('いいね数を押すと G-5 を開き、見出しに件数、新しい順に表示名と @ユーザー ID を出す', async () => {
    renderTimeline([post({ likeCount: 2 })], {
      'GET /api/posts/1/likes': likers([user(2), user(1, { me: true })], null, 2),
    })
    await heart()
    await userEvent.click(count())
    expect(await screen.findByRole('heading', { name: 'いいね 2 件' })).toBeInTheDocument()
    const rows = within(screen.getByRole('list', { name: 'いいねした人' })).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['利用者 2', '利用者 1'])
    expect(rows[0]).toHaveTextContent('@user2')
    // 「←」で G-3 に戻る
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('21 人いるとき、20 人を出し、一番下まで見ると残りの 1 人を出す', async () => {
    const fetch = renderAt('/posts/1/likes', {
      'GET /api/posts/1/likes': likers(Array.from({ length: 20 }, (_, i) => user(21 - i)), 'c20', 21),
      'GET /api/posts/1/likes?cursor=c20': likers([user(1)], null, 21),
    })
    expect(await screen.findByRole('heading', { name: 'いいね 21 件' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(20))
    act(() => io.scrollToBottom())
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(21))
    expect(screen.getAllByRole('listitem')[20]).toHaveAccessibleName('利用者 1')
    expect(fetch.keys()).toContain('GET /api/posts/1/likes?cursor=c20')
  })

  it('まだ誰もいいねしていなければ、そのことを出す', async () => {
    renderAt('/posts/1/likes', { 'GET /api/posts/1/likes': likers([], null, 0) })
    expect(await screen.findByText('まだ誰もいいねしていません。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'いいね 0 件' })).toBeInTheDocument()
  })

  it('投稿が削除されていたら M-11 を出す', async () => {
    renderAt('/posts/1/likes', {
      'GET /api/posts/1/likes': () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' }),
    })
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出す', async () => {
    renderAt('/posts/1/likes', {
      'GET /api/posts/1/likes': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), likers([user(1)], null, 1)],
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('listitem')).toHaveAccessibleName('利用者 1')
  })
})
