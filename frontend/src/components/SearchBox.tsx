import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { searchUrl } from '../api'
import { limitChars, SEARCH_QUERY_MAX } from '../validation'
import styles from './SearchBox.module.css'

type Props = {
  // G-9 では検索した文字を入れておく
  initialQuery: string
  // 600px 未満で虫めがねのボタンを押したときに、入力欄にフォーカスを移す
  autoFocus: boolean
  className: string
}

// ヘッダーのユーザーの検索欄（FN-08 S-1・S-2・S-5、画面設計書 3.6）。
// Enter キーか虫めがねで G-9 を開く。トリムして 0 文字のときは何もしない。入力中の候補は出さない
export default function SearchBox({ initialQuery, autoFocus, className }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q === '') return
    navigate(searchUrl(q))
  }

  return (
    <search className={`${styles.wrap} ${className}`}>
      <form className={styles.box} onSubmit={submit}>
        <input ref={inputRef} type="search" className={styles.input} placeholder="ユーザーを検索"
          aria-label="ユーザーを検索する文字" enterKeyHint="search"
          value={query} onChange={(e) => setQuery(limitChars(e.target.value, SEARCH_QUERY_MAX))} />
        <button type="submit" className={styles.button} aria-label="検索">🔍</button>
      </form>
    </search>
  )
}
