import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { CommentView, PostView } from '../api'
import App from '../App'
import { json, mockFetch, type Handler } from '../test/fetchMock'

// コメント（FN-05）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'hana', displayName: 'はなこ', iconUrl: null }

function post(overrides: Partial<PostView> = {}): PostView {
  return {
    id: 1,
    author: { username: 'taro_y', displayName: 'たろう', iconUrl: null },
    body: '今日は晴れ',
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

function comment(id: number, overrides: Partial<CommentView> = {}): CommentView {
  return {
    id,
    author: { username: 'jiro', displayName: 'じろう', iconUrl: null },
    body: `コメント ${id}`,
    mine: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const mine = (id: number, body: string) =>
  comment(id, { body, mine: true, author: { username: 'hana', displayName: 'はなこ', iconUrl: null } })

const page = (items: CommentView[], nextCursor: string | null = null) => () => json(200, { items, nextCursor })

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => comment(from + i))

// G-4 を開く。投稿のコメント数は commentCount
function renderPost(routes: Record<string, Handler | Handler[]>, commentCount = 0) {
  const fetch = mockFetch({
    'GET /api/auth/me': () => json(200, me),
    'GET /api/posts/1': () => json(200, post({ commentCount })),
    ...routes,
  })
  render(<MemoryRouter initialEntries={['/posts/1']}><App /></MemoryRouter>)
  return fetch
}

const textbox = () => screen.findByRole('textbox', { name: 'コメントの本文' })
const submitButton = () => screen.getByRole('button', { name: 'コメントする' })
const commentCount = () => screen.getByRole('article').querySelector('[aria-label^="コメント"]')
const shownComments = () =>
  within(screen.getByRole('list', { name: 'コメントの一覧' })).queryAllByRole('listitem').map((li) =>
    li.lastElementChild?.lastElementChild?.textContent)

describe('一覧（C-3・C-4・C-6）', () => {
  it('古い順に表示名・@ユーザー ID・本文を出す。自分のコメントにだけ「削除」を出す', async () => {
    renderPost({ 'GET /api/posts/1/comments': page([comment(1), mine(2, 'はなこのコメント')]) }, 2)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('じろう@jiro')
    expect(items[0]).toHaveTextContent('コメント 1')
    expect(within(items[0]).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    expect(within(items[1]).getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(commentCount()).toHaveAccessibleName('コメント 2 件')
  })

  // TC-05-2
  it('51 件あるとき、最初は 50 件と「さらに表示」を出し、押すと 51 件目を出して「さらに表示」を消す', async () => {
    const fetch = renderPost({
      'GET /api/posts/1/comments': page(range(1, 50), '50'),
      'GET /api/posts/1/comments?cursor=50': page([comment(51)]),
    }, 51)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(50))
    await userEvent.click(screen.getByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(51))
    expect(screen.getAllByRole('listitem')[50]).toHaveTextContent('コメント 51')
    expect(screen.queryByRole('button', { name: 'さらに表示' })).not.toBeInTheDocument()
    expect(fetch.keys()).toContain('GET /api/posts/1/comments?cursor=50')
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出す', async () => {
    renderPost({
      'GET /api/posts/1/comments': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), page([comment(1)])],
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('コメント 1')).toBeInTheDocument()
  })
})

describe('コメントする（C-1・C-2）', () => {
  it('一覧の一番下に足し、フォームを空にして、コメント数を 1 増やす', async () => {
    const fetch = renderPost({
      'GET /api/posts/1/comments': page([comment(1)]),
      'POST /api/posts/1/comments': () => json(201, mine(2, 'いい天気ですね')),
    }, 1)
    await userEvent.type(await textbox(), '  いい天気ですね ')
    await userEvent.click(submitButton())
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('いい天気ですね')
    expect(await textbox()).toHaveValue('')
    expect(commentCount()).toHaveAccessibleName('コメント 2 件')
    // 本文はトリムして送る
    const sent = fetch.calls.find((c) => c.key === 'POST /api/posts/1/comments')?.init?.body
    expect(JSON.parse(String(sent))).toEqual({ body: 'いい天気ですね' })
  })

  // TC-05-1
  it('280 文字はコメントでき、281 文字・空白だけは押せない', async () => {
    renderPost({ 'GET /api/posts/1/comments': page([]) })
    await textbox()
    expect(submitButton()).toBeDisabled()
    await userEvent.type(await textbox(), '   ')
    expect(submitButton()).toBeDisabled()
    await userEvent.clear(await textbox())
    await userEvent.click(await textbox())
    await userEvent.paste('あ'.repeat(280))
    expect(screen.getByText('残り 0')).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
    await userEvent.paste('あ')
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('まだ読んでいない続きがあるときにコメントしても、続きを読んだときに重ねて出さない', async () => {
    renderPost({
      'GET /api/posts/1/comments': page(range(1, 50), '50'),
      'POST /api/posts/1/comments': () => json(201, mine(52, '自分のコメント')),
      'GET /api/posts/1/comments?cursor=50': page([comment(51), mine(52, '自分のコメント')]),
    }, 51)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(50))
    await userEvent.type(await textbox(), '自分のコメント')
    await userEvent.click(submitButton())
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(51))
    expect(screen.getAllByRole('listitem')[50]).toHaveTextContent('自分のコメント')
    await userEvent.click(screen.getByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(52))
    expect(shownComments().slice(-2)).toEqual(['コメント 51', '自分のコメント'])
  })

  // TC-05-6
  it('コメントを書いている間に投稿が削除されたら M-11 を出し、入力した本文を残す', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([]),
      'POST /api/posts/1/comments': () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' }),
    })
    await userEvent.type(await textbox(), 'こんにちは')
    await userEvent.click(submitButton())
    expect(await screen.findByRole('status')).toHaveTextContent('この投稿は削除されました。')
    expect(await textbox()).toHaveValue('こんにちは')
  })

  it('失敗したら M-18 を出し、入力した本文を残す', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([]),
      'POST /api/posts/1/comments': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
    })
    await userEvent.type(await textbox(), 'こんにちは')
    await userEvent.click(submitButton())
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(await textbox()).toHaveValue('こんにちは')
    expect(commentCount()).toHaveAccessibleName('コメント 0 件')
  })

  it('Ctrl＋Enter でコメントする', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([]),
      'POST /api/posts/1/comments': () => json(201, mine(1, 'ショートカット')),
    })
    await userEvent.type(await textbox(), 'ショートカット')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByText('ショートカット', { selector: 'div' })).toBeInTheDocument()
  })
})

describe('削除（C-5）', () => {
  // N-19
  it('確認ダイアログに M-15 を出し、「削除」で一覧から消してコメント数を 1 減らす', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([comment(1), mine(2, '消すコメント')]),
      'DELETE /api/comments/2': () => json(204),
    }, 2)
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    const dialog = screen.getByRole('alertdialog', { name: 'コメントを削除' })
    expect(dialog).toHaveTextContent('このコメントを削除しますか？')
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(commentCount()).toHaveAccessibleName('コメント 1 件')
  })

  it('すでに削除されていたら、メッセージを出さずに一覧から消す', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([mine(2, '消すコメント')]),
      'DELETE /api/comments/2': () => json(404, { code: 'COMMENT_NOT_FOUND', message: '…' }),
    }, 1)
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('失敗したらダイアログを閉じて M-18 を出し、コメントは残す', async () => {
    renderPost({
      'GET /api/posts/1/comments': page([mine(2, '消すコメント')]),
      'DELETE /api/comments/2': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
    }, 1)
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }))
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(commentCount()).toHaveAccessibleName('コメント 1 件')
  })
})
