import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostView, TimelinePage } from '../api'
import App from '../App'
import { M } from '../messages'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// タイムライン（FN-02）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

function post(id: number, overrides: Partial<PostView> = {}): PostView {
  return {
    id,
    author: { username: 'hanako', displayName: 'はなこ', iconUrl: null },
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

// ID が from から to まで（新しい順）の投稿
const posts = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => post(from - i))

const page = (items: PostView[], nextCursor: string | null = null, followingCount?: number): Handler =>
  () => json(200, { items, nextCursor, followingCount } satisfies TimelinePage)

const failed: Handler = () => json(500, { code: 'INTERNAL_ERROR', message: M[18] })

// 今の URL を見られるように出しておく
function CurrentUrl() {
  const location = useLocation()
  return <output aria-label="URL">{location.pathname + location.search}</output>
}

function renderAt(path: string, routes: Record<string, Handler | Handler[]>) {
  const fetch = mockFetch({ 'GET /api/auth/me': () => json(200, me), ...routes })
  render(<MemoryRouter initialEntries={[path]}><App /><CurrentUrl /></MemoryRouter>)
  return fetch
}

const url = () => screen.getByRole('status', { name: 'URL' }).textContent
const tab = (name: string) => screen.getByRole('tab', { name })
const bodies = () => screen.queryAllByRole('article')
  .map((a) => within(a).getByRole('link', { name: /投稿|本文/ }).textContent)

let io: ReturnType<typeof mockIntersectionObserver>

beforeEach(() => {
  localStorage.clear()
  io = mockIntersectionObserver()
})

describe('タブ（T-1・T-3・T-6）', () => {
  it('初めて開いたときは「フォロー中」を出し、URL を ?tab=following にする', async () => {
    renderAt('/', { 'GET /api/timeline?tab=following': page([post(1)], null, 1) })
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    expect(tab('フォロー中')).toHaveAttribute('aria-selected', 'true')
    expect(tab('すべて')).toHaveAttribute('aria-selected', 'false')
    await waitFor(() => expect(url()).toBe('/?tab=following'))
  })

  it('タブを押すとそのタブの最新 20 件を出し、選んだタブを記録して次に開いたときに出す', async () => {
    const fetch = renderAt('/', {
      'GET /api/timeline?tab=following': page([post(1)], null, 1),
      'GET /api/timeline?tab=all': page([post(3), post(2), post(1)]),
    })
    await screen.findByText('投稿 1')
    await userEvent.click(tab('すべて'))
    await waitFor(() => expect(bodies()).toEqual(['投稿 3', '投稿 2', '投稿 1']))
    expect(tab('すべて')).toHaveAttribute('aria-selected', 'true')
    expect(url()).toBe('/?tab=all')
    expect(localStorage.getItem('rt.tab')).toBe('all')
    expect(fetch.keys()).toContain('GET /api/timeline?tab=all')
  })

  // TC-02-5
  it('前回「すべて」を選んでいたら、?tab= のない URL で開いても「すべて」を出す', async () => {
    localStorage.setItem('rt.tab', 'all')
    renderAt('/', { 'GET /api/timeline?tab=all': page([post(1)]) })
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    expect(tab('すべて')).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(url()).toBe('/?tab=all'))
  })

  it('URL の ?tab= があればそれを出す', async () => {
    renderAt('/?tab=all', { 'GET /api/timeline?tab=all': page([post(1)]) })
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    expect(tab('すべて')).toHaveAttribute('aria-selected', 'true')
  })

  // TC-02-5
  it('localStorage が使えないブラウザでも「フォロー中」で動く', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('使えない') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('使えない') })
    renderAt('/', {
      'GET /api/timeline?tab=following': page([post(1)], null, 1),
      'GET /api/timeline?tab=all': page([post(2)]),
    })
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    await userEvent.click(tab('すべて'))
    expect(await screen.findByText('投稿 2')).toBeInTheDocument()
  })

  it('表示中のタブを押し直すと最新の 20 件から出し直す（ほかの人の新しい投稿が出る）', async () => {
    const fetch = renderAt('/', {
      'GET /api/timeline?tab=following': [page([post(1)], null, 1), page([post(2), post(1)], null, 1)],
    })
    await screen.findByText('投稿 1')
    await userEvent.click(tab('フォロー中'))
    await waitFor(() => expect(bodies()).toEqual(['投稿 2', '投稿 1']))
    expect(fetch.keys().filter((k) => k === 'GET /api/timeline?tab=following')).toHaveLength(2)
  })

  it('タブを素早く切り替えたら、前のタブの遅れた応答は使わない', async () => {
    let finish: ((res: Response) => void) | undefined
    renderAt('/', {
      'GET /api/timeline?tab=following': () => new Promise<Response>((resolve) => { finish = resolve }),
      'GET /api/timeline?tab=all': page([post(2)]),
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'すべて' }))
    await screen.findByText('投稿 2')
    await act(async () => finish?.(json(200, { items: [post(1)], nextCursor: null, followingCount: 1 })))
    expect(bodies()).toEqual(['投稿 2'])
  })
})

describe('一覧（T-2・T-4・T-8）', () => {
  it('一番下までスクロールすると次の 20 件を足し、最後まで読んだら「これ以上の投稿はありません」', async () => {
    let finish: ((res: Response) => void) | undefined
    renderAt('/?tab=all', {
      'GET /api/timeline?tab=all': page(posts(41, 22), '22'),
      'GET /api/timeline?tab=all&cursor=22': () => new Promise<Response>((resolve) => { finish = resolve }),
      'GET /api/timeline?tab=all&cursor=2': page([post(1)]),
    })
    await waitFor(() => expect(bodies()).toHaveLength(20))
    expect(screen.queryByText('これ以上の投稿はありません')).not.toBeInTheDocument()

    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    expect(await screen.findByText('読み込み中…')).toBeInTheDocument()
    await act(async () => finish?.(json(200, { items: posts(21, 2), nextCursor: '2' })))
    await waitFor(() => expect(bodies()).toHaveLength(40))
    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument()

    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    await waitFor(() => expect(bodies()).toHaveLength(41))
    expect(bodies()[40]).toBe('投稿 1')
    expect(screen.getByText('これ以上の投稿はありません')).toBeInTheDocument()
  })

  // TC-02-6
  it('「フォロー中」で、誰もフォローしておらず投稿もないときは M-8 と「すべて」タブを開くボタンを出す', async () => {
    renderAt('/', {
      'GET /api/timeline?tab=following': page([], null, 0),
      'GET /api/timeline?tab=all': page([post(1)]),
    })
    expect(await screen.findByText(M[8])).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '「すべて」タブを開く' }))
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    expect(tab('すべて')).toHaveAttribute('aria-selected', 'true')
  })

  it('フォローしている人はいるが投稿がないとき・「すべて」が 0 件のときは「まだ投稿がありません。」', async () => {
    renderAt('/', {
      'GET /api/timeline?tab=following': page([], null, 2),
      'GET /api/timeline?tab=all': page([]),
    })
    expect(await screen.findByText('まだ投稿がありません。')).toBeInTheDocument()
    expect(screen.queryByText(M[8])).not.toBeInTheDocument()
    await userEvent.click(tab('すべて'))
    expect(await screen.findByText('まだ投稿がありません。')).toBeInTheDocument()
  })

  it('最初の読み込みに失敗したら M-9 と「再読み込み」を出し、「再読み込み」でやり直す', async () => {
    renderAt('/?tab=all', { 'GET /api/timeline?tab=all': [failed, page([post(1)])] })
    expect(await screen.findByText(M[9])).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('投稿 1')).toBeInTheDocument()
    expect(screen.queryByText(M[9])).not.toBeInTheDocument()
  })

  it('続きの読み込みに失敗したら、出している投稿は残して続きだけをやり直す', async () => {
    const fetch = renderAt('/?tab=all', {
      'GET /api/timeline?tab=all': page(posts(21, 2), '2'),
      'GET /api/timeline?tab=all&cursor=2': [failed, page([post(1)])],
    })
    await waitFor(() => expect(bodies()).toHaveLength(20))
    await waitFor(() => expect(io.observing()).toBe(true))
    act(() => io.scrollToBottom())
    expect(await screen.findByText(M[9])).toBeInTheDocument()
    expect(bodies()).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(bodies()).toHaveLength(21))
    expect(fetch.keys().filter((k) => k === 'GET /api/timeline?tab=all')).toHaveLength(1)
  })
})

describe('投稿・編集・削除の反映（T-5、FN-02 5.3）', () => {
  it('投稿したら表示中のタブの一番上に足す（読み込み直さない）', async () => {
    const fetch = renderAt('/?tab=all', {
      'GET /api/timeline?tab=all': page([post(1)]),
      'POST /api/posts': () => json(201, post(2, { body: '新しい本文', author: me, mine: true })),
    })
    await screen.findByText('投稿 1')
    await userEvent.type(screen.getByRole('textbox', { name: '投稿の本文' }), '新しい本文')
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(bodies()).toEqual(['新しい本文', '投稿 1']))
    expect(fetch.keys().filter((k) => k.startsWith('GET /api/timeline'))).toHaveLength(1)
  })

  it('M-8 を出していても、投稿したらその投稿を出す', async () => {
    renderAt('/', {
      'GET /api/timeline?tab=following': page([], null, 0),
      'POST /api/posts': () => json(201, post(1, { body: '初めての投稿', author: me, mine: true })),
    })
    await screen.findByText(M[8])
    await userEvent.type(screen.getByRole('textbox', { name: '投稿の本文' }), '初めての投稿')
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(bodies()).toEqual(['初めての投稿']))
    expect(screen.queryByText(M[8])).not.toBeInTheDocument()
  })

  it('一覧の投稿を編集・削除すると一覧に反映する', async () => {
    renderAt('/?tab=all', {
      'GET /api/timeline?tab=all': page([post(2, { mine: true, author: me, body: '自分の本文' }), post(1)]),
      'PATCH /api/posts/2': () => json(200, post(2, { mine: true, author: me, body: '直した本文', editedAt: new Date().toISOString() })),
      'DELETE /api/posts/2': () => json(204),
    })
    await screen.findByText('自分の本文')
    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '編集' }))
    const editor = screen.getByRole('textbox', { name: '投稿の本文を編集' })
    await userEvent.clear(editor)
    await userEvent.type(editor, '直した本文')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => expect(bodies()).toEqual(['直した本文', '投稿 1']))

    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '削除' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(bodies()).toEqual(['投稿 1']))
  })
})
