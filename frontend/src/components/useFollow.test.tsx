import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FollowResult } from '../api'
import { json, mockFetch } from '../test/fetchMock'
import { ToastProvider } from './ToastProvider'
import { useFollow } from './useFollow'

// フォローする・外す（F-1〜F-4、FN-07 3 章）。API の応答を待たずに状態を変える

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

// 返すのを止めておける応答。release() で返す
function deferred(result: FollowResult) {
  let resolve: ((res: Response) => void) | undefined
  const handler = () => new Promise<Response>((r) => {
    resolve = r
  })
  return { handler, release: () => resolve?.(json(200, result)) }
}

function renderFollow(followedByMe: boolean, onChange = vi.fn()) {
  const hook = renderHook(({ followed }) => useFollow('hanako', followed, onChange), {
    wrapper, initialProps: { followed: followedByMe },
  })
  return { ...hook, onChange }
}

describe('useFollow', () => {
  it('押すと応答を待たずにフォロー中にし、送り終わったら結果を渡す', async () => {
    const put = deferred({ following: true, followerCount: 8 })
    const fetch = mockFetch({ 'PUT /api/users/hanako/follow': put.handler })
    const { result, onChange } = renderFollow(false)

    act(() => void result.current.toggle())
    expect(result.current.following).toBe(true)
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => put.release())
    expect(onChange).toHaveBeenCalledWith({ following: true, followerCount: 8 })
    expect(fetch.keys()).toEqual(['PUT /api/users/hanako/follow'])
  })

  it('フォロー中なら外す（DELETE）', async () => {
    const fetch = mockFetch({ 'DELETE /api/users/hanako/follow': () => json(200, { following: false, followerCount: 7 }) })
    const { result, onChange } = renderFollow(true)
    await act(() => result.current.toggle())
    expect(onChange).toHaveBeenCalledWith({ following: false, followerCount: 7 })
    expect(fetch.keys()).toEqual(['DELETE /api/users/hanako/follow'])
  })

  it('送っている間に押した分はまとめ、最後に押した状態だけを送り直す', async () => {
    const put = deferred({ following: true, followerCount: 8 })
    const fetch = mockFetch({
      'PUT /api/users/hanako/follow': put.handler,
      'DELETE /api/users/hanako/follow': () => json(200, { following: false, followerCount: 7 }),
    })
    const { result, onChange } = renderFollow(false)

    // フォロー → 外す → フォロー → 外す（最後は外す）
    act(() => void result.current.toggle())
    act(() => void result.current.toggle())
    act(() => void result.current.toggle())
    act(() => void result.current.toggle())
    expect(result.current.following).toBe(false)

    await act(async () => put.release())
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(onChange).toHaveBeenCalledWith({ following: false, followerCount: 7 })
    expect(fetch.keys()).toEqual(['PUT /api/users/hanako/follow', 'DELETE /api/users/hanako/follow'])
  })

  it('送っている間に押して元の状態に戻したら、送り直さない', async () => {
    const put = deferred({ following: true, followerCount: 8 })
    const fetch = mockFetch({ 'PUT /api/users/hanako/follow': put.handler })
    const { result } = renderFollow(false)

    act(() => void result.current.toggle())
    act(() => void result.current.toggle())
    act(() => void result.current.toggle())
    await act(async () => put.release())

    expect(fetch.keys()).toEqual(['PUT /api/users/hanako/follow'])
  })

  it('失敗したら押す前の状態に戻して M-18 を出す', async () => {
    mockFetch({ 'PUT /api/users/hanako/follow': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    const { result, onChange } = renderFollow(false)
    await act(() => result.current.toggle())
    expect(result.current.following).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
  })

  it('相手がいなくなっていたら M-17 を出す', async () => {
    mockFetch({ 'PUT /api/users/hanako/follow': () => json(404, { code: 'USER_NOT_FOUND', message: '…' }) })
    const { result } = renderFollow(false)
    await act(() => result.current.toggle())
    expect(await screen.findByRole('status')).toHaveTextContent('このユーザーは見つかりません。')
  })

  it('送り終わった後は、呼んだ側の値（followedByMe）を出す', async () => {
    mockFetch({ 'PUT /api/users/hanako/follow': () => json(200, { following: true, followerCount: 8 }) })
    const { result, rerender } = renderFollow(false)
    await act(() => result.current.toggle())
    // 呼んだ側が onChange を受けて値を変えた
    rerender({ followed: true })
    expect(result.current.following).toBe(true)
    rerender({ followed: false })
    expect(result.current.following).toBe(false)
  })
})
