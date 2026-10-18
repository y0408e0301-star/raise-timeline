import { useState } from 'react'
import ui from './ui.module.css'

type Props = {
  displayName: string
  iconUrl: string | null
  size: 32 | 40 | 80 | 96
}

// ユーザーを表す丸（画面設計書 3.11）。アイコンがない・読めないときは、表示名の 1 文字目を出す
export default function Avatar({ displayName, iconUrl, size }: Props) {
  const [broken, setBroken] = useState(false)
  const initial = Array.from(displayName)[0] ?? '?'
  return (
    <span className={ui.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {iconUrl && !broken
        ? <img src={iconUrl} alt={`${displayName}のアイコン`} onError={() => setBroken(true)} />
        : <span aria-hidden="true">{initial}</span>}
    </span>
  )
}
