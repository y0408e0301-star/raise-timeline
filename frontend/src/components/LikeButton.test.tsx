import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PostView } from '../api'
import { json, mockFetch } from '../test/fetchMock'
import { post, renderComponent } from '../test/render'
import LikeButton from './LikeButton'

// 投稿カードの「♡」といいね数（L-1〜L-6、FN-06 3 章）。API の応答を待たずに画面を変える

function renderLike(target: PostView) {
  const onChange = vi.fn()
  const onDelete = vi.fn()
  renderComponent(<LikeButton post={target} onChange={onChange} onDelete={onDelete} />)
  return { onChange, onDelete }
}

const heart = () => screen.getByRole('button', { name: /いいね/ })
const count = () => screen.getByRole('link', { name: /いいね \d+ 件/ })

describe('LikeButton', () => {
  it('押すと応答を待たずに「♥」にして 1 増やし、返ってきた件数を投稿に入れる', async () => {
    let release: (() => void) | undefined
    mockFetch({
      'PUT /api/posts/1/like': () => new Promise((resolve) => {
        release = () => resolve(json(200, { liked: true, likeCount: 5 }))
      }),
    })
    const { onChange } = renderLike(post({ likeCount: 3 }))

    await userEvent.click(heart())
    expect(heart()).toHaveAccessibleName('いいねを取り消す')
    expect(heart()).toHaveAttribute('aria-pressed', 'true')
    expect(heart()).toHaveTextContent('♥')
    expect(count()).toHaveTextContent('4')

    await act(async () => release?.())
    // ほかの人のいいねも含めた最新の数
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 1, likedByMe: true, likeCount: 5 }))
  })

  it('いいねしていれば取り消して 1 減らす', async () => {
    let release: (() => void) | undefined
    mockFetch({
      'DELETE /api/posts/1/like': () => new Promise((resolve) => {
        release = () => resolve(json(200, { liked: false, likeCount: 2 }))
      }),
    })
    const { onChange } = renderLike(post({ likedByMe: true, likeCount: 3 }))
    await userEvent.click(heart())
    expect(heart()).toHaveTextContent('♡')
    expect(count()).toHaveTextContent('2')
    await act(async () => release?.())
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ likedByMe: false, likeCount: 2 }))
  })

  it('取り消しても 0 より小さくはしない（ほかの人が先に取り消していて件数がずれていたとき）', async () => {
    mockFetch({ 'DELETE /api/posts/1/like': () => new Promise(() => {}) })
    renderLike(post({ likedByMe: true, likeCount: 0 }))
    await userEvent.click(heart())
    expect(count()).toHaveAccessibleName('いいね 0 件')
  })

  it('いいね数は G-5 へのリンク', () => {
    renderLike(post({ id: 7, likeCount: 2 }))
    expect(screen.getByRole('link', { name: 'いいね 2 件' })).toHaveAttribute('href', '/posts/7/likes')
  })

  it('送っている間に押した分はまとめ、最後に押した状態だけを送り直す', async () => {
    let release: (() => void) | undefined
    const fetch = mockFetch({
      'PUT /api/posts/1/like': () => new Promise((resolve) => {
        release = () => resolve(json(200, { liked: true, likeCount: 1 }))
      }),
      'DELETE /api/posts/1/like': () => json(200, { liked: false, likeCount: 0 }),
    })
    const { onChange } = renderLike(post({ likeCount: 0 }))

    // いいね → 取り消し → いいね → 取り消し（最後は取り消し）
    for (let i = 0; i < 4; i++) await userEvent.click(heart())
    expect(count()).toHaveTextContent('0')

    await act(async () => release?.())
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ likedByMe: false, likeCount: 0 }))
    expect(fetch.keys()).toEqual(['PUT /api/posts/1/like', 'DELETE /api/posts/1/like'])
  })

  it('失敗したら押す前の「♡」と数に戻して M-18 を出す', async () => {
    mockFetch({ 'PUT /api/posts/1/like': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    const { onChange, onDelete } = renderLike(post({ likeCount: 3 }))
    await userEvent.click(heart())
    expect(await screen.findByText('操作に失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    expect(heart()).toHaveAccessibleName('いいねする')
    expect(count()).toHaveTextContent('3')
    expect(onChange).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('投稿が削除されていたら M-11 を出して投稿を消してもらう', async () => {
    mockFetch({ 'PUT /api/posts/1/like': () => json(404, { code: 'POST_NOT_FOUND', message: '…' }) })
    const { onDelete } = renderLike(post())
    await userEvent.click(heart())
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})
