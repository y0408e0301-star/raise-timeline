import { useEffect, useRef, useState } from 'react'
import { ApiError, followUser, unfollowUser, type FollowResult } from '../api'
import { M } from '../messages'
import { useToast } from './ToastContext'

// フォローする・外す（F-1〜F-4）。押してから反映までを 0.5 秒以内（N-3）にするため、
// API の応答を待たずに following を変える（FN-07 3 章）。送り終わったら onChange に結果を渡し、
// 呼んだ側の値（followedByMe）を変えてもらう。G-6 はフォロワー数も following から ±1 して出す
export function useFollow(username: string, followedByMe: boolean, onChange: (result: FollowResult) => void) {
  const toast = useToast()
  // 送っている間だけ、押した後の状態を出す。送り終わったら null に戻し、followedByMe を出す
  const [pending, setPending] = useState<boolean | null>(null)
  // 最後に押した状態。送っている間に押されたら、ここだけを書き換える
  const wantRef = useRef<boolean | null>(null)
  const sendingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  async function toggle() {
    const want = !(wantRef.current ?? followedByMe)
    wantRef.current = want
    setPending(want)
    if (sendingRef.current) return
    sendingRef.current = true
    try {
      // 送っている間に押されて状態が変わっていたら、最後の状態だけを送り直す。
      // PUT・DELETE は何回送っても同じ結果になるので、送り直してよい（FN-07 5 章 No.2）
      let sent: boolean
      let result: FollowResult
      do {
        sent = wantRef.current ?? want
        result = await (sent ? followUser(username) : unfollowUser(username))
      } while (wantRef.current !== sent)
      onChangeRef.current(result)
    } catch (e) {
      // ボタンを押す前に戻す（followedByMe のまま）。相手がいなければ M-17、それ以外は M-18
      toast(e instanceof ApiError && e.code === 'USER_NOT_FOUND' ? M[17] : M[18])
    } finally {
      sendingRef.current = false
      wantRef.current = null
      setPending(null)
    }
  }

  return { following: pending ?? followedByMe, toggle }
}
