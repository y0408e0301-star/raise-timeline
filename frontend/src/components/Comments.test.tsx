import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CommentView } from '../api'
import { json, mockFetch, sentJson, type Handler } from '../test/fetchMock'
import { renderComponent } from '../test/render'
import Comments from './Comments'

// G-4 のコメントフォームと一覧（C-1〜C-6、画面設計書 7 章）。画面を通した流れは pages/comments.test.tsx

function comment(id: number, overrides: Partial<CommentView> = {}): CommentView {
  return {
    id,
    author: { username: 'hanako', displayName: 'はなこ', iconUrl: null },
    body: `コメント ${id}`,
    mine: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderComments(routes: Record<string, Handler | Handler[]>) {
  const fetch = mockFetch(routes)
  const onCountChange = vi.fn()
  renderComponent(<Comments postId={1} onCountChange={onCountChange} />)
  return { fetch, onCountChange }
}

const page = (items: CommentView[], nextCursor: string | null = null) => () => json(200, { items, nextCursor })
const bodies = () => within(screen.getByRole('list', { name: 'コメントの一覧' })).getAllByRole('listitem')
  .map((li) => li.lastChild?.lastChild?.textContent)

describe('Comments', () => {
  it('読み込む間は「読み込み中…」を出す', () => {
    renderComments({ 'GET /api/posts/1/comments': () => new Promise(() => {}) })
    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
  })

  // TC-05-3
  it('自分のコメントにだけ「削除」を出し、名前はその人の G-6 へのリンク', async () => {
    renderComments({ 'GET /api/posts/1/comments': page([comment(1), comment(2, { mine: true })]) })
    const items = await screen.findAllByRole('listitem', { name: 'はなこのコメント' })
    expect(items).toHaveLength(2)
    expect(within(items[0]).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    expect(within(items[1]).getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/users/hanako')
  })

  it('読み込みに失敗したら M-9 を出し、「再読み込み」で読み直す', async () => {
    renderComments({
      'GET /api/posts/1/comments': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), page([comment(1)])],
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(bodies()).toEqual(['コメント 1']))
  })

  it('「さらに表示」で続きを読み、続きの読み込みに失敗したら M-9 をトーストで出して今の一覧は残す', async () => {
    renderComments({
      'GET /api/posts/1/comments': page([comment(1)], '1'),
      'GET /api/posts/1/comments?cursor=1': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), page([comment(2)])],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'さらに表示' }))
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    expect(bodies()).toEqual(['コメント 1'])

    await userEvent.click(screen.getByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(bodies()).toEqual(['コメント 1', 'コメント 2']))
    expect(screen.queryByRole('button', { name: 'さらに表示' })).not.toBeInTheDocument()
  })

  it('コメントすると一番下に足し、コメント数を 1 増やしてもらう', async () => {
    const { onCountChange, fetch } = renderComments({
      'GET /api/posts/1/comments': page([comment(1)]),
      'POST /api/posts/1/comments': () => json(201, comment(2, { body: 'よい写真', mine: true })),
    })
    await screen.findByText('コメント 1')
    await userEvent.type(screen.getByRole('textbox', { name: 'コメントの本文' }), ' よい写真 ')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    await waitFor(() => expect(bodies()).toEqual(['コメント 1', 'よい写真']))
    expect(onCountChange).toHaveBeenCalledWith(1)
    expect(screen.getByRole('textbox', { name: 'コメントの本文' })).toHaveValue('')
    expect(sentJson(fetch, 1)).toEqual({ body: 'よい写真' })
  })

  it('空白だけ・281 文字ではコメントできない', async () => {
    renderComments({ 'GET /api/posts/1/comments': page([]) })
    const textbox = screen.getByRole('textbox', { name: 'コメントの本文' })
    const button = screen.getByRole('button', { name: 'コメントする' })
    expect(button).toBeDisabled()
    await userEvent.type(textbox, '   ')
    expect(button).toBeDisabled()
    await userEvent.clear(textbox)
    await userEvent.click(textbox)
    await userEvent.paste('あ'.repeat(281))
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it('削除すると確認ダイアログに M-15 を出し、消したらコメント数を 1 減らしてもらう', async () => {
    const { onCountChange } = renderComments({
      'GET /api/posts/1/comments': page([comment(1, { mine: true })]),
      'DELETE /api/comments/1': () => json(204),
    })
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    const dialog = screen.getByRole('alertdialog', { name: 'コメントを削除' })
    expect(dialog).toHaveAccessibleDescription('このコメントを削除しますか？')
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(screen.queryByText('コメント 1')).not.toBeInTheDocument())
    expect(onCountChange).toHaveBeenCalledWith(-1)
  })

  it('すでに削除されていたコメントは、メッセージを出さずに一覧から消す', async () => {
    const { onCountChange } = renderComments({
      'GET /api/posts/1/comments': page([comment(1, { mine: true })]),
      'DELETE /api/comments/1': () => json(404, { code: 'COMMENT_NOT_FOUND', message: '…' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: '削除' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(screen.queryByText('コメント 1')).not.toBeInTheDocument())
    expect(onCountChange).toHaveBeenCalledWith(-1)
    expect(screen.queryByText('操作に失敗しました。時間をおいてもう一度お試しください。')).not.toBeInTheDocument()
  })
})
