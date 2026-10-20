import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ApiError, likePost, unlikePost, type LikeResult, type PostView } from '../api'
import { M } from '../messages'
import styles from './PostCard.module.css'
import { useToast } from './ToastContext'

type Props = {
  post: PostView
  // 送り終わったら、返ってきた状態と件数を投稿に入れる
  onChange: (post: PostView) => void
  // 投稿が削除されていたら、カードを一覧から消す（FN-06 9 章）
  onDelete: (id: number) => void
}

// 投稿カードの「♡」といいね数（L-1〜L-6、画面設計書 3.7）。
// 押してから反映までを 0.5 秒以内（N-3）にするため、API の応答を待たずに画面を変える（FN-06 3 章）
export default function LikeButton({ post, onChange, onDelete }: Props) {
  const toast = useToast()
  // 送っている間だけ、押した後の状態を出す。送り終わったら null に戻し、投稿の値を出す
  const [pending, setPending] = useState<LikeResult | null>(null)
  // 最後に押した状態。送っている間に押されたら、ここだけを書き換える
  const wantRef = useRef<boolean | null>(null)
  const sendingRef = useRef(false)
  // 送り終わったときに、その時点の投稿（編集した後かもしれない）に結果を入れる
  const postRef = useRef(post)
  useEffect(() => {
    postRef.current = post
  })

  const liked = pending?.liked ?? post.likedByMe
  const count = pending?.likeCount ?? post.likeCount

  async function toggle() {
    const want = !(wantRef.current ?? post.likedByMe)
    wantRef.current = want
    setPending((prev) => {
      const current = prev ?? { liked: post.likedByMe, likeCount: post.likeCount }
      const delta = want === current.liked ? 0 : want ? 1 : -1
      return { liked: want, likeCount: Math.max(0, current.likeCount + delta) }
    })
    if (sendingRef.current) return
    sendingRef.current = true
    try {
      // 送っている間に押されて状態が変わっていたら、最後の状態だけを送り直す。
      // PUT・DELETE は何回送っても同じ結果になるので、送り直してよい（FN-06 5 章 No.2）
      let sent: boolean
      let result: LikeResult
      do {
        sent = wantRef.current ?? want
        result = await (sent ? likePost(post.id) : unlikePost(post.id))
      } while (wantRef.current !== sent)
      // 返ってきた likeCount で、ほかの人の操作も含めた最新の数に合わせる
      onChange({ ...postRef.current, likedByMe: result.liked, likeCount: result.likeCount })
    } catch (e) {
      // 「♡」と数を押す前に戻す（投稿の値のまま）
      if (e instanceof ApiError && e.code === 'POST_NOT_FOUND') {
        toast(M[11])
        onDelete(post.id)
      } else {
        toast(M[18])
      }
    } finally {
      sendingRef.current = false
      wantRef.current = null
      setPending(null)
    }
  }

  return (
    <span className={liked ? `${styles.action} ${styles.liked}` : styles.action}>
      <button type="button" className={styles.heartButton} aria-label={liked ? 'いいねを取り消す' : 'いいねする'}
        aria-pressed={liked} onClick={() => void toggle()}>
        <span className={styles.heart} aria-hidden="true">{liked ? '♥' : '♡'}</span>
      </button>
      {/* いいね数を押すと G-5（L-5） */}
      <Link to={`/posts/${post.id}/likes`} className={styles.countLink} aria-label={`いいね ${count} 件`}>{count}</Link>
    </span>
  )
}
