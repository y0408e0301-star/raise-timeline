import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { ApiError, deletePost, editPost, type PostView } from '../api'
import { M } from '../messages'
import { fullTime, relativeTime } from '../time'
import { remainingChars } from '../validation'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import styles from './PostCard.module.css'
import { isSubmitKey, remainingText, useAutoGrow } from './textarea'
import { useToast } from './ToastContext'
import ui from './ui.module.css'

type Props = {
  post: PostView
  // G-4 の上の投稿カード。本文を押しても何もしない
  detail?: boolean
  // 編集中にできるのは 1 つだけなので、どの投稿を編集中かは並べている画面が持つ（画面設計書 3.7）
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onChange: (post: PostView) => void
  onDelete: (id: number) => void
}

// 失敗したときに出すメッセージ。削除されていたときは M-11、それ以外は M-18（FN-03 9 章）
function failureMessage(e: unknown): string {
  return e instanceof ApiError && e.code === 'POST_NOT_FOUND' ? M[11] : M[18]
}

// 投稿カード（画面設計書 3.7。G-3・G-4・G-6 で共通）。
// いいね（♡ を押す・いいね数から G-5）は開発計画書 1-6、画像は 1-3、名前からプロフィールへの移動は 1-9 で足す
export default function PostCard({ post, detail = false, editing, onEditingChange, onChange, onDelete }: Props) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const postUrl = `/posts/${post.id}`

  async function handleDelete() {
    try {
      await deletePost(post.id)
      setConfirming(false)
      onDelete(post.id)
    } catch (e) {
      setConfirming(false)
      toast(failureMessage(e))
      // 先に削除されていた（ほかの画面で消した）ときも、画面から消す
      if (e instanceof ApiError && e.code === 'POST_NOT_FOUND') onDelete(post.id)
    }
  }

  return (
    <article className={styles.post} aria-label={`${post.author.displayName}の投稿`}>
      <Avatar displayName={post.author.displayName} iconUrl={post.author.iconUrl} size={40} />
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.names}>
            <span className={styles.name}>{post.author.displayName}</span>
            <span className={styles.username}>@{post.author.username}</span>
          </span>
          <time className={styles.time} dateTime={post.createdAt} title={fullTime(post.createdAt)}>
            · {relativeTime(post.createdAt)}
          </time>
          {post.editedAt && (
            <span className={styles.edited} title={`${fullTime(post.editedAt)} に編集`}>（編集済み）</span>
          )}
          {post.mine && !editing && (
            <PostMenu onEdit={() => onEditingChange(true)} onDelete={() => setConfirming(true)} />
          )}
        </div>
        {editing
          ? <PostEditor post={post} onSaved={(saved) => { onChange(saved); onEditingChange(false) }}
            onCancel={() => onEditingChange(false)} />
          : post.body && (detail
            ? <div className={styles.body}>{post.body}</div>
            : <Link to={postUrl} className={`${styles.body} ${styles.bodyLink}`}>{post.body}</Link>)}
        <div className={styles.actions}>
          <span className={styles.action} aria-label={`いいね ${post.likeCount} 件`}>
            <span className={styles.heart} aria-hidden="true">♡</span>
            <span aria-hidden="true">{post.likeCount}</span>
          </span>
          {detail
            ? <span className={styles.action} aria-label={`コメント ${post.commentCount} 件`}>💬 {post.commentCount}</span>
            : <Link to={postUrl} className={`${styles.action} ${styles.countLink}`}
              aria-label={`コメント ${post.commentCount} 件`}>💬 {post.commentCount}</Link>}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog title="投稿を削除" message={M[10]} onConfirm={handleDelete} onCancel={() => setConfirming(false)} />
      )}
    </article>
  )
}

// 自分の投稿にだけ出す「…」メニュー（W-7・W-9）
function PostMenu({ onEdit, onDelete }: { onEdit: () => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // メニューの外を押したとき・Esc キーで閉じる
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function choose(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <button type="button" className={styles.menuButton} aria-label="メニュー" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)}>…</button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" onClick={() => choose(onEdit)}>編集</button>
          <button type="button" role="menuitem" className={styles.danger} onClick={() => choose(onDelete)}>削除</button>
        </div>
      )}
    </div>
  )
}

// 編集中の表示（W-9・W-10、画面設計書 3.7「編集中の表示」）
function PostEditor({ post, onSaved, onCancel }: {
  post: PostView
  onSaved: (post: PostView) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [body, setBody] = useState(post.body)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(textareaRef)

  // 開いたらカーソルを末尾に置く
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const trimmed = body.trim()
  const remaining = remainingChars(body)
  const canSave = !saving && trimmed !== post.body && remaining >= 0 && (trimmed !== '' || post.images.length > 0)

  async function save() {
    if (!canSave || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      onSaved(await editPost(post.id, trimmed))
    } catch (e) {
      // 入力欄と入力した本文は残す
      toast(failureMessage(e))
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !saving) {
      e.preventDefault()
      onCancel()
    } else if (isSubmitKey(e)) {
      e.preventDefault()
      void save()
    }
  }

  return (
    <div>
      <textarea ref={textareaRef} className={styles.editArea} aria-label="投稿の本文を編集" value={body}
        onChange={(e) => setBody(e.target.value)} onKeyDown={handleKeyDown} />
      <div className={styles.editFoot}>
        <span className={remaining < 0 ? `${ui.count} ${ui.over}` : ui.count}>{remainingText(remaining)}</span>
        <button type="button" className={ui.secondary} onClick={onCancel} disabled={saving}>キャンセル</button>
        <button type="button" className={ui.primary} onClick={save} disabled={!canSave}>
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </div>
  )
}
