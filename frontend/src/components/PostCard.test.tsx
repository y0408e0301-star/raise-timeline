import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PostView } from '../api'
import { json, mockFetch, sentJson } from '../test/fetchMock'
import { post, renderComponent } from '../test/render'
import PostCard from './PostCard'

// 投稿カード（画面設計書 3.7。G-3・G-4・G-6 で共通）と、編集（W-9・W-10）・削除（W-7・W-8）

// 編集中かどうかは並べている画面が持つので、テストでも同じように持つ
function Card({ initial, detail = false, onChange, onDelete }: {
  initial: PostView
  detail?: boolean
  onChange: (post: PostView) => void
  onDelete: (id: number) => void
}) {
  const [current, setCurrent] = useState(initial)
  const [editing, setEditing] = useState(false)
  return (
    <PostCard post={current} detail={detail} editing={editing} onEditingChange={setEditing}
      onChange={(next) => {
        setCurrent(next)
        onChange(next)
      }} onDelete={onDelete} />
  )
}

function renderCard(initial: PostView, detail = false) {
  const onChange = vi.fn()
  const onDelete = vi.fn()
  renderComponent(<Card initial={initial} detail={detail} onChange={onChange} onDelete={onDelete} />)
  return { card: screen.getByRole('article'), onChange, onDelete }
}

async function openMenu(item: '編集' | '削除') {
  await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
  await userEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('表示', () => {
  it('表示名・@ユーザー ID・経過時間・本文・件数を出し、名前はその人の G-6、本文は G-4 へのリンク', () => {
    const { card } = renderCard(post({
      id: 5, body: '今日は晴れ', likeCount: 2, commentCount: 3,
      createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    }))
    expect(card).toHaveAccessibleName('たろうの投稿')
    expect(within(card).getByRole('link', { name: 'たろう@taro_y' })).toHaveAttribute('href', '/users/taro_y')
    expect(within(card).getByText('· 3 分前')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: '今日は晴れ' })).toHaveAttribute('href', '/posts/5')
    expect(within(card).getByRole('link', { name: 'コメント 3 件' })).toHaveAttribute('href', '/posts/5')
    expect(within(card).getByRole('link', { name: 'いいね 2 件' })).toBeInTheDocument()
  })

  it('G-4 では本文とコメント数をリンクにしない', () => {
    const { card } = renderCard(post({ body: '今日は晴れ', commentCount: 3 }), true)
    expect(within(card).queryByRole('link', { name: '今日は晴れ' })).not.toBeInTheDocument()
    expect(within(card).getByText('今日は晴れ')).toBeInTheDocument()
    expect(within(card).getByLabelText('コメント 3 件')).not.toHaveAttribute('href')
  })

  it('編集した投稿には「（編集済み）」を出す', () => {
    renderCard(post({ editedAt: new Date().toISOString() }))
    expect(screen.getByText('（編集済み）')).toBeInTheDocument()
  })

  it('本文が空（画像だけの投稿）なら本文のリンクを出さない', () => {
    const { card } = renderCard(post({ id: 5, body: '' }))
    // G-4 へのリンクはコメント数だけ
    const toDetail = within(card).getAllByRole('link').filter((a) => a.getAttribute('href') === '/posts/5')
    expect(toDetail.map((a) => a.getAttribute('aria-label'))).toEqual(['コメント 0 件'])
  })

  it('ほかの人の投稿には「…」メニューを出さない', () => {
    renderCard(post({ mine: false }))
    expect(screen.queryByRole('button', { name: 'メニュー' })).not.toBeInTheDocument()
  })

  it('「…」メニューは外側を押す・Esc キーで閉じる', async () => {
    renderCard(post())
    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

const editor = () => screen.getByRole('textbox', { name: '投稿の本文を編集' })
const save = () => screen.getByRole('button', { name: /保存する|保存中…/ })

describe('編集', () => {
  it('今の本文を入れて開き、カーソルを末尾に置く。変えていなければ保存できない', async () => {
    renderCard(post({ body: '前の本文' }))
    await openMenu('編集')
    expect(editor()).toHaveValue('前の本文')
    expect(editor()).toHaveFocus()
    expect((editor() as HTMLTextAreaElement).selectionStart).toBe(4)
    expect(save()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'メニュー' })).not.toBeInTheDocument()
  })

  it('トリムした本文を保存して編集中の表示を閉じる', async () => {
    const fetch = mockFetch({ 'PATCH /api/posts/1': () => json(200, post({ body: '新しい本文', editedAt: new Date().toISOString() })) })
    const { onChange } = renderCard(post({ body: '前の本文' }))
    await openMenu('編集')
    await userEvent.clear(editor())
    await userEvent.type(editor(), ' 新しい本文 ')
    await userEvent.click(save())

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ body: '新しい本文' })))
    expect(sentJson(fetch)).toEqual({ body: '新しい本文' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('（編集済み）')).toBeInTheDocument()
  })

  it('Esc キー・「キャンセル」で変えずに閉じる', async () => {
    renderCard(post({ body: '前の本文' }))
    await openMenu('編集')
    await userEvent.type(editor(), '追記')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('前の本文')).toBeInTheDocument()

    await openMenu('編集')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('画像がなければ本文を空にして保存できない', async () => {
    renderCard(post({ body: '前の本文' }))
    await openMenu('編集')
    await userEvent.clear(editor())
    expect(save()).toBeDisabled()
  })

  it('画像のある投稿は本文を空にして保存できる', async () => {
    renderCard(post({ body: '前の本文', images: [{ id: 1, url: 'https://s3/a.png', expiresAt: '2999-01-01T00:00:00Z' }] }))
    await openMenu('編集')
    await userEvent.clear(editor())
    expect(save()).toBeEnabled()
  })

  it('失敗したら M-18 を出し、入力した本文を残す。削除されていたら M-11', async () => {
    mockFetch({
      'PATCH /api/posts/1': [
        () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
        () => json(404, { code: 'POST_NOT_FOUND', message: '…' }),
      ],
    })
    renderCard(post({ body: '前の本文' }))
    await openMenu('編集')
    await userEvent.type(editor(), '追記')
    await userEvent.click(save())
    expect(await screen.findByText('操作に失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    expect(editor()).toHaveValue('前の本文追記')

    await userEvent.click(save())
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
  })
})

describe('削除', () => {
  it('確認ダイアログに M-10 を出し、「削除」で投稿を消してもらう', async () => {
    const fetch = mockFetch({ 'DELETE /api/posts/1': () => json(204) })
    const { onDelete } = renderCard(post())
    await openMenu('削除')
    const dialog = screen.getByRole('alertdialog', { name: '投稿を削除' })
    expect(dialog).toHaveAccessibleDescription('この投稿を削除しますか？画像・コメント・いいねも削除され、元に戻せません。')
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1))
    expect(fetch.keys()).toEqual(['DELETE /api/posts/1'])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('「キャンセル」なら消さない', async () => {
    const fetch = mockFetch({})
    const { onDelete } = renderCard(post())
    await openMenu('削除')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    expect(fetch.keys()).toEqual([])
  })

  it('失敗したらダイアログを閉じて M-18 を出し、投稿は残す', async () => {
    mockFetch({ 'DELETE /api/posts/1': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    const { onDelete } = renderCard(post())
    await openMenu('削除')
    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(await screen.findByText('操作に失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('先に削除されていたら M-11 を出し、画面からも消す', async () => {
    mockFetch({ 'DELETE /api/posts/1': () => json(404, { code: 'POST_NOT_FOUND', message: '…' }) })
    const { onDelete } = renderCard(post())
    await openMenu('削除')
    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})
