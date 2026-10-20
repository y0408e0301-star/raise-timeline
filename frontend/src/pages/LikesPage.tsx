import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, fetchLikers, type UserSummary } from '../api'
import UserRow from '../components/UserRow'
import ui from '../components/ui.module.css'
import { M } from '../messages'
import styles from './PostPage.module.css'

type List = {
  items: UserSummary[]
  // 続きを読むときに送る。null なら最後まで読んだ
  nextCursor: string | null
  // 見出しの「いいね 12 件」。最初の 20 件を読むまでは null
  totalCount: number | null
  status: 'loading' | 'loaded' | 'failed' | 'deleted'
}

const initialList: List = { items: [], nextCursor: null, totalCount: null, status: 'loading' }

// G-5 いいねした人の一覧画面（L-5、画面設計書 8 章）。新しくいいねした順に 20 件ずつ、一番下まで見たら次の 20 件。
// フォローボタン（F-1・F-2）は開発計画書 1-7 で足す
export default function LikesPage() {
  const id = Number(useParams().id)
  // 数字でない ID は、ない投稿と同じに扱う
  const validId = Number.isSafeInteger(id) && id > 0
  const navigate = useNavigate()
  const location = useLocation()
  const [list, setList] = useState<List>(initialList)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // cursor が null なら最初の 20 件、そうでなければ続きを後ろに足す
  const load = useCallback(async (cursor: string | null) => {
    setList((prev) => (cursor === null ? initialList : { ...prev, status: 'loading' }))
    try {
      const page = await fetchLikers(id, cursor)
      setList((prev) => ({
        items: cursor === null ? page.items : [...prev.items, ...page.items],
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
        status: 'loaded',
      }))
    } catch (e) {
      const deleted = e instanceof ApiError && e.code === 'POST_NOT_FOUND'
      setList((prev) => ({ ...prev, status: deleted ? 'deleted' : 'failed' }))
    }
  }, [id])

  useEffect(() => {
    if (!validId) return
    async function start() {
      await load(null)
    }
    void start()
  }, [load, validId])

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

  // 前の画面に戻る。この画面を直接開いたとき（前の画面がない）は G-3
  function back() {
    if (location.key === 'default') navigate('/', { replace: true })
    else navigate(-1)
  }

  // 「再読み込み」：失敗したのと同じ読み込みをやり直す
  function retry() {
    void load(list.items.length === 0 ? null : list.nextCursor)
  }

  const status = validId ? list.status : 'deleted'

  return (
    <>
      <div className={styles.head}>
        <button type="button" className={styles.back} aria-label="戻る" onClick={back}>←</button>
        <h1>{list.totalCount === null || status === 'deleted' ? 'いいね' : `いいね ${list.totalCount} 件`}</h1>
      </div>
      {status === 'deleted'
        ? <p className={ui.empty}>{M[11]}</p>
        : (
          <>
            <ul className={styles.users} aria-label="いいねした人">
              {list.items.map((user) => <UserRow key={user.username} user={user} />)}
            </ul>
            {status === 'loaded' && list.items.length === 0 && <p className={ui.empty}>まだ誰もいいねしていません。</p>}
            {status === 'loading' && <p className={styles.state}>読み込み中…</p>}
            {status === 'failed' && (
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
