import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { UserSummary } from '../api'
import App from '../App'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// フォロー（FN-07）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'hana', displayName: 'はなこ', iconUrl: null }

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

function renderAt(path: string, routes: Record<string, Handler | Handler[]>) {
  const fetch = mockFetch({ 'GET /api/auth/me': () => json(200, me), ...routes })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

const page = (items: UserSummary[], nextCursor: string | null = null) => () => json(200, { items, nextCursor })

// 応答を返すまで待たせる API。resolve で返す
function deferred() {
  const pending: ((res: Response) => void)[] = []
  const handler: Handler = () => new Promise<Response>((resolve) => { pending.push(resolve) })
  return { handler, resolveNext: (res: Response) => pending.shift()?.(res), count: () => pending.length }
}

const row = (name: string) => screen.findByRole('listitem', { name })

let io: ReturnType<typeof mockIntersectionObserver>

beforeEach(() => {
  io = mockIntersectionObserver()
})

describe('フォローボタン（F-1〜F-4）', () => {
  it('「フォローする」を押すとすぐに「フォロー中」にして、PUT を送る', async () => {
    const put = deferred()
    const fetch = renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1)]),
      'PUT /api/users/user1/follow': put.handler,
    })
    await userEvent.click(within(await row('利用者 1')).getByRole('button', { name: 'フォローする' }))
    // 応答を待たずに変わる。押した直後は、マウスが乗ったままでも「フォロー中」
    const button = within(await row('利用者 1')).getByRole('button')
    expect(button).toHaveTextContent('フォロー中')
    expect(fetch.keys()).toContain('PUT /api/users/user1/follow')
    put.resolveNext(json(200, { following: true, followerCount: 3 }))
    // マウスを乗せ直すと「フォロー解除」
    await userEvent.unhover(button)
    await userEvent.hover(button)
    expect(button).toHaveTextContent('フォロー解除')
  })

  it('外した後にマウスを離してからフォローし直しても、「フォロー解除」のまま残らない', async () => {
    renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1, { followedByMe: true })]),
      'DELETE /api/users/user1/follow': () => json(200, { following: false, followerCount: 0 }),
      'PUT /api/users/user1/follow': () => json(200, { following: true, followerCount: 1 }),
    })
    const button = within(await row('利用者 1')).getByRole('button', { name: 'フォロー中' })
    await userEvent.click(button)
    await userEvent.unhover(button)
    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveTextContent('フォロー中'))
  })

  it('「フォロー中」にマウスを乗せると「フォロー解除」になり、押すと確認なしで外す', async () => {
    const fetch = renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1, { followedByMe: true })]),
      'DELETE /api/users/user1/follow': () => json(200, { following: false, followerCount: 0 }),
    })
    const button = within(await row('利用者 1')).getByRole('button', { name: 'フォロー中' })
    await userEvent.hover(button)
    expect(button).toHaveTextContent('フォロー解除')
    await userEvent.click(button)
    expect(within(await row('利用者 1')).getByRole('button')).toHaveTextContent('フォローする')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(fetch.keys()).toContain('DELETE /api/users/user1/follow'))
  })

  it('自分の行にはフォローボタンを出さない', async () => {
    renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1), user(2, { username: 'hana', displayName: 'はなこ', me: true })]),
    })
    expect(within(await row('利用者 1')).getByRole('button', { name: 'フォローする' })).toBeInTheDocument()
    expect(within(await row('はなこ')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('10 回素早く押しても、送っている間に押した分はまとめ、最後に押した状態だけを送る', async () => {
    const put = deferred()
    const fetch = renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1)]),
      'PUT /api/users/user1/follow': put.handler,
      'DELETE /api/users/user1/follow': () => json(200, { following: false, followerCount: 0 }),
    })
    const button = within(await row('利用者 1')).getByRole('button')
    for (let i = 0; i < 10; i++) await userEvent.click(button)
    // 10 回目は外した状態
    expect(button).toHaveTextContent('フォローする')
    expect(put.count()).toBe(1)
    put.resolveNext(json(200, { following: true, followerCount: 1 }))
    await waitFor(() => expect(fetch.keys().filter((k) => k.endsWith('/follow'))).toEqual([
      'PUT /api/users/user1/follow', 'DELETE /api/users/user1/follow',
    ]))
    await waitFor(() => expect(button).toHaveTextContent('フォローする'))
  })

  it('失敗したらボタンを元に戻して M-18 を出す', async () => {
    renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1)]),
      'PUT /api/users/user1/follow': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
    })
    await userEvent.click(within(await row('利用者 1')).getByRole('button', { name: 'フォローする' }))
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(within(await row('利用者 1')).getByRole('button')).toHaveTextContent('フォローする')
  })

  it('相手がいなくなっていたら元に戻して M-17 を出す', async () => {
    renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page([user(1)]),
      'PUT /api/users/user1/follow': () => json(404, { code: 'USER_NOT_FOUND', message: 'このユーザーは見つかりません。' }),
    })
    await userEvent.click(within(await row('利用者 1')).getByRole('button', { name: 'フォローする' }))
    expect(await screen.findByRole('status')).toHaveTextContent('このユーザーは見つかりません。')
    expect(within(await row('利用者 1')).getByRole('button')).toHaveTextContent('フォローする')
  })

  it('G-5 いいねした人の一覧でもフォローできる', async () => {
    const fetch = renderAt('/posts/1/likes', {
      'GET /api/posts/1/likes': () => json(200, { items: [user(1)], nextCursor: null, totalCount: 1 }),
      'PUT /api/users/user1/follow': () => json(200, { following: true, followerCount: 1 }),
    })
    await userEvent.click(within(await row('利用者 1')).getByRole('button', { name: 'フォローする' }))
    await waitFor(() => expect(fetch.keys()).toContain('PUT /api/users/user1/follow'))
    await userEvent.unhover(within(await row('利用者 1')).getByRole('button'))
    expect(within(await row('利用者 1')).getByRole('button')).toHaveTextContent('フォロー中')
  })
})

describe('フォロー中・フォロワーの一覧（G-8、F-6）', () => {
  it('タブを URL と合わせ、押すともう一方の一覧を出す。G-8 では自己紹介の 1 行目も出す', async () => {
    const fetch = renderAt('/users/taro_y/following', {
      'GET /api/users/taro_y/following': page([user(1, { bioFirstLine: '川沿いを散歩するのが好きです' })]),
      'GET /api/users/taro_y/followers': page([user(2), user(3)]),
    })
    expect(await screen.findByRole('heading', { name: '@taro_y' })).toBeInTheDocument()
    expect(await row('利用者 1')).toHaveTextContent('川沿いを散歩するのが好きです')
    expect(screen.getByRole('tab', { name: 'フォロー中' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: 'フォロワー' }))
    expect(screen.getByRole('tab', { name: 'フォロワー' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'フォロワー' })).getAllByRole('listitem'))
      .toHaveLength(2))
    expect(fetch.keys()).toContain('GET /api/users/taro_y/followers')
  })

  it('タブを素早く切り替えたとき、前のタブの遅れた応答は使わない', async () => {
    const following = deferred()
    renderAt('/users/taro_y/following', {
      'GET /api/users/taro_y/following': following.handler,
      'GET /api/users/taro_y/followers': page([user(2)]),
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'フォロワー' }))
    expect(await row('利用者 2')).toBeInTheDocument()
    following.resolveNext(json(200, { items: [user(1)], nextCursor: null }))
    await act(async () => {})
    expect(screen.queryByRole('listitem', { name: '利用者 1' })).not.toBeInTheDocument()
  })

  it('21 人いるとき、20 人を出し、一番下まで見ると残りの 1 人を出す', async () => {
    const fetch = renderAt('/users/taro_y/followers', {
      'GET /api/users/taro_y/followers': page(Array.from({ length: 20 }, (_, i) => user(21 - i)), 'c20'),
      'GET /api/users/taro_y/followers?cursor=c20': page([user(1)]),
    })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(20))
    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(21))
    expect(screen.getAllByRole('listitem')[20]).toHaveAccessibleName('利用者 1')
    expect(fetch.keys()).toContain('GET /api/users/taro_y/followers?cursor=c20')
  })

  it('0 件のときは、タブに合わせたことばを出す', async () => {
    renderAt('/users/taro_y/following', {
      'GET /api/users/taro_y/following': page([]),
      'GET /api/users/taro_y/followers': page([]),
    })
    expect(await screen.findByText('まだ誰もフォローしていません。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'フォロワー' }))
    expect(await screen.findByText('まだフォロワーはいません。')).toBeInTheDocument()
  })

  it('いないユーザーなら M-17 を出す', async () => {
    renderAt('/users/nobody/following', {
      'GET /api/users/nobody/following': () => json(404, { code: 'USER_NOT_FOUND', message: 'このユーザーは見つかりません。' }),
    })
    expect(await screen.findByText('このユーザーは見つかりません。')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出す', async () => {
    renderAt('/users/taro_y/following', {
      'GET /api/users/taro_y/following': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), page([user(1)])],
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await row('利用者 1')).toBeInTheDocument()
  })
})
