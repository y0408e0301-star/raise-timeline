import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { UserSummary } from '../api'
import App from '../App'
import { M, m16 } from '../messages'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// ユーザー検索（FN-08）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'hana', displayName: 'はなこ', iconUrl: null }

const user = (username: string, overrides: Partial<UserSummary> = {}): UserSummary => ({
  username, displayName: username, bioFirstLine: '', iconUrl: null, followedByMe: false, me: false, ...overrides,
})

const page = (items: UserSummary[], nextOffset: number | null = null) => () => json(200, { items, nextOffset })

const searchKey = (q: string, offset = 0) =>
  `GET /api/search/users?${new URLSearchParams(offset > 0 ? { q, offset: String(offset) } : { q })}`

function renderAt(path: string, routes: Record<string, Handler | Handler[]> = {}) {
  const fetch = mockFetch({
    'GET /api/auth/me': () => json(200, me),
    'GET /api/timeline?tab=following': () => json(200, { items: [], nextCursor: null }),
    ...routes,
  })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

const searchInput = () => screen.getByRole<HTMLInputElement>('searchbox', { name: 'ユーザーを検索する文字' })
const rows = () => within(screen.getByRole('list', { name: '検索結果' })).queryAllByRole('listitem')

let io: ReturnType<typeof mockIntersectionObserver>

beforeEach(() => {
  io = mockIntersectionObserver()
})

describe('ヘッダーの検索欄（S-1・S-2・S-5）', () => {
  it('入力して Enter キーで G-9 を開き、前後の空白を取って探す', async () => {
    const fetch = renderAt('/', { [searchKey('taro')]: page([user('taro')]) })
    await screen.findByRole('searchbox', { name: 'ユーザーを検索する文字' })
    expect(searchInput()).toHaveAttribute('placeholder', 'ユーザーを検索')
    await userEvent.type(searchInput(), '  taro {Enter}')

    expect(await screen.findByRole('heading', { name: '「taro」の検索結果' })).toBeInTheDocument()
    expect(fetch.keys()).toContain(searchKey('taro'))
    // G-9 では検索した文字を入れておく
    expect(searchInput()).toHaveValue('taro')
  })

  it('虫めがねのボタンでも検索できる', async () => {
    renderAt('/', { [searchKey('taro')]: page([]) })
    await screen.findByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await userEvent.type(searchInput(), 'taro')
    await userEvent.click(screen.getByRole('button', { name: '検索' }))
    expect(await screen.findByRole('heading', { name: '「taro」の検索結果' })).toBeInTheDocument()
  })

  it('空白だけのときは何もしない', async () => {
    const fetch = renderAt('/')
    await screen.findByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await userEvent.type(searchInput(), '   {Enter}')
    expect(fetch.keys().some((k) => k.includes('/api/search'))).toBe(false)
    expect(screen.queryByRole('heading', { name: /の検索結果/ })).not.toBeInTheDocument()
  })

  it('31 文字目以降は入力できない', async () => {
    renderAt('/')
    await screen.findByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await userEvent.type(searchInput(), 'a'.repeat(31))
    expect(searchInput()).toHaveValue('a'.repeat(30))
  })

  it('600px 未満の虫めがねのボタンを押すと、検索欄にフォーカスを移す', async () => {
    renderAt('/')
    await screen.findByRole('searchbox', { name: 'ユーザーを検索する文字' })
    await userEvent.click(screen.getByRole('button', { name: 'ユーザーを検索' }))
    expect(searchInput()).toHaveFocus()
    expect(screen.getByRole('button', { name: '検索を閉じる' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '検索を閉じる' }))
    expect(screen.queryByRole('button', { name: '検索を閉じる' })).not.toBeInTheDocument()
  })
})

describe('G-9 ユーザー検索の結果（S-6〜S-9）', () => {
  it('API の順に、表示名・@ユーザー ID・自己紹介の 1 行目を出す。自分の行にはフォローボタンを出さない', async () => {
    renderAt('/search?q=taro', {
      [searchKey('taro')]: page([
        user('taro', { displayName: 'たろう', bioFirstLine: '川沿いを散歩するのが好きです' }),
        user('taro_y', { displayName: 'たろう', followedByMe: true }),
        user('hana_taro', { displayName: 'はなこ', me: true }),
      ]),
    })
    await screen.findByText('川沿いを散歩するのが好きです')
    expect(rows().map((row) => within(row).getByText(/^@/).textContent)).toEqual(['@taro', '@taro_y', '@hana_taro'])
    expect(within(rows()[0]).getByRole('button', { name: 'フォローする' })).toBeInTheDocument()
    expect(within(rows()[1]).getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
    expect(within(rows()[2]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(rows()[0]).getByRole('link')).toHaveAttribute('href', '/users/taro')
  })

  // TC-08-6
  it('一致するユーザーがいないときは M-16 を出す', async () => {
    renderAt('/search?q=nobody', { [searchKey('nobody')]: page([]) })
    expect(await screen.findByText(m16('nobody'))).toBeInTheDocument()
  })

  it('一番下まで見たら次の 20 件を後ろに足す', async () => {
    const first = Array.from({ length: 20 }, (_, i) => user(`user${String(i).padStart(2, '0')}`))
    renderAt('/search?q=user', {
      [searchKey('user')]: page(first, 20),
      [searchKey('user', 20)]: page([user('user20')]),
    })
    await screen.findByText('@user19')
    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    expect(await screen.findByText('@user20')).toBeInTheDocument()
    expect(rows()).toHaveLength(21)
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出し、押すと読み直す', async () => {
    renderAt('/search?q=taro', {
      [searchKey('taro')]: [() => json(500, { code: 'INTERNAL_ERROR', message: M[18] }), page([user('taro')])],
    })
    expect(await screen.findByText(M[9])).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('@taro')).toBeInTheDocument()
  })

  it('G-9 で検索し直すと、新しい結果に入れ替える', async () => {
    renderAt('/search?q=taro', {
      [searchKey('taro')]: page([user('taro')]),
      [searchKey('hana')]: page([user('hanako')]),
    })
    await screen.findByText('@taro')
    await userEvent.clear(searchInput())
    await userEvent.type(searchInput(), 'hana{Enter}')
    expect(await screen.findByText('@hanako')).toBeInTheDocument()
    expect(screen.queryByText('@taro')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '「hana」の検索結果' })).toBeInTheDocument()
  })

  it('フォローすると、その行をフォロー中にする', async () => {
    renderAt('/search?q=taro', {
      [searchKey('taro')]: page([user('taro')]),
      'PUT /api/users/taro/follow': () => json(200, { following: true, followerCount: 1 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'フォローする' }))
    expect(await screen.findByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
  })
})
