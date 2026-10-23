import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { searchUsers, type UserSummary } from '../api'
import UserRow from '../components/UserRow'
import ui from '../components/ui.module.css'
import { M, m16 } from '../messages'
import styles from './PostPage.module.css'

type List = {
  items: UserSummary[]
  // 続きを読むときに送る件数。null なら最後まで読んだ
  nextOffset: number | null
  status: 'loading' | 'loaded' | 'failed'
}

const initialList: List = { items: [], nextOffset: null, status: 'loading' }

// G-9 ユーザー検索の結果画面（画面設計書 12 章、FN-08 S-2〜S-9）。検索した文字は URL の ?q= に入れるので、
// 開き直したり、G-6 から戻ってきたりしても同じ結果を出す。20 件ずつ、一番下まで見たら次の 20 件
export default function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const [list, setList] = useState<List>(initialList)
  // 検索し直した後に、前の検索の応答が遅れて届いても使わない
  const requestRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // offset が 0 なら最初の 20 件、そうでなければ続きを後ろに足す
  const load = useCallback(async (offset: number) => {
    const request = ++requestRef.current
    setList((prev) => (offset === 0 ? initialList : { ...prev, status: 'loading' }))
    try {
      const page = await searchUsers(q, offset)
      if (request !== requestRef.current) return
      setList((prev) => ({
        items: offset === 0 ? page.items : [...prev.items, ...page.items],
        nextOffset: page.nextOffset,
        status: 'loaded',
      }))
    } catch {
      if (request === requestRef.current) setList((prev) => ({ ...prev, status: 'failed' }))
    }
  }, [q])

  // 開いたとき・検索し直したときは最初の 20 件から出す。検索する文字がなければ探さない（S-5）
  useEffect(() => {
    async function start() {
      if (q !== '') await load(0)
    }
    void start()
  }, [q, load])

  // 一覧の一番下が見えたら続きを読む（S-7）
  const canLoadMore = list.status === 'loaded' && list.nextOffset !== null
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!canLoadMore || !sentinel || list.nextOffset === null) return
    const next = list.nextOffset
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(next)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canLoadMore, list.nextOffset, load])

  // フォロー・解除を送り終わった行を入れ替える
  function updateUser(user: UserSummary) {
    setList((prev) => ({ ...prev, items: prev.items.map((u) => (u.username === user.username ? user : u)) }))
  }

  if (q === '') return null

  return (
    <>
      <div className={styles.head}>
        <h1>「{q}」の検索結果</h1>
      </div>
      <ul className={styles.users} aria-label="検索結果">
        {list.items.map((user) => <UserRow key={user.username} user={user} showBio onChange={updateUser} />)}
      </ul>
      {list.status === 'loaded' && list.items.length === 0 && <p className={ui.empty}>{m16(q)}</p>}
      {list.status === 'loading' && <p className={styles.state}>読み込み中…</p>}
      {list.status === 'failed' && (
        <div className={styles.state} role="alert">
          <p>{M[9]}</p>
          <button type="button" className={ui.secondary}
            onClick={() => void load(list.items.length === 0 ? 0 : list.nextOffset ?? 0)}>
            再読み込み
          </button>
        </div>
      )}
      <div ref={sentinelRef} />
    </>
  )
}
