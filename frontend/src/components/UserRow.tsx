import { Link } from 'react-router'
import { profileUrl, type UserSummary } from '../api'
import Avatar from './Avatar'
import FollowButton from './FollowButton'
import { useFollow } from './useFollow'
import styles from './UserRow.module.css'

type Props = {
  user: UserSummary
  // G-8・G-9 では、自己紹介の 1 行目を下に出す
  showBio?: boolean
  // フォロー・解除を送り終わったら、新しい followedByMe を一覧に入れる
  onChange: (user: UserSummary) => void
}

// ユーザーの行（画面設計書 8 章。G-5・G-8・G-9 で同じ形）。行を押すとその人の G-6、
// 自分以外の行の右にフォローボタン（F-1〜F-3）
export default function UserRow({ user, showBio = false, onChange }: Props) {
  const { following, toggle } = useFollow(user.username, user.followedByMe,
    (result) => onChange({ ...user, followedByMe: result.following }))
  return (
    <li className={styles.row} aria-label={user.displayName}>
      <Link to={profileUrl(user.username)} className={styles.link}>
        <Avatar displayName={user.displayName} iconUrl={user.iconUrl} size={40} />
        <span className={styles.main}>
          <span className={styles.name}>{user.displayName}</span>
          <span className={styles.username}>@{user.username}</span>
          {showBio && user.bioFirstLine && <span className={styles.bio}>{user.bioFirstLine}</span>}
        </span>
      </Link>
      {!user.me && <FollowButton following={following} onClick={() => void toggle()} />}
    </li>
  )
}
