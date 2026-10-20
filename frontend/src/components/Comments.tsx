import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError, createComment, deleteComment, fetchComments, type CommentView } from '../api'
import { useAuth } from '../auth/AuthContext'
import { M } from '../messages'
import { fullTime, relativeTime } from '../time'
import { remainingChars } from '../validation'
import Avatar from './Avatar'
import styles from './Comments.module.css'
import ConfirmDialog from './ConfirmDialog'
import { isSubmitKey, remainingText, useAutoGrow } from './textarea'
import { useToast } from './ToastContext'
import ui from './ui.module.css'

type Props = {
  postId: number
  // コメント数を自分の操作の分だけ増減する（FN-05 5 章 No.4）
  onCountChange: (delta: number) => void
}

type List =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded', items: CommentView[], nextCursor: string | null }

// ID の小さい順（古い順）にし、同じコメントは 1 つにする。
// まだ読んでいない続きがあるときに自分がコメントすると、続きを読んだときに同じコメントがまた返ってくるため（FN-05 3 章）
function merge(current: CommentView[], added: CommentView[]): CommentView[] {
  const byId = new Map([...current, ...added].map((c) => [c.id, c]))
  return [...byId.values()].toSorted((a, b) => a.id - b.id)
}

// G-4 のコメントフォームと一覧（C-1〜C-6、画面設計書 7 章）
export default function Comments({ postId, onCountChange }: Props) {
  const toast = useToast()
  const [list, setList] = useState<List>({ status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleting, setDeleting] = useState<CommentView | null>(null)

  useEffect(() => {
    let active = true
    fetchComments(postId).then(
      (page) => active && setList({ status: 'loaded', items: page.items, nextCursor: page.nextCursor }),
      () => active && setList({ status: 'failed' }))
    return () => {
      active = false
    }
  }, [postId])

  async function reload() {
    setList({ status: 'loading' })
    try {
      const page = await fetchComments(postId)
      setList({ status: 'loaded', items: page.items, nextCursor: page.nextCursor })
    } catch {
      setList({ status: 'failed' })
    }
  }

  // 「さらに表示」で次の 50 件（C-3）
  async function loadMore() {
    if (list.status !== 'loaded' || list.nextCursor === null || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchComments(postId, list.nextCursor)
      setList((prev) => prev.status === 'loaded'
        ? { status: 'loaded', items: merge(prev.items, page.items), nextCursor: page.nextCursor }
        : prev)
    } catch {
      toast(M[9])
    } finally {
      setLoadingMore(false)
    }
  }

  // 一覧の一番下に足す（C-1）
  function added(comment: CommentView) {
    setList((prev) => prev.status === 'loaded' ? { ...prev, items: merge(prev.items, [comment]) } : prev)
    onCountChange(1)
  }

  function removed(id: number) {
    setList((prev) => prev.status === 'loaded' ? { ...prev, items: prev.items.filter((c) => c.id !== id) } : prev)
    onCountChange(-1)
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteComment(deleting.id)
      removed(deleting.id)
    } catch (e) {
      // すでに削除されていたときは、一覧から消すだけでメッセージは出さない（FN-05 9 章）
      if (e instanceof ApiError && e.code === 'COMMENT_NOT_FOUND') removed(deleting.id)
      else toast(M[18])
    }
    setDeleting(null)
  }

  return (
    <section aria-label="コメント">
      <CommentForm postId={postId} onAdded={added} />
      {list.status === 'loading' && <p className={styles.state}>読み込み中…</p>}
      {list.status === 'failed' && (
        <div className={styles.state}>
          <p>{M[9]}</p>
          <button type="button" className={ui.secondary} onClick={reload}>再読み込み</button>
        </div>
      )}
      {list.status === 'loaded' && (
        <>
          <ul className={styles.list} aria-label="コメントの一覧">
            {list.items.map((comment) => (
              <CommentItem key={comment.id} comment={comment} onDelete={() => setDeleting(comment)} />
            ))}
          </ul>
          {list.nextCursor !== null && (
            <div className={styles.more}>
              <button type="button" className={ui.secondary} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '読み込み中…' : 'さらに表示'}
              </button>
            </div>
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog title="コメントを削除" message={M[15]} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      )}
    </section>
  )
}

// 1 つのコメント（C-4・C-5）。表示名からプロフィール画面（G-6）への移動は開発計画書 1-9 で足す
function CommentItem({ comment, onDelete }: { comment: CommentView, onDelete: () => void }) {
  return (
    <li className={styles.comment} aria-label={`${comment.author.displayName}のコメント`}>
      <Avatar displayName={comment.author.displayName} iconUrl={comment.author.iconUrl} size={32} />
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.names}>
            <span className={styles.name}>{comment.author.displayName}</span>
            <span className={styles.username}>@{comment.author.username}</span>
          </span>
          <time className={styles.time} dateTime={comment.createdAt} title={fullTime(comment.createdAt)}>
            · {relativeTime(comment.createdAt)}
          </time>
          {comment.mine && (
            <button type="button" className={styles.delete} onClick={onDelete}>削除</button>
          )}
        </div>
        <div className={styles.body}>{comment.body}</div>
      </div>
    </li>
  )
}

// コメントフォーム（C-1・C-2）。残りの文字数と押せないときの扱いは投稿フォームと同じ（W-2・W-3）
function CommentForm({ postId, onAdded }: { postId: number, onAdded: (comment: CommentView) => void }) {
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
      onAdded(await createComment(postId, body.trim()))
      setBody('')
    } catch (e) {
      // 入力した本文は残す。投稿が削除されていたら M-11（FN-05 9 章）
      toast(e instanceof ApiError && e.code === 'POST_NOT_FOUND' ? M[11] : M[18])
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
    <div className={styles.form}>
      {me && <Avatar displayName={me.displayName} iconUrl={me.iconUrl} size={32} />}
      <div className={styles.main}>
        <textarea ref={textareaRef} rows={1} placeholder="コメントを書く" aria-label="コメントの本文"
          value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={handleKeyDown} />
        <div className={styles.actions}>
          <span className={remaining < 0 ? `${ui.count} ${ui.over}` : ui.count}>{remainingText(remaining)}</span>
          <button type="button" className={ui.primary} onClick={submit} disabled={!canSubmit}>
            {sending ? '送信中…' : 'コメントする'}
          </button>
        </div>
      </div>
    </div>
  )
}
