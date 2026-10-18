import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, fetchPost, type PostView } from '../api'
import PostCard from '../components/PostCard'
import ui from '../components/ui.module.css'
import { M } from '../messages'
import styles from './PostPage.module.css'

type State =
  | { status: 'loading' }
  | { status: 'loaded', post: PostView }
  | { status: 'deleted' }
  | { status: 'failed' }

async function load(id: number): Promise<State> {
  try {
    return { status: 'loaded', post: await fetchPost(id) }
  } catch (e) {
    return { status: e instanceof ApiError && e.status === 404 ? 'deleted' : 'failed' }
  }
}

// G-4 投稿の詳細画面（W-6〜W-11、画面設計書 7 章）。コメント（FN-05）は開発計画書 1-5 で足す
export default function PostPage() {
  const id = Number(useParams().id)
  // 数字でない ID は、ない投稿と同じに扱う
  const validId = Number.isSafeInteger(id) && id > 0
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!validId) return
    let active = true
    async function start() {
      setState({ status: 'loading' })
      const next = await load(id)
      if (active) setState(next)
    }
    void start()
    return () => {
      active = false
    }
  }, [id, validId])

  // 読み込みに失敗したとき（T-8 と同じ「再読み込み」）
  async function reload() {
    setState({ status: 'loading' })
    setState(await load(id))
  }

  // 前の画面に戻る。この画面を直接開いたとき（前の画面がない）は G-3
  function back() {
    if (location.key === 'default') navigate('/', { replace: true })
    else navigate(-1)
  }

  const shown: State = validId ? state : { status: 'deleted' }

  return (
    <>
      <div className={styles.head}>
        <button type="button" className={styles.back} aria-label="戻る" onClick={back}>←</button>
        <h1>投稿</h1>
      </div>
      {shown.status === 'loading' && <p className={styles.state}>読み込み中…</p>}
      {shown.status === 'deleted' && <p className={ui.empty}>{M[11]}</p>}
      {shown.status === 'failed' && (
        <div className={styles.state}>
          <p>{M[9]}</p>
          <button type="button" className={ui.secondary} onClick={reload}>再読み込み</button>
        </div>
      )}
      {shown.status === 'loaded' && (
        <PostCard post={shown.post} detail editing={editing} onEditingChange={setEditing}
          onChange={(post) => setState({ status: 'loaded', post })}
          // G-4 で削除したときは前の画面に戻る（FN-03 3.3）
          onDelete={back} />
      )}
    </>
  )
}
