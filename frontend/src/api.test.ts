import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError, changeIcon, createComment, createPost, deleteComment, deletePost, editPost, editProfile, ensureOk,
  fetchComments, fetchFollows, fetchLikers, fetchMe, fetchPost, fetchProfile, fetchTimeline, fetchUserPosts, followUser,
  isUsernameAvailable, likePost, login, logout, profileUrl, refreshImageUrls, removeIcon, searchUrl, searchUsers,
  setSessionExpiredHandler, signup, unfollowUser, unlikePost,
} from './api'
import { json, mockFetch, sentForm, sentJson } from './test/fetchMock'

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

  it('field がなければ null', async () => {
    await expect(ensureOk(json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' })))
      .rejects.toMatchObject({ code: 'POST_NOT_FOUND', field: null })
  })

  it('message が空・code が文字列でないときは M-18 と UNKNOWN', async () => {
    await expect(ensureOk(json(500, { code: 1, message: '' })))
      .rejects.toMatchObject({ status: 500, code: 'UNKNOWN', message: '操作に失敗しました。時間をおいてもう一度お試しください。' })
  })

  it('200 番台ならそのまま返す', async () => {
    const res = json(204)
    await expect(ensureOk(res)).resolves.toBe(res)
  })

  it('本文が JSON でないときは M-18', async () => {
    await expect(ensureOk(new Response('Bad Gateway', { status: 502 })))
      .rejects.toThrow('操作に失敗しました。時間をおいてもう一度お試しください。')
  })
})

describe('つながらないとき', () => {
  it('fetch が失敗したら NETWORK_ERROR の ApiError にして M-18 を出す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(fetchPost(1)).rejects.toMatchObject({
      status: 0, code: 'NETWORK_ERROR', message: '操作に失敗しました。時間をおいてもう一度お試しください。',
    })
  })
})

describe('CSRF', () => {
  it('GET 以外は Cookie の XSRF-TOKEN を X-XSRF-TOKEN ヘッダーで送り返す', async () => {
    document.cookie = 'XSRF-TOKEN=abc-123'
    const fetch = mockFetch({ 'POST /api/auth/login': () => json(200, me) })
    await login('taro_y', 'password1')
    expect(fetch.calls[0].init?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'abc-123', 'Content-Type': 'application/json' })
  })

  it('GET では送らない', async () => {
    document.cookie = 'XSRF-TOKEN=abc-123'
    const fetch = mockFetch({ 'GET /api/posts/1': () => json(200, {}) })
    await fetchPost(1)
    expect(fetch.calls[0].init?.headers).toEqual({})
  })

  it('Cookie の値は URL のエンコードを戻して送る', async () => {
    document.cookie = 'XSRF-TOKEN=a%2Bb%3D'
    const fetch = mockFetch({ 'DELETE /api/posts/1': () => json(204) })
    await deletePost(1)
    expect(fetch.calls[0].init?.headers).toEqual({ 'X-XSRF-TOKEN': 'a+b=' })
  })

  it('Cookie がなければ送らない', async () => {
    const fetch = mockFetch({ 'DELETE /api/posts/1': () => json(204) })
    await deletePost(1)
    expect(fetch.calls[0].init?.headers).toEqual({})
  })
})

// それぞれの API を、機能定義書 6 章の URL・メソッド・形で呼ぶか
const ok = (body: unknown = {}) => () => json(200, body)

describe('API の呼び出し方', () => {
  it('登録・ログインは JSON で送る', async () => {
    const fetch = mockFetch({ 'POST /api/auth/signup': ok(me), 'POST /api/auth/login': ok(me) })
    await signup('taro_y', 'たろう', 'password1')
    await login('taro_y', 'password1')
    expect(sentJson(fetch, 0)).toEqual({ username: 'taro_y', displayName: 'たろう', password: 'password1' })
    expect(sentJson(fetch, 1)).toEqual({ username: 'taro_y', password: 'password1' })
  })

  it('ユーザー ID が使えるかは、ユーザー ID を URL のエンコードをして聞く', async () => {
    mockFetch({ 'GET /api/auth/username-availability?username=a%26b%3Dc': ok({ available: false }) })
    await expect(isUsernameAvailable('a&b=c')).resolves.toBe(false)
  })

  it('投稿は multipart で、本文と画像を選んだ順に送り、Content-Type はブラウザに任せる', async () => {
    const fetch = mockFetch({ 'POST /api/posts': () => json(201, {}) })
    const a = new File(['a'], 'a.png', { type: 'image/png' })
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    await createPost('本文', [a, b])
    const body = sentForm(fetch)
    expect(body.get('body')).toBe('本文')
    expect(body.getAll('images').map((f) => (f as File).name)).toEqual(['a.png', 'b.jpg'])
    expect(fetch.calls[0].init?.headers).not.toHaveProperty('Content-Type')
  })

  it('画像がなければ本文だけを送る', async () => {
    const fetch = mockFetch({ 'POST /api/posts': () => json(201, {}) })
    await createPost('本文')
    expect(sentForm(fetch).getAll('images')).toEqual([])
  })

  it('投稿の詳細・編集・削除', async () => {
    const fetch = mockFetch({
      'GET /api/posts/5': ok(), 'PATCH /api/posts/5': ok(), 'DELETE /api/posts/5': () => json(204),
    })
    await fetchPost(5)
    await editPost(5, '新しい本文')
    await deletePost(5)
    expect(fetch.keys()).toEqual(['GET /api/posts/5', 'PATCH /api/posts/5', 'DELETE /api/posts/5'])
    expect(sentJson(fetch, 1)).toEqual({ body: '新しい本文' })
  })

  it('画像の URL の取り直しは ID の一覧を送り、items を返す', async () => {
    const items = [{ id: 1, url: 'https://s3/a.png', expiresAt: '2026-10-24T03:15:00Z' }]
    const fetch = mockFetch({ 'POST /api/images/urls': ok({ items }) })
    await expect(refreshImageUrls([1, 2])).resolves.toEqual(items)
    expect(sentJson(fetch)).toEqual({ imageIds: [1, 2] })
  })

  it('タイムラインは tab と、続きのときだけ cursor を送る', async () => {
    const fetch = mockFetch({
      'GET /api/timeline?tab=following': ok({ items: [], nextCursor: null }),
      'GET /api/timeline?tab=all&cursor=81': ok({ items: [], nextCursor: null }),
    })
    await fetchTimeline('following')
    await fetchTimeline('all', '81')
    expect(fetch.keys()).toHaveLength(2)
  })

  it('コメントの一覧・追加・削除', async () => {
    const fetch = mockFetch({
      'GET /api/posts/5/comments': ok({ items: [], nextCursor: null }),
      'GET /api/posts/5/comments?cursor=50': ok({ items: [], nextCursor: null }),
      'POST /api/posts/5/comments': () => json(201, {}),
      'DELETE /api/comments/9': () => json(204),
    })
    await fetchComments(5)
    await fetchComments(5, '50')
    await createComment(5, 'よい写真')
    await deleteComment(9)
    expect(sentJson(fetch, 2)).toEqual({ body: 'よい写真' })
  })

  it('いいねは PUT、取り消しは DELETE、一覧は cursor を送る', async () => {
    const fetch = mockFetch({
      'PUT /api/posts/5/like': ok({ liked: true, likeCount: 1 }),
      'DELETE /api/posts/5/like': ok({ liked: false, likeCount: 0 }),
      'GET /api/posts/5/likes?cursor=1000_2': ok({ items: [], nextCursor: null, totalCount: 0 }),
    })
    await expect(likePost(5)).resolves.toEqual({ liked: true, likeCount: 1 })
    await expect(unlikePost(5)).resolves.toEqual({ liked: false, likeCount: 0 })
    await fetchLikers(5, '1000_2')
    expect(fetch.keys()).toHaveLength(3)
  })

  it('フォローの API はユーザー ID を URL のエンコードをして入れる', async () => {
    const fetch = mockFetch({
      'PUT /api/users/a%2Fb/follow': ok({ following: true, followerCount: 1 }),
      'DELETE /api/users/a%2Fb/follow': ok({ following: false, followerCount: 0 }),
      'GET /api/users/a%2Fb/followers': ok({ items: [], nextCursor: null }),
      'GET /api/users/a%2Fb/following?cursor=1_2': ok({ items: [], nextCursor: null }),
    })
    await followUser('a/b')
    await unfollowUser('a/b')
    await fetchFollows('a/b', 'followers')
    await fetchFollows('a/b', 'following', '1_2')
    expect(fetch.keys()).toHaveLength(4)
  })

  it('プロフィールとその人の投稿', async () => {
    const fetch = mockFetch({
      'GET /api/users/hanako': ok(),
      'GET /api/users/hanako/posts': ok({ items: [], nextCursor: null }),
      'GET /api/users/hanako/posts?cursor=81': ok({ items: [], nextCursor: null }),
    })
    await fetchProfile('hanako')
    await fetchUserPosts('hanako')
    await fetchUserPosts('hanako', '81')
    expect(fetch.keys()).toHaveLength(3)
  })

  it('ユーザー検索は q と、0 より後のときだけ offset を送る', async () => {
    const fetch = mockFetch({
      'GET /api/search/users?q=%40taro+y': ok({ items: [], nextOffset: null }),
      'GET /api/search/users?q=taro&offset=20': ok({ items: [], nextOffset: null }),
    })
    await searchUsers('@taro y')
    await searchUsers('taro', 20)
    expect(fetch.keys()).toHaveLength(2)
  })

  it('プロフィールの編集は JSON、アイコンは multipart の icon で送る', async () => {
    const fetch = mockFetch({
      'PATCH /api/me/profile': ok(), 'PUT /api/me/icon': ok(), 'DELETE /api/me/icon': () => json(204),
    })
    await editProfile('たろう', 'よろしく')
    await changeIcon(new File(['x'], 'me.png', { type: 'image/png' }))
    await removeIcon()
    expect(sentJson(fetch, 0)).toEqual({ displayName: 'たろう', bio: 'よろしく' })
    expect(sentForm(fetch, 1).get('icon')).toBeInstanceOf(File)
    expect(fetch.keys()[2]).toBe('DELETE /api/me/icon')
  })

  it('画面の URL を作る', () => {
    expect(profileUrl('taro_y')).toBe('/users/taro_y')
    expect(profileUrl('a/b')).toBe('/users/a%2Fb')
    expect(searchUrl('たろう 1')).toBe('/search?q=%E3%81%9F%E3%82%8D%E3%81%86+1')
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

  it('取り直しの通信が失敗しても、取り直しに失敗したものとして扱う', async () => {
    const expiredHandler = vi.fn()
    setSessionExpiredHandler(expiredHandler)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/refresh') throw new TypeError('Failed to fetch')
      return expired()
    }))
    await expect(fetchPost(1)).rejects.toMatchObject({ status: 401 })
    expect(expiredHandler).toHaveBeenCalledOnce()
  })

  it('取り直しに成功してもやり直した API が失敗したら、そのエラーを返す', async () => {
    mockFetch({
      'GET /api/posts/1': [expired, () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' })],
      'POST /api/auth/refresh': () => json(200, me),
    })
    await expect(fetchPost(1)).rejects.toMatchObject({ status: 404, code: 'POST_NOT_FOUND' })
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

  it('画面を開いたときの 401 以外の失敗は、そのまま投げる', async () => {
    mockFetch({ 'GET /api/auth/me': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    await expect(fetchMe()).rejects.toMatchObject({ status: 500 })
  })

  it('ログインの 401 では取り直さない', async () => {
    const fetch = mockFetch({
      'POST /api/auth/login': () => json(401, { code: 'LOGIN_FAILED', message: 'ユーザー ID かパスワードが違います。' }),
    })
    await expect(login('taro_y', 'wrong')).rejects.toThrow('ユーザー ID かパスワードが違います。')
    expect(fetch.keys()).toEqual(['POST /api/auth/login'])
  })

  it('登録の 401 でも取り直さない', async () => {
    const fetch = mockFetch({
      'POST /api/auth/signup': () => json(401, { code: 'UNAUTHENTICATED', message: '…' }),
    })
    await expect(signup('taro_y', 'たろう', 'password1')).rejects.toMatchObject({ status: 401 })
    expect(fetch.keys()).toEqual(['POST /api/auth/signup'])
  })
})
