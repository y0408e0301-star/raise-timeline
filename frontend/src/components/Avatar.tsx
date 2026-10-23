import { useState } from 'react'
import ui from './ui.module.css'

type Props = {
  displayName: string
  iconUrl: string | null
  size: 32 | 40 | 80 | 96
}

// ユーザーを表す丸（画面設計書 3.11）。アイコンがない・読めない（URL の期限切れなど）ときは、表示名の 1 文字目を出す
export default function Avatar({ displayName, iconUrl, size }: Props) {
  // 読めなかった URL。アイコンを変えて URL が変わったら、また画像を出す
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const initial = Array.from(displayName)[0] ?? '?'
  return (
    <span className={ui.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {iconUrl && iconUrl !== brokenUrl
        ? <img src={iconUrl} alt={`${displayName}のアイコン`} onError={() => setBrokenUrl(iconUrl)} />
        : <span aria-hidden="true">{initial}</span>}
    </span>
  )
}
