import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { profileUrl } from '../api'
import { useAuth } from '../auth/AuthContext'
import Avatar from './Avatar'
import styles from './Layout.module.css'
import SearchBox from './SearchBox'
import ui from './ui.module.css'

// G-3〜G-9 で共通のヘッダー（画面設計書 3.6）と、横幅 600px の 1 列（3.10）。
// 画面の横幅が 600px 未満のときは、検索欄を虫めがねのボタンだけにし、押すとヘッダーの全体を検索欄にする
export default function Layout() {
  const { me, signOut } = useAuth()
  const location = useLocation()
  const [sending, setSending] = useState(false)
  // 600px 未満で、ヘッダーを検索欄にしているか。ほかの画面に移ったら閉じる
  const [searchOpenAt, setSearchOpenAt] = useState<string | null>(null)
  const searchOpen = searchOpenAt === location.pathname

  // 確認なしでログアウトし G-1 に移す（A-9）
  async function handleLogout() {
    setSending(true)
    await signOut()
  }

  // G-9 では検索した文字を入れておく。検索した文字が変わったとき・G-9 から離れたときに入れ直す
  // （画面が URL の ?tab= などを書き換えただけでは、入力中の文字を消さない）
  const q = location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? '' : null

  return (
    <>
      <header className={styles.header}>
        <div className={searchOpen ? `${styles.inner} ${styles.searching}` : styles.inner}>
          {searchOpen && (
            <button type="button" className={styles.close} aria-label="検索を閉じる"
              onClick={() => setSearchOpenAt(null)}>←</button>
          )}
          <Link to="/" className={styles.appName}>
            <span className={styles.full}>Raise timeline</span>
            <span className={styles.short}>RT</span>
          </Link>
          <SearchBox key={q === null ? 'other' : `search:${q}`} initialQuery={q ?? ''} autoFocus={searchOpen}
            className={styles.search} />
          <div className={styles.right}>
            <button type="button" className={styles.searchToggle} aria-label="ユーザーを検索"
              onClick={() => setSearchOpenAt(location.pathname)}>
              🔍
            </button>
            {me && (
              // 自分のアイコンを押すと自分の G-6
              <Link to={profileUrl(me.username)} title={`${me.displayName}（@${me.username}）`}
                aria-label="自分のプロフィール" className={styles.me}>
                <Avatar displayName={me.displayName} iconUrl={me.iconUrl} size={32} />
              </Link>
            )}
            <button type="button" className={ui.secondary} onClick={handleLogout} disabled={sending}>
              ログアウト
            </button>
          </div>
        </div>
      </header>
      <main className={styles.container}>
        <Outlet />
      </main>
    </>
  )
}
