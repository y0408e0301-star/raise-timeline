import { useRef, useState, type KeyboardEvent } from 'react'
import { createPost, type PostView } from '../api'
import { useAuth } from '../auth/AuthContext'
import { M } from '../messages'
import { remainingChars } from '../validation'
import Avatar from './Avatar'
import styles from './PostForm.module.css'
import { isSubmitKey, remainingText, useAutoGrow } from './textarea'
import { useToast } from './ToastContext'
import ui from './ui.module.css'

// G-3 の上の投稿フォーム（W-1〜W-3、画面設計書 6 章）。画像（「画像を選ぶ」・プレビュー）は開発計画書 1-3 で足す
export default function PostForm({ onPosted }: { onPosted: (post: PostView) => void }) {
  const { me } = useAuth()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  // 素早く 2 回押しても 1 回だけ送る（state は次の描画まで変わらないため、ref でも確かめる）
  const sendingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(textareaRef)

  const remaining = remainingChars(body)
  const canSubmit = !sending && remaining >= 0 && body.trim() !== ''

  async function submit() {
    if (!canSubmit || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      const post = await createPost(body.trim())
      setBody('')
      onPosted(post)
    } catch {
      // 入力した本文はそのまま残す
      toast(M[14])
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (isSubmitKey(e)) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <section className={styles.form}>
      {me && <Avatar displayName={me.displayName} iconUrl={me.iconUrl} size={40} />}
      <div className={styles.main}>
        <textarea ref={textareaRef} rows={2} placeholder="いまどうしてる？" aria-label="投稿の本文"
          value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={handleKeyDown} />
        <div className={styles.actions}>
          <span className={remaining < 0 ? `${ui.count} ${ui.over}` : ui.count}>{remainingText(remaining)}</span>
          <button type="button" className={ui.primary} onClick={submit} disabled={!canSubmit}>
            {sending ? '投稿中…' : '投稿する'}
          </button>
        </div>
      </div>
    </section>
  )
}
