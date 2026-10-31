import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PostView, Profile, UserSummary } from '../api'
import App from '../App'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// プロフィールの表示（FN-09 第 1 版）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'hana', displayName: 'はなこ', iconUrl: null }

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    username: 'Taro_Y',
    displayName: 'たろう',
    bio: '川沿いを散歩するのが好きです\n週末は写真を撮ります',
    iconUrl: null,
    joinedAt: '2026-09-30T15:00:00Z',
    followingCount: 12,
    followerCount: 8,
    postCount: 30,
    followedByMe: false,
    me: false,
    ...overrides,
  }
}

function post(id: number, overrides: Partial<PostView> = {}): PostView {
  return {
    id,
    author: { username: 'Taro_Y', displayName: 'たろう', iconUrl: null },
    body: `投稿 ${id}`,
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    mine: false,
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...overrides,
  }
}

const summary = (overrides: Partial<UserSummary> = {}): UserSummary => ({
  username: 'Taro_Y', displayName: 'たろう', bioFirstLine: '', iconUrl: null, followedByMe: false, me: false,
  ...overrides,
})

const posts = (items: PostView[], nextCursor: string | null = null) => () => json(200, { items, nextCursor })

function renderAt(path: string, routes: Record<string, Handler | Handler[]>) {
  const fetch = mockFetch({ 'GET /api/auth/me': () => json(200, me), ...routes })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

// 応答を返すまで待たせる API。resolve で返す
function deferred() {
  const pending: ((res: Response) => void)[] = []
  const handler: Handler = () => new Promise<Response>((resolve) => { pending.push(resolve) })
  return { handler, resolveNext: (res: Response) => pending.shift()?.(res) }
}

const notFound = () => json(404, { code: 'USER_NOT_FOUND', message: 'このユーザーは見つかりません。' })
const followerLink = () => screen.getByRole('link', { name: /フォロワー$/ })

let io: ReturnType<typeof mockIntersectionObserver>

beforeEach(() => {
  io = mockIntersectionObserver()
})

describe('プロフィール（G-6、PF-1・PF-3・PF-4）', () => {
  it('表示名・@ユーザー ID・自己紹介（改行のまま）・登録した年月・件数を出す', async () => {
    renderAt('/users/taro_y', {
      'GET /api/users/taro_y': () => json(200, profile()),
      'GET /api/users/taro_y/posts': posts([]),
    })
    expect(await screen.findByRole('heading', { name: 'たろう' })).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'プロフィール' })
    // URL の書き方ではなく、登録したときの書き方で出す
    expect(section).toHaveTextContent('@Taro_Y')
    expect(within(section).getByText(/川沿い/).textContent).toBe('川沿いを散歩するのが好きです\n週末は写真を撮ります')
    // 日本時間で 10 月 1 日
    expect(section).toHaveTextContent('2026年10月から利用')
    expect(screen.getByRole('link', { name: '12 フォロー' })).toHaveAttribute('href', '/users/Taro_Y/following')
    expect(followerLink()).toHaveAttribute('href', '/users/Taro_Y/followers')
    expect(section).toHaveTextContent('30 投稿')
  })

  it('ほかの人にはフォローボタンを出し、押すとすぐにフォロワー数を 1 増やし、返ってきた数に合わせる', async () => {
    const put = deferred()
    renderAt('/users/taro_y', {
      'GET /api/users/taro_y': () => json(200, profile()),
      'GET /api/users/taro_y/posts': posts([]),
      'PUT /api/users/Taro_Y/follow': put.handler,
    })
    await userEvent.click(await screen.findByRole('button', { name: 'フォローする' }))
    expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
    expect(followerLink()).toHaveAccessibleName('9 フォロワー')
    // ほかの人のフォローも含めた最新の数
    put.resolveNext(json(200, { following: true, followerCount: 11 }))
    await waitFor(() => expect(followerLink()).toHaveAccessibleName('11 フォロワー'))
  })

  it('外すとフォロワー数を 1 減らし、失敗したら元に戻して M-18 を出す', async () => {
    renderAt('/users/taro_y', {
      'GET /api/users/taro_y': () => json(200, profile({ followedByMe: true })),
      'GET /api/users/taro_y/posts': posts([]),
      'DELETE /api/users/Taro_Y/follow': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'フォロー中' }))
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
    expect(followerLink()).toHaveAccessibleName('8 フォロワー')
  })

  it('自分のプロフィールにはフォローボタンを出さない', async () => {
    renderAt('/users/hana', {
      'GET /api/users/hana': () => json(200, profile({ username: 'hana', displayName: 'はなこ', me: true })),
      'GET /api/users/hana/posts': posts([]),
    })
    expect(await screen.findByRole('heading', { name: 'はなこ' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'プロフィール' })).queryByRole('button')).not.toBeInTheDocument()
  })

  it('いないユーザー ID なら M-17 を出す', async () => {
    renderAt('/users/nobody', { 'GET /api/users/nobody': notFound, 'GET /api/users/nobody/posts': notFound })
    expect(await screen.findByText('このユーザーは見つかりません。')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'プロフィール' })).not.toBeInTheDocument()
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出す', async () => {
    renderAt('/users/taro_y', {
      'GET /api/users/taro_y': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), () => json(200, profile())],
      'GET /api/users/taro_y/posts': posts([]),
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('heading', { name: 'たろう' })).toBeInTheDocument()
  })
})

describe('その人の投稿の一覧（PF-2）', () => {
  it('新しい順に 20 件を出し、一番下まで見ると続きを出す', async () => {
    const fetch = renderAt('/users/taro_y', {
      'GET /api/users/taro_y': () => json(200, profile()),
      'GET /api/users/taro_y/posts': posts(Array.from({ length: 20 }, (_, i) => post(21 - i)), '2'),
      'GET /api/users/taro_y/posts?cursor=2': posts([post(1)]),
    })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(21))
    expect(screen.getAllByRole('article')[20]).toHaveTextContent('投稿 1')
    expect(fetch.keys()).toContain('GET /api/users/taro_y/posts?cursor=2')
    expect(await screen.findByText('これ以上の投稿はありません')).toBeInTheDocument()
  })

  it('投稿がなければ「まだ投稿がありません。」', async () => {
    renderAt('/users/taro_y', {
      'GET /api/users/taro_y': () => json(200, profile({ postCount: 0 })),
      'GET /api/users/taro_y/posts': posts([]),
    })
    expect(await screen.findByText('まだ投稿がありません。')).toBeInTheDocument()
  })

  it('自分の投稿を削除すると投稿数を 1 減らす', async () => {
    renderAt('/users/hana', {
      'GET /api/users/hana': () => json(200, profile({ username: 'hana', displayName: 'はなこ', me: true, postCount: 2 })),
      'GET /api/users/hana/posts': posts([post(2, { mine: true }), post(1, { mine: true })]),
      'DELETE /api/posts/2': () => json(204),
    })
    const first = (await screen.findAllByRole('article'))[0]
    await userEvent.click(within(first).getByRole('button', { name: 'メニュー' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '削除' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: '投稿を削除' })).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(screen.getByRole('region', { name: 'プロフィール' })).toHaveTextContent('1 投稿')
  })
})

describe('G-6 への移動', () => {
  const taroRoutes = {
    'GET /api/users/Taro_Y': () => json(200, profile()),
    'GET /api/users/Taro_Y/posts': posts([]),
  }

  it('投稿カードの投稿者名を押すと G-6', async () => {
    renderAt('/', {
      'GET /api/timeline?tab=following': () => json(200, { items: [post(1)], nextCursor: null, followingCount: 1 }),
      ...taroRoutes,
    })
    await userEvent.click(await screen.findByRole('link', { name: /@Taro_Y/ }))
    expect(await screen.findByRole('heading', { name: 'たろう' })).toBeInTheDocument()
  })

  it('ヘッダーの自分のアイコンを押すと自分の G-6', async () => {
    renderAt('/', {
      'GET /api/timeline?tab=following': () => json(200, { items: [], nextCursor: null, followingCount: 0 }),
      'GET /api/users/hana': () => json(200, profile({ username: 'hana', displayName: 'はなこ', me: true })),
      'GET /api/users/hana/posts': posts([]),
    })
    await userEvent.click(await screen.findByRole('link', { name: '自分のプロフィール' }))
    expect(await screen.findByRole('heading', { name: 'はなこ' })).toBeInTheDocument()
  })

  it('G-5 でフォローしてから行を押して G-6 を開くと「フォロー中」になっている', async () => {
    renderAt('/posts/1/likes', {
      'GET /api/posts/1/likes': () => json(200, { items: [summary()], nextCursor: null, totalCount: 1 }),
      'PUT /api/users/Taro_Y/follow': () => json(200, { following: true, followerCount: 9 }),
      'GET /api/users/Taro_Y': () => json(200, profile({ followedByMe: true, followerCount: 9 })),
      'GET /api/users/Taro_Y/posts': posts([]),
    })
    const row = await screen.findByRole('listitem', { name: 'たろう' })
    await userEvent.click(within(row).getByRole('button', { name: 'フォローする' }))
    await userEvent.click(within(row).getByRole('link'))
    expect(await screen.findByRole('heading', { name: 'たろう' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
    expect(followerLink()).toHaveAccessibleName('9 フォロワー')
  })

  // F-5
  it('フォロワー数から G-8 を開くと見出しは表示名で、「←」で G-6 に戻る', async () => {
    renderAt('/users/Taro_Y', {
      ...taroRoutes,
      'GET /api/users/Taro_Y/followers': () => json(200, { items: [], nextCursor: null }),
    })
    await userEvent.click(await screen.findByRole('link', { name: '8 フォロワー' }))
    expect(await screen.findByRole('heading', { name: 'たろう' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'フォロワー' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('region', { name: 'プロフィール' })).toBeInTheDocument()
  })

  it('G-8 を直接開いたときも、「←」で G-6 を開く', async () => {
    renderAt('/users/Taro_Y/following', {
      ...taroRoutes,
      'GET /api/users/Taro_Y/following': () => json(200, { items: [], nextCursor: null }),
    })
    await userEvent.click(await screen.findByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('region', { name: 'プロフィール' })).toBeInTheDocument()
  })
})
