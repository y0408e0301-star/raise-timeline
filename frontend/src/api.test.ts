import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ensureOk, fetchMe, isUsernameAvailable, login, logout, setSessionExpiredHandler } from './api'
import { json, mockFetch } from './test/fetchMock'

const me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

const expired = () => json(401, { code: 'TOKEN_EXPIRED', message: '…' })

afterEach(() => {
  setSessionExpiredHandler(() => {})
  document.cookie = 'XSRF-TOKEN=; max-age=0'
})

describe('ensureOk', () => {
  it('API のエラーの code・message・field を持つ', async () => {
    const error = await ensureOk(json(409, { code: 'USERNAME_TAKEN', message: 'このユーザー ID は使われています。', field: 'username' }))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'USERNAME_TAKEN', message: 'このユーザー ID は使われています。', field: 'username' })
  })

  it('本文が JSON でないときは M-18', async () => {
    await expect(ensureOk(new Response('Bad Gateway', { status: 502 })))
      .rejects.toThrow('操作に失敗しました。時間をおいてもう一度お試しください。')
  })
})

describe('CSRF', () => {
  it('GET 以外は Cookie の XSRF-TOKEN を X-XSRF-TOKEN ヘッダーで送り返す', async () => {
    document.cookie = 'XSRF-TOKEN=abc-123'
    const fetch = mockFetch({ 'POST /api/auth/login': () => json(200, me) })
    await login('taro_y', 'password1')
    expect(fetch.calls[0].init?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'abc-123', 'Content-Type': 'application/json' })
  })
})

describe('JWT の取り直し', () => {
  it('401 なら取り直して 1 回だけやり直す', async () => {
    const fetch = mockFetch({
      'GET /api/auth/me': [expired, () => json(200, me)],
      'POST /api/auth/refresh': () => json(200, me),
    })
    await expect(fetchMe()).resolves.toEqual(me)
    expect(fetch.keys()).toEqual(['GET /api/auth/me', 'POST /api/auth/refresh', 'GET /api/auth/me'])
  })

  it('access_token の Cookie が消えていて UNAUTHENTICATED のときも取り直す', async () => {
    const fetch = mockFetch({
      'GET /api/auth/me': [() => json(401, { code: 'UNAUTHENTICATED', message: '…' }), () => json(200, me)],
      'POST /api/auth/refresh': () => json(200, me),
    })
    await expect(fetchMe()).resolves.toEqual(me)
    expect(fetch.keys()).toContain('POST /api/auth/refresh')
  })

  it('同時に 401 になっても、取り直しは 1 回だけ', async () => {
    const fetch = mockFetch({
      'GET /api/auth/me': [expired, expired, () => json(200, me)],
      'POST /api/auth/refresh': async () => {
        await new Promise((r) => setTimeout(r, 10))
        return json(200, me)
      },
    })
    await Promise.all([fetchMe(), fetchMe()])
    expect(fetch.keys().filter((k) => k === 'POST /api/auth/refresh')).toHaveLength(1)
  })

  it('取り直しが終わった後に 401 が返ってきた API も、取り直さずにやり直す', async () => {
    let releaseSlow: (() => void) | undefined
    const fetch = mockFetch({
      // 1 回目はすぐ 401、2 回目は取り直しが終わるまで 401 を返さない
      'GET /api/auth/me': [
        expired,
        () => new Promise<Response>((resolve) => {
          releaseSlow = () => resolve(expired())
        }),
        () => json(200, me),
      ],
      'POST /api/auth/refresh': () => json(200, me),
    })
    const first = fetchMe()
    const second = fetchMe()
    await expect(first).resolves.toEqual(me)
    releaseSlow?.()
    await expect(second).resolves.toEqual(me)
    expect(fetch.keys().filter((k) => k === 'POST /api/auth/refresh')).toHaveLength(1)
  })

  it('取り直しに失敗したら、M-19 を出す処理を呼ぶ', async () => {
    const expiredHandler = vi.fn()
    setSessionExpiredHandler(expiredHandler)
    mockFetch({
      'GET /api/auth/username-availability?username=taro_y': expired,
      'POST /api/auth/refresh': () => json(401, { code: 'REFRESH_FAILED', message: '…' }),
    })
    await expect(isUsernameAvailable('taro_y')).rejects.toMatchObject({ status: 401 })
    expect(expiredHandler).toHaveBeenCalledOnce()
  })

  it('画面を開いたとき・ログアウトのときは、取り直しに失敗しても M-19 を出さない', async () => {
    const expiredHandler = vi.fn()
    setSessionExpiredHandler(expiredHandler)
    mockFetch({
      'POST /api/auth/logout': expired,
      'POST /api/auth/refresh': () => json(401, { code: 'REFRESH_FAILED', message: '…' }),
      'GET /api/auth/me': expired,
    })
    await expect(fetchMe()).resolves.toBeNull()
    await expect(logout()).rejects.toBeInstanceOf(ApiError)
    expect(expiredHandler).not.toHaveBeenCalled()
  })

  it('ログインの 401 では取り直さない', async () => {
    const fetch = mockFetch({
      'POST /api/auth/login': () => json(401, { code: 'LOGIN_FAILED', message: 'ユーザー ID かパスワードが違います。' }),
    })
    await expect(login('taro_y', 'wrong')).rejects.toThrow('ユーザー ID かパスワードが違います。')
    expect(fetch.keys()).toEqual(['POST /api/auth/login'])
  })
})
