import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, fetchFollows, fetchProfile, profileUrl, type FollowKind, type UserSummary } from '../api'
import UserRow from '../components/UserRow'
import ui from '../components/ui.module.css'
import { M } from '../messages'
import tabs from './HomePage.module.css'
import styles from './PostPage.module.css'

type List = {
  items: UserSummary[]
  // 続きを読むときに送る。null なら最後まで読んだ
  nextCursor: string | null
  status: 'loading' | 'loaded' | 'failed' | 'notFound'
}

const initialList: List = { items: [], nextCursor: null, status: 'loading' }

const TABS: { kind: FollowKind, label: string, empty: string }[] = [
  { kind: 'following', label: 'フォロー中', empty: 'まだ誰もフォローしていません。' },
  { kind: 'followers', label: 'フォロワー', empty: 'まだフォロワーはいません。' },
]

// G-8 フォロー中・フォロワーの一覧画面（F-6、画面設計書 11 章）。タブは URL の /following・/followers と合わせる。
// 新しくフォローした順に 20 件ずつ、一番下まで見たら次の 20 件。
// 見出しはその人の表示名（読み込むまでは @ユーザー ID）
export default function FollowsPage({ kind }: { kind: FollowKind }) {
  const username = useParams().username ?? ''
  const navigate = useNavigate()
  const location = useLocation()
  const [list, setList] = useState<List>(initialList)
  const [displayName, setDisplayName] = useState<string | null>(null)
  // タブを切り替えた後に、前のタブの応答が遅れて届いても使わない
  const requestRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // cursor が null なら最初の 20 件、そうでなければ続きを後ろに足す
  const load = useCallback(async (cursor: string | null) => {
    const request = ++requestRef.current
    setList((prev) => (cursor === null ? initialList : { ...prev, status: 'loading' }))
    try {
      const page = await fetchFollows(username, kind, cursor)
      if (request !== requestRef.current) return
      setList((prev) => ({
        items: cursor === null ? page.items : [...prev.items, ...page.items],
        nextCursor: page.nextCursor,
        status: 'loaded',
      }))
    } catch (e) {
      if (request !== requestRef.current) return
      const notFound = e instanceof ApiError && e.code === 'USER_NOT_FOUND'
      setList((prev) => ({ ...prev, status: notFound ? 'notFound' : 'failed' }))
    }
  }, [username, kind])

  // 開いたとき・タブが変わったときは最初の 20 件から出す
  useEffect(() => {
    async function start() {
      await load(null)
    }
    void start()
  }, [load])

  // 見出しの表示名。読めなくても一覧は出せるので、失敗しても何も出さない（@ユーザー ID のまま）
  useEffect(() => {
    let current = true
    async function start() {
      try {
        const profile = await fetchProfile(username)
        if (current) setDisplayName(profile.displayName)
      } catch {
        // 見出しは @ユーザー ID のまま
      }
    }
    void start()
    return () => {
      current = false
      setDisplayName(null)
    }
  }, [username])

  // 一覧の一番下が見えたら続きを読む
  const canLoadMore = list.status === 'loaded' && list.nextCursor !== null
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!canLoadMore || !sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(list.nextCursor)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canLoadMore, list.nextCursor, load])

  // G-6 に戻る。G-8 へは G-6 から来る（タブの切り替えは履歴を増やさない）ので、前の画面に戻ればよい。
  // この画面を直接開いたとき（前の画面がない）は G-6 を開く
  function back() {
    if (location.key === 'default') navigate(profileUrl(username), { replace: true })
    else navigate(-1)
  }

  // フォロー・解除を送り終わった行を入れ替える
  function updateUser(user: UserSummary) {
    setList((prev) => ({ ...prev, items: prev.items.map((u) => (u.username === user.username ? user : u)) }))
  }

  // 「再読み込み」：失敗したのと同じ読み込みをやり直す
  function retry() {
    void load(list.items.length === 0 ? null : list.nextCursor)
  }

  const current = TABS.find((t) => t.kind === kind) ?? TABS[0]

  return (
    <>
      <div className={styles.head}>
        <button type="button" className={styles.back} aria-label="戻る" onClick={back}>←</button>
        <h1>{displayName ?? `@${username}`}</h1>
      </div>
      {list.status === 'notFound'
        ? <p className={ui.empty}>{M[17]}</p>
        : (
          <>
            {/* タブを替えると URL が変わり、履歴を増やさずに読み込み直す */}
            <div className={tabs.tabs} role="tablist">
              {TABS.map((t) => (
                <Link key={t.kind} to={`/users/${encodeURIComponent(username)}/${t.kind}`} replace role="tab"
                  aria-selected={t.kind === kind}
                  className={t.kind === kind ? `${tabs.tab} ${tabs.active}` : tabs.tab}>
                  {t.label}
                </Link>
              ))}
            </div>
            <ul className={styles.users} aria-label={current.label}>
              {list.items.map((user) => <UserRow key={user.username} user={user} showBio onChange={updateUser} />)}
            </ul>
            {list.status === 'loaded' && list.items.length === 0 && <p className={ui.empty}>{current.empty}</p>}
            {list.status === 'loading' && <p className={styles.state}>読み込み中…</p>}
            {list.status === 'failed' && (
              <div className={styles.state} role="alert">
                <p>{M[9]}</p>
                <button type="button" className={ui.secondary} onClick={retry}>再読み込み</button>
              </div>
            )}
            <div ref={sentinelRef} />
          </>
        )}
    </>
  )
}
