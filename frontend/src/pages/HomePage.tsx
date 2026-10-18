import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import styles from './AuthPage.module.css'

// ログインした後の仮の画面。タイムライン画面（G-3。開発計画書 2-2）を作るまで、
// ログインできたことと、ログアウトできることだけを確かめる
export default function HomePage() {
  const { me, signOut } = useAuth()
  const [sending, setSending] = useState(false)

  async function handleLogout() {
    setSending(true)
    await signOut()
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>ログイン成功</h1>
      <p className={styles.center}>{me?.displayName}（@{me?.username}）でログインしています。</p>
      <p className={styles.center}>
        <button type="button" className={styles.secondary} onClick={handleLogout} disabled={sending}>
          ログアウト
        </button>
      </p>
    </main>
  )
}
