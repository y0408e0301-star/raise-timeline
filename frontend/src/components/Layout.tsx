import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import Avatar from './Avatar'
import styles from './Layout.module.css'
import ui from './ui.module.css'

// G-3〜G-9 で共通のヘッダー（画面設計書 3.6）と、横幅 600px の 1 列（3.10）。
// 検索欄は開発計画書 1-8（ユーザー検索）、自分のアイコンからプロフィールへの移動は 1-9 で足す
export default function Layout() {
  const { me, signOut } = useAuth()
  const [sending, setSending] = useState(false)

  // 確認なしでログアウトし G-1 に移す（A-9）
  async function handleLogout() {
    setSending(true)
    await signOut()
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/" className={styles.appName}>
            <span className={styles.full}>Raise timeline</span>
            <span className={styles.short}>RT</span>
          </Link>
          <div className={styles.right}>
            {me && (
              <span title={`${me.displayName}（@${me.username}）`}>
                <Avatar displayName={me.displayName} iconUrl={me.iconUrl} size={32} />
              </span>
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
