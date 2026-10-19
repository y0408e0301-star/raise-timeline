import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { createPost, type PostView } from '../api'
import { useAuth } from '../auth/AuthContext'
import { M } from '../messages'
import { addImages, IMAGE_TYPES, IMAGES_MAX, remainingChars } from '../validation'
import Avatar from './Avatar'
import styles from './PostForm.module.css'
import { isSubmitKey, remainingText, useAutoGrow } from './textarea'
import { useToast } from './ToastContext'
import ui from './ui.module.css'

// G-3 の上の投稿フォーム（W-1〜W-3・I-1〜I-5、画面設計書 6 章）
export default function PostForm({ onPosted }: { onPosted: (post: PostView) => void }) {
  const { me } = useAuth()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  // 素早く 2 回押しても 1 回だけ送る（state は次の描画まで変わらないため、ref でも確かめる）
  const sendingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useAutoGrow(textareaRef)

  // プレビューに使う URL。画像を外したら・送ったら解放する
  const previews = useMemo(() => images.map((image) => URL.createObjectURL(image)), [images])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const remaining = remainingChars(body)
  // 画像があれば本文は 0 文字でもよい（BR-2）
  const canSubmit = !sending && remaining >= 0 && (body.trim() !== '' || images.length > 0)

  async function submit() {
    if (!canSubmit || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      const post = await createPost(body.trim(), images)
      setBody('')
      setImages([])
      onPosted(post)
    } catch {
      // 入力した本文と画像はそのまま残す（I-5）
      toast(M[14])
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  // 選んだ画像を後ろに足す（I-1〜I-3）。同じファイルをもう一度選べるよう、選んだ後は入力欄を空にする
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (picked.length === 0) return
    const result = addImages(images, picked)
    setImages(result.images)
    if (result.error === 'M12') toast(M[12])
    if (result.error === 'M13') toast(M[13])
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
        {images.length > 0 && (
          <ul className={styles.previews} aria-label="添える画像">
            {previews.map((url, index) => (
              <li key={url} className={styles.preview}>
                <img src={url} alt={`添える画像 ${index + 1}`} />
                <button type="button" className={styles.remove} aria-label={`画像 ${index + 1} を外す`}
                  disabled={sending} onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden
            aria-label="添える画像のファイル" onChange={pick} />
          <button type="button" className={`${ui.secondary} ${styles.pick}`} onClick={() => fileRef.current?.click()}
            disabled={sending || images.length >= IMAGES_MAX}>
            画像を選ぶ
          </button>
          <span className={remaining < 0 ? `${ui.count} ${ui.over}` : ui.count}>{remainingText(remaining)}</span>
          <button type="button" className={ui.primary} onClick={submit} disabled={!canSubmit}>
            {sending ? '投稿中…' : '投稿する'}
          </button>
        </div>
      </div>
    </section>
  )
}
