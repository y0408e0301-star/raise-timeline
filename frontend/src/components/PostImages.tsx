import { useRef, useState } from 'react'
import { refreshImageUrls, type PostImage } from '../api'
import ImageDialog from './ImageDialog'
import styles from './PostImages.module.css'

// 投稿カードの画像（画面設計書 3.7、FN-04 I-6〜I-8）。
// 1 枚：横幅いっぱい、2 枚：横に 2 つ、3 枚：左に 1 つ・右に 2 つ、4 枚：2 行 2 列。押すと G-10
export default function PostImages({ images: initial }: { images: PostImage[] }) {
  // 取り直した URL。投稿が変わったら（タイムラインの読み直しなど）初めの URL に戻す
  const [state, setState] = useState({ initial, images: initial, failed: false })
  const [open, setOpen] = useState<number | null>(null)
  const current = state.initial === initial ? state : { initial, images: initial, failed: false }
  const { images, failed } = current

  // 取り直し中のもの。期限が切れると画像の数だけ onError が同時に起きるので、送るのは 1 回にしてその結果を待つ
  const refreshing = useRef<{ initial: PostImage[], promise: Promise<void> } | null>(null)

  // 15 分の期限が切れた・読み込めなかったときは、新しい URL を取り直す（I-8）。取り直しは 1 回だけ
  function refresh(): Promise<void> {
    if (failed) return Promise.resolve()
    if (refreshing.current?.initial === initial) return refreshing.current.promise
    const promise = (async () => {
      try {
        const fresh = await refreshImageUrls(images.map((i) => i.id))
        const byId = new Map(fresh.map((i) => [i.id, i]))
        setState({ initial, images: images.map((i) => byId.get(i.id) ?? i), failed: false })
      } catch {
        setState({ initial, images, failed: true })
      }
    })().finally(() => {
      if (refreshing.current?.promise === promise) refreshing.current = null
    })
    refreshing.current = { initial, promise }
    return promise
  }

  // G-10 を開く前に、期限が切れていれば取り直す
  async function openAt(index: number) {
    if (images.some((i) => Date.parse(i.expiresAt) <= Date.now())) await refresh()
    setOpen(index)
  }

  if (images.length === 0) return null
  if (failed) return <p className={styles.failed}>画像を読み込めませんでした</p>

  return (
    <>
      <div className={`${styles.grid} ${styles[`count${images.length}`]}`}>
        {images.map((image, index) => (
          <button key={image.id} type="button" className={styles.cell} onClick={() => void openAt(index)}
            aria-label={`画像 ${index + 1} / ${images.length} を拡大`}>
            {/* 期限切れなどで読み込めなかったら URL を取り直す */}
            <img src={image.url} alt="" loading="lazy" onError={() => void refresh()} />
          </button>
        ))}
      </div>
      {open !== null && (
        <ImageDialog images={images} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)}
          onError={() => void refresh()} />
      )}
    </>
  )
}
