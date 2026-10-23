import { M } from './messages'

// ログインしている自分（GET /api/auth/me などが返す）
export type Me = {
  username: string
  displayName: string
  iconUrl: string | null
}

// API がエラーを返したとき（機能定義書 3.3）。message は画面にそのまま出せる文、
// field があればその入力欄の下に出す
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field: string | null

  constructor(status: number, code: string, message: string, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

// 200 番台以外なら ApiError にする。本文が API のエラーの形でなければ（API サーバーが止まっているなど）M-18 を出す
export async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res
  let body: { code?: unknown, message?: unknown, field?: unknown } = {}
  try {
    body = await res.json()
  } catch {
    // 本文が JSON でない
  }
  const code = typeof body.code === 'string' ? body.code : 'UNKNOWN'
  const message = typeof body.message === 'string' && body.message ? body.message : M[18]
  throw new ApiError(res.status, code, message, typeof body.field === 'string' ? body.field : null)
}

// ---------------------------------------------------------------- JWT の取り直し（機能定義書 FN-01 3.3）

let onSessionExpired: () => void = () => {}

// 取り直しに失敗したとき（14 日たった・ログアウトした）に呼ぶ処理を決める。画面は M-19 を出して G-1 に移す
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

let refreshing: Promise<boolean> | null = null

// 取り直しに成功した回数。API を送ったときの値と比べて、送った後に取り直しが済んだかを知る
let refreshed = 0

// 同時に複数の API が 401 になっても、取り直しは 1 回だけにする。
// 2 回送ると、2 回目は無効にしたリフレッシュトークンを使ったことになり、全部のログインが切れるため
function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: csrfHeader() })
    .then((res) => res.ok, () => false)
    .then((ok) => {
      if (ok) refreshed++
      return ok
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// 取り直しを試さない API。ログイン・登録の 401 はパスワードの間違いなどで、取り直しでは直らない
const NO_REFRESH = ['/api/auth/login', '/api/auth/signup', '/api/auth/refresh']

// ---------------------------------------------------------------- 呼び出し

// Cookie の XSRF-TOKEN を X-XSRF-TOKEN ヘッダーで送り返す（CSRF 対策。機能定義書 3.2）
function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)
  return token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}
}

// body が FormData なら multipart/form-data（画像と一緒に送る投稿）、それ以外は JSON で送る
async function call(method: string, url: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = method === 'GET' ? {} : csrfHeader()
  const isForm = body instanceof FormData
  // multipart の境界の文字列はブラウザが付けるので、FormData のときは Content-Type を決めない
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    // つながらない
    throw new ApiError(0, 'NETWORK_ERROR', M[18])
  }
}

// API を呼ぶ。ログインの 401 のときは JWT を取り直して 1 回だけやり直す。
// access_token の Cookie は JWT と同じ 15 分で消えるので、期限切れでも TOKEN_EXPIRED ではなく
// UNAUTHENTICATED（Cookie がない）が返ることがある。そのため 401 ならどちらでも取り直しを試す。
// notifyExpired が false なら、取り直しに失敗しても M-19 を出さない
async function request(method: string, url: string, body?: unknown, notifyExpired = true): Promise<Response> {
  const sentAt = refreshed
  const res = await call(method, url, body)
  if (res.status !== 401 || NO_REFRESH.includes(url)) return ensureOk(res)
  // 送った後に、ほかの API の 401 で取り直しが済んでいたら、取り直さずにやり直す
  if (refreshed === sentAt && !(await refreshOnce())) {
    if (notifyExpired) onSessionExpired()
    return ensureOk(res)
  }
  return ensureOk(await call(method, url, body))
}

async function requestJson<T>(method: string, url: string, body?: unknown, notifyExpired = true): Promise<T> {
  const res = await request(method, url, body, notifyExpired)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------- FN-01 ユーザー登録・ログイン

// ログインしている自分。ログインしていなければ（取り直しにも失敗したら）null
// 画面を開いたときに呼ぶ。もともとログインしていない人もいるので M-19 は出さない
export async function fetchMe(): Promise<Me | null> {
  try {
    return await requestJson<Me>('GET', '/api/auth/me', undefined, false)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

// ユーザー ID が使えるか（入力欄から離れたとき）
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const res = await requestJson<{ available: boolean }>(
    'GET', `/api/auth/username-availability?username=${encodeURIComponent(username)}`)
  return res.available
}

export function signup(username: string, displayName: string, password: string): Promise<Me> {
  return requestJson<Me>('POST', '/api/auth/signup', { username, displayName, password })
}

export function login(username: string, password: string): Promise<Me> {
  return requestJson<Me>('POST', '/api/auth/login', { username, password })
}

// ログアウトする。ログインが切れていても G-1 に戻るだけなので M-19 は出さない
export async function logout(): Promise<void> {
  await request('POST', '/api/auth/logout', undefined, false)
}

// ---------------------------------------------------------------- FN-03 投稿

// 投稿（機能定義書 3.5 PostView）。日時は ISO 8601 の UTC
export type PostView = {
  id: number
  author: { username: string, displayName: string, iconUrl: string | null }
  body: string
  images: { id: number, url: string, expiresAt: string }[]
  likeCount: number
  commentCount: number
  likedByMe: boolean
  mine: boolean
  createdAt: string
  editedAt: string | null
}

// 画像（FN-04）は選んだ順に images として送る
export function createPost(body: string, images: File[] = []): Promise<PostView> {
  const form = new FormData()
  form.append('body', body)
  for (const image of images) form.append('images', image)
  return requestJson<PostView>('POST', '/api/posts', form)
}

export function fetchPost(id: number): Promise<PostView> {
  return requestJson<PostView>('GET', `/api/posts/${id}`)
}

export function editPost(id: number, body: string): Promise<PostView> {
  return requestJson<PostView>('PATCH', `/api/posts/${id}`, { body })
}

export async function deletePost(id: number): Promise<void> {
  await request('DELETE', `/api/posts/${id}`)
}

// ---------------------------------------------------------------- FN-04 画像

export type PostImage = PostView['images'][number]

// 署名付き URL を取り直す（I-8）。削除された画像は結果に入らない。1 回に 50 個まで
export async function refreshImageUrls(imageIds: number[]): Promise<PostImage[]> {
  const res = await requestJson<{ items: PostImage[] }>('POST', '/api/images/urls', { imageIds })
  return res.items
}

// ---------------------------------------------------------------- FN-02 タイムライン

export type Tab = 'following' | 'all'

// 20 件ずつ（機能定義書 FN-02 6 章）。nextCursor が null なら続きはない。
// followingCount は「フォロー中」の最初の 20 件のときだけ返る（M-8 を出すかどうかを決める）
export type TimelinePage = {
  items: PostView[]
  nextCursor: string | null
  followingCount?: number
}

export function fetchTimeline(tab: Tab, cursor: string | null = null): Promise<TimelinePage> {
  const query = new URLSearchParams({ tab })
  if (cursor !== null) query.set('cursor', cursor)
  return requestJson<TimelinePage>('GET', `/api/timeline?${query}`)
}

// ---------------------------------------------------------------- FN-05 コメント

// コメント（機能定義書 FN-05 6 章）。author は投稿の author と同じ形
export type CommentView = {
  id: number
  author: PostView['author']
  body: string
  mine: boolean
  createdAt: string
}

// 古い順に 50 件ずつ。nextCursor が null なら続きはない
export type CommentPage = {
  items: CommentView[]
  nextCursor: string | null
}

export function fetchComments(postId: number, cursor: string | null = null): Promise<CommentPage> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`
  return requestJson<CommentPage>('GET', `/api/posts/${postId}/comments${query}`)
}

export function createComment(postId: number, body: string): Promise<CommentView> {
  return requestJson<CommentView>('POST', `/api/posts/${postId}/comments`, { body })
}

export async function deleteComment(commentId: number): Promise<void> {
  await request('DELETE', `/api/comments/${commentId}`)
}

// ---------------------------------------------------------------- FN-06 いいね

// いいね・取り消しの結果。likeCount はほかの人の操作も含めた最新の数
export type LikeResult = { liked: boolean, likeCount: number }

// 何回送っても同じ結果になる（冪等。FN-06 5 章 No.2）
export function likePost(postId: number): Promise<LikeResult> {
  return requestJson<LikeResult>('PUT', `/api/posts/${postId}/like`)
}

export function unlikePost(postId: number): Promise<LikeResult> {
  return requestJson<LikeResult>('DELETE', `/api/posts/${postId}/like`)
}

// ユーザーの行に出すユーザー（機能定義書 3.5 UserSummary）
export type UserSummary = {
  username: string
  displayName: string
  bioFirstLine: string
  iconUrl: string | null
  followedByMe: boolean
  me: boolean
}

// 新しくいいねした順に 20 件ずつ。totalCount は G-5 の見出しに使う
export type LikersPage = {
  items: UserSummary[]
  nextCursor: string | null
  totalCount: number
}

export function fetchLikers(postId: number, cursor: string | null = null): Promise<LikersPage> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`
  return requestJson<LikersPage>('GET', `/api/posts/${postId}/likes${query}`)
}

// ---------------------------------------------------------------- FN-07 フォロー

// フォロー・解除の結果。followerCount は相手のフォロワー数（ほかの人の操作も含めた最新の数）
export type FollowResult = { following: boolean, followerCount: number }

// 何回送っても同じ結果になる（冪等。FN-07 5 章 No.2）
export function followUser(username: string): Promise<FollowResult> {
  return requestJson<FollowResult>('PUT', `/api/users/${encodeURIComponent(username)}/follow`)
}

export function unfollowUser(username: string): Promise<FollowResult> {
  return requestJson<FollowResult>('DELETE', `/api/users/${encodeURIComponent(username)}/follow`)
}

// G-8 のタブ：その人がフォローしている人・その人をフォローしている人
export type FollowKind = 'following' | 'followers'

// 新しくフォローした順に 20 件ずつ。nextCursor が null なら続きはない
export type UsersPage = {
  items: UserSummary[]
  nextCursor: string | null
}

export function fetchFollows(username: string, kind: FollowKind, cursor: string | null = null): Promise<UsersPage> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`
  return requestJson<UsersPage>('GET', `/api/users/${encodeURIComponent(username)}/${kind}${query}`)
}

// ---------------------------------------------------------------- FN-09 プロフィール

// プロフィール（機能定義書 FN-09 6 章）。username は登録したときの書き方。件数は読み込んだ時点の値
export type Profile = {
  username: string
  displayName: string
  bio: string
  iconUrl: string | null
  joinedAt: string
  followingCount: number
  followerCount: number
  postCount: number
  followedByMe: boolean
  me: boolean
}

// username は大文字・小文字を区別しない
export function fetchProfile(username: string): Promise<Profile> {
  return requestJson<Profile>('GET', `/api/users/${encodeURIComponent(username)}`)
}

// その人の投稿を新しい順に 20 件ずつ。形と読み込み方はタイムラインと同じ（PF-2）
export function fetchUserPosts(username: string, cursor: string | null = null): Promise<TimelinePage> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`
  return requestJson<TimelinePage>('GET', `/api/users/${encodeURIComponent(username)}/posts${query}`)
}

// G-6 の URL
export const profileUrl = (username: string) => `/users/${encodeURIComponent(username)}`

// ---------------------------------------------------------------- FN-08 ユーザー検索

// 検索結果の 1 回分。nextOffset は続きを読むときに送る件数で、最後まで読んだら null
export type UserSearchPage = {
  items: UserSummary[]
  nextOffset: number | null
}

// ユーザー ID か表示名の部分一致で探す。20 件ずつ（S-4〜S-7）
export function searchUsers(q: string, offset = 0): Promise<UserSearchPage> {
  const query = new URLSearchParams({ q })
  if (offset > 0) query.set('offset', String(offset))
  return requestJson<UserSearchPage>('GET', `/api/search/users?${query}`)
}

// G-9 の URL。検索した文字を ?q= に入れる（開き直しても同じ結果を出す）
export const searchUrl = (q: string) => `/search?${new URLSearchParams({ q })}`

// ---------------------------------------------------------------- FN-09 第 2 版 プロフィールの編集

// 自分の表示名と自己紹介を変える。URL にユーザー ID を入れない（ほかの人のものは変えられない）
export function editProfile(displayName: string, bio: string): Promise<Profile> {
  return requestJson<Profile>('PATCH', '/api/me/profile', { displayName, bio })
}

// アイコン画像を差し替える。新しいプロフィール（iconUrl つき）を返す
export function changeIcon(icon: File): Promise<Profile> {
  const form = new FormData()
  form.append('icon', icon)
  return requestJson<Profile>('PUT', '/api/me/icon', form)
}

// アイコンを外して頭文字の丸に戻す（PF-9）
export async function removeIcon(): Promise<void> {
  await request('DELETE', '/api/me/icon')
}
