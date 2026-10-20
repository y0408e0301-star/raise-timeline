import type { UserSummary } from '../api'
import Avatar from './Avatar'
import styles from './UserRow.module.css'

// ユーザーの行（画面設計書 8 章。G-5・G-8・G-9 で同じ形）。フォローボタン（F-1・F-2）は開発計画書 1-7、
// G-8・G-9 で出す自己紹介の 1 行目は 1-7・1-8、行からプロフィール画面（G-6）への移動は 1-9 で足す
export default function UserRow({ user }: { user: UserSummary }) {
  return (
    <li className={styles.row} aria-label={user.displayName}>
      <Avatar displayName={user.displayName} iconUrl={user.iconUrl} size={40} />
      <div className={styles.main}>
        <span className={styles.name}>{user.displayName}</span>
        <span className={styles.username}>@{user.username}</span>
      </div>
    </li>
  )
}
