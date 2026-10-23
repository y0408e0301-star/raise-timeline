import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, changeIcon, editProfile, fetchProfile, profileUrl, removeIcon, type Profile } from '../api'
import { useAuth } from '../auth/AuthContext'
import Avatar from '../components/Avatar'
import { remainingText } from '../components/textarea'
import { useToast } from '../components/ToastContext'
import ui from '../components/ui.module.css'
import { M } from '../messages'
import {
  BIO_MAX, countChars, DISPLAY_NAME_MAX, ICON_TYPES, isAcceptableIcon, isValidDisplayName, limitBio, limitChars,
} from '../validation'
import head from './PostPage.module.css'
import styles from './EditProfilePage.module.css'

type State =
  | { status: 'loading' | 'failed', profile: null }
  | { status: 'loaded', profile: Profile }

// アイコンをどう変えるか。keep：変えない、pick：選んだ画像にする、remove：外す（まだ保存しない）
type IconChange = { kind: 'keep' } | { kind: 'pick', file: File } | { kind: 'remove' }

// G-7 プロフィールの編集画面（画面設計書 10 章、FN-09 PF-5〜PF-9）。
// 「保存する」で、アイコンを変えたときは先にアイコンの API を呼び、成功したら表示名・自己紹介を送る（FN-09 3.1）
export default function EditProfilePage() {
  const { me, signedIn } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const username = me?.username ?? ''
  const [state, setState] = useState<State>({ status: 'loading', profile: null })
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [icon, setIcon] = useState<IconChange>({ kind: 'keep' })
  const [iconError, setIconError] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // 素早く 2 回押しても 1 回だけ送る
  const sendingRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // 自己紹介は自分の情報（me）に入っていないので、プロフィールを読んで今の値を入れておく（画面設計書 10 章）
  const load = useCallback(async () => {
    setState({ status: 'loading', profile: null })
    try {
      const profile = await fetchProfile(username)
      setState({ status: 'loaded', profile })
      setDisplayName(profile.displayName)
      setBio(profile.bio)
    } catch {
      setState({ status: 'failed', profile: null })
    }
  }, [username])

  useEffect(() => {
    async function start() {
      await load()
    }
    void start()
  }, [load])

  // 選んだ画像のプレビューに使う URL。選び直したら・離れたら解放する
  const pickedUrl = useMemo(() => (icon.kind === 'pick' ? URL.createObjectURL(icon.file) : null), [icon])
  useEffect(() => () => {
    if (pickedUrl) URL.revokeObjectURL(pickedUrl)
  }, [pickedUrl])

  const back = () => navigate(profileUrl(username))

  // 形式・大きさが合わない画像は選ばずに M-21（PF-8）。同じファイルをもう一度選べるよう、選んだ後は入力欄を空にする
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isAcceptableIcon(file)) {
      setIconError(true)
      return
    }
    setIconError(false)
    setIcon({ kind: 'pick', file })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state.status !== 'loaded' || sendingRef.current) return
    const name = displayName.trim()
    if (!isValidDisplayName(name)) {
      setNameError(M[5])
      nameRef.current?.focus()
      return
    }
    sendingRef.current = true
    setSending(true)
    try {
      let saved = state.profile
      if (icon.kind === 'pick') saved = await changeIcon(icon.file)
      if (icon.kind === 'remove' && saved.iconUrl) {
        await removeIcon()
        saved = { ...saved, iconUrl: null }
      }
      // アイコンだけ保存できて表示名・自己紹介に失敗したときも、保存できたアイコンを出し続ける（FN-09 3.1）
      if (icon.kind !== 'keep') {
        setState({ status: 'loaded', profile: saved })
        setIcon({ kind: 'keep' })
        signedIn({ username: saved.username, displayName: saved.displayName, iconUrl: saved.iconUrl })
      }
      saved = await editProfile(name, bio)
      signedIn({ username: saved.username, displayName: saved.displayName, iconUrl: saved.iconUrl })
      navigate(profileUrl(saved.username))
    } catch (err) {
      // 入力した内容はそのまま残す
      if (err instanceof ApiError && err.code === 'DISPLAY_NAME_REQUIRED') setNameError(err.message)
      else if (err instanceof ApiError && (err.code === 'ICON_TYPE_INVALID' || err.code === 'ICON_TOO_LARGE')) {
        setIconError(true)
      } else toast(M[18])
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const heading = (
    <div className={head.head}>
      <button type="button" className={head.back} aria-label="戻る" onClick={back}>←</button>
      <h1>プロフィールを編集</h1>
    </div>
  )
  if (state.status !== 'loaded') {
    return (
      <>
        {heading}
        {state.status === 'loading'
          ? <p className={head.state}>読み込み中…</p>
          : (
              <div className={head.state} role="alert">
                <p>{M[9]}</p>
                <button type="button" className={ui.secondary} onClick={() => void load()}>再読み込み</button>
              </div>
            )}
      </>
    )
  }

  const { profile } = state
  const iconUrl = icon.kind === 'pick' ? pickedUrl : icon.kind === 'remove' ? null : profile.iconUrl
  // 「アイコンを外す」は、アイコンを設定しているか、画像を選んだときだけ出す（画面設計書 10 章）
  const canRemove = icon.kind === 'pick' || (icon.kind === 'keep' && profile.iconUrl !== null)
  const remaining = BIO_MAX - countChars(bio)

  return (
    <>
      {heading}
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.icon}>
          <Avatar displayName={displayName.trim() || profile.displayName} iconUrl={iconUrl} size={96} />
          <input ref={fileRef} type="file" accept={ICON_TYPES.join(',')} hidden aria-label="アイコン画像のファイル"
            onChange={pick} />
          <button type="button" className={ui.secondary} disabled={sending} onClick={() => fileRef.current?.click()}>
            画像を選ぶ
          </button>
          {canRemove && (
            <button type="button" className={styles.remove} disabled={sending}
              onClick={() => setIcon({ kind: 'remove' })}>
              アイコンを外す
            </button>
          )}
        </div>
        {iconError && <p className={styles.error} role="alert">{M[21]}</p>}

        <div className={styles.field}>
          <label htmlFor="displayName">表示名</label>
          <input ref={nameRef} id="displayName" type="text"
            value={displayName} aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'displayName-error' : undefined}
            onChange={(e) => {
              // 31 文字目（コードポイント）は入力できない（PF-6）
              setDisplayName(limitChars(e.target.value, DISPLAY_NAME_MAX))
              setNameError(null)
            }} />
          {nameError && <p className={styles.error} id="displayName-error">{nameError}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="bio">自己紹介</label>
          <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(limitBio(e.target.value))} />
          <p className={`${ui.count} ${styles.remaining}`}>{remainingText(remaining)}</p>
        </div>

        <div className={styles.actions}>
          <button type="button" className={ui.secondary} disabled={sending} onClick={back}>キャンセル</button>
          <button type="submit" className={ui.primary} disabled={sending}>{sending ? '保存中…' : '保存する'}</button>
        </div>
      </form>
    </>
  )
}
