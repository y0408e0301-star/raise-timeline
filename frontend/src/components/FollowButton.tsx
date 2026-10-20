import { useState } from 'react'
import styles from './FollowButton.module.css'
import ui from './ui.module.css'

type Props = {
  following: boolean
  onClick: () => void
}

// 「フォローする」（主ボタン）と「フォロー中」（通常ボタン）。「フォロー中」にマウスを乗せている間は、
// 文字を「フォロー解除」、枠線と文字を危険色にする（F-2、画面設計書 3.3）。外すときに確認は出さない。
// 押した直後は、マウスが乗ったままでも「フォロー中」と出し、乗せ直したら「フォロー解除」にする。
// 状態と送信は useFollow で持つ
export default function FollowButton({ following, onClick }: Props) {
  const [hover, setHover] = useState(false)
  const unfollow = following && hover
  const className = following
    ? `${ui.secondary} ${styles.button} ${unfollow ? styles.unfollow : ''}`
    : `${ui.primary} ${styles.button}`
  return (
    <button type="button" className={className}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => {
        setHover(false)
        onClick()
      }}>
      {!following ? 'フォローする' : unfollow ? 'フォロー解除' : 'フォロー中'}
    </button>
  )
}
