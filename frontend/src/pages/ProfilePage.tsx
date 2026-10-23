import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError, fetchProfile, fetchUserPosts, profileUrl, type PostView, type Profile } from '../api'
import Avatar from '../components/Avatar'
import FollowButton from '../components/FollowButton'
import PostCard from '../components/PostCard'
import ui from '../components/ui.module.css'
import { useFollow } from '../components/useFollow'
import { M } from '../messages'
import { joinedMonth } from '../time'
import list from './HomePage.module.css'
import styles from './ProfilePage.module.css'

type ProfileState =
  | { status: 'loading' | 'failed' | 'notFound', profile: null }
  | { status: 'loaded', profile: Profile }

type Posts = {
  items: PostView[]
  // 続きを読むときに送る。null なら最後まで読んだ
  nextCursor: string | null
  status: 'loading' | 'loaded' | 'failed'
}

const initialPosts: Posts = { items: [], nextCursor: null, status: 'loading' }

// G-6 プロフィール画面（画面設計書 9 章、FN-09 PF-1〜PF-4）。上にその人の情報とフォローボタン、
// 下にその人の投稿を新しい順に 20 件ずつ（読み込み方は G-3 と同じ）。自分の G-6 には「プロフィールを編集」（PF-3・PF-5）
export default function ProfilePage() {
  const username = useParams().username ?? ''
  const [state, setState] = useState<ProfileState>({ status: 'loading', profile: null })
  const [posts, setPosts] = useState<Posts>(initialPosts)
  const [editingId, setEditingId] = useState<number | null>(null)
  // 別の人の G-6 に移った後に、前の人の応答が遅れて届いても使わない
  const profileRequestRef = useRef(0)
  const postsRequestRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadProfile = useCallback(async () => {
    const request = ++profileRequestRef.current
    setState({ status: 'loading', profile: null })
    try {
      const profile = await fetchProfile(username)
      if (request === profileRequestRef.current) setState({ status: 'loaded', profile })
    } catch (e) {
      if (request !== profileRequestRef.current) return
      const notFound = e instanceof ApiError && e.code === 'USER_NOT_FOUND'
      setState({ status: notFound ? 'notFound' : 'failed', profile: null })
    }
  }, [username])

  // cursor が null なら最新の 20 件から、そうでなければ続きを後ろに足す（PF-2）
  const loadPosts = useCallback(async (cursor: string | null) => {
    const request = ++postsRequestRef.current
    setPosts((prev) => (cursor === null ? initialPosts : { ...prev, status: 'loading' }))
    try {
      const page = await fetchUserPosts(username, cursor)
      if (request !== postsRequestRef.current) return
      setPosts((prev) => ({
        items: cursor === null ? page.items : [...prev.items, ...page.items],
        nextCursor: page.nextCursor,
        status: 'loaded',
      }))
    } catch {
      // いない人のときは、プロフィールの方で M-17 を出す
      if (request === postsRequestRef.current) setPosts((prev) => ({ ...prev, status: 'failed' }))
    }
  }, [username])

  // 開いたとき・別の人の G-6 に移ったときは読み直す
  useEffect(() => {
    async function start() {
      setEditingId(null)
      await Promise.all([loadProfile(), loadPosts(null)])
    }
    void start()
  }, [loadProfile, loadPosts])

  // 一覧の一番下が見えたら続きを読む
  const canLoadMore = state.status === 'loaded' && posts.status === 'loaded' && posts.nextCursor !== null
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!canLoadMore || !sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPosts(posts.nextCursor)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canLoadMore, posts.nextCursor, loadPosts])

  // フォロー・解除を送り終わったら、返ってきたフォロワー数に合わせる（FN-07 3 章）
  const { following, toggle } = useFollow(state.profile?.username ?? username, state.profile?.followedByMe ?? false,
    (result) => setState((prev) => (prev.status === 'loaded'
      ? { ...prev, profile: { ...prev.profile, followedByMe: result.following, followerCount: result.followerCount } }
      : prev)))

  if (state.status === 'notFound') return <p className={ui.empty}>{M[17]}</p>
  if (state.status === 'failed') {
    return (
      <div className={list.status} role="alert">
        <p>{M[9]}</p>
        <button type="button" className={ui.secondary}
          onClick={() => void Promise.all([loadProfile(), loadPosts(null)])}>再読み込み</button>
      </div>
    )
  }
  const { profile } = state
  if (profile === null) return <output className={list.status}>読み込み中…</output>

  // 送っている間は、押した後の状態に合わせてフォロワー数を ±1 する（FN-09 5 章 No.2）
  const followerCount = profile.followerCount + (following === profile.followedByMe ? 0 : following ? 1 : -1)
  const finished = posts.status === 'loaded' && posts.nextCursor === null
  const base = profileUrl(profile.username)

  return (
    <>
      <section className={styles.profile} aria-label="プロフィール">
        <div className={styles.top}>
          <Avatar displayName={profile.displayName} iconUrl={profile.iconUrl} size={80} />
          {profile.me
            ? <Link to="/settings/profile" className={ui.secondary}>プロフィールを編集</Link>
            : <FollowButton following={following} onClick={() => void toggle()} />}
        </div>
        <h1 className={styles.name}>{profile.displayName}</h1>
        <p className={styles.username}>@{profile.username}</p>
        {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
        <p className={styles.joined}>{joinedMonth(profile.joinedAt)}</p>
        <p className={styles.counts}>
          <Link to={`${base}/following`}><strong>{profile.followingCount}</strong> フォロー</Link>
          <Link to={`${base}/followers`}><strong>{followerCount}</strong> フォロワー</Link>
          <span><strong>{profile.postCount}</strong> 投稿</span>
        </p>
      </section>
      <section aria-label={`${profile.displayName}の投稿`}>
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} editing={editingId === post.id}
            onEditingChange={(editing) => setEditingId(editing ? post.id : null)}
            onChange={(changed) => setPosts((prev) => ({
              ...prev, items: prev.items.map((p) => (p.id === changed.id ? changed : p)),
            }))}
            onDelete={(id) => {
              setPosts((prev) => ({ ...prev, items: prev.items.filter((p) => p.id !== id) }))
              setState((prev) => (prev.status === 'loaded'
                ? { ...prev, profile: { ...prev.profile, postCount: Math.max(0, prev.profile.postCount - 1) } }
                : prev))
            }} />
        ))}
      </section>
      {finished && posts.items.length === 0 && <p className={ui.empty}>まだ投稿がありません。</p>}
      {finished && posts.items.length > 0 && <p className={list.status}>これ以上の投稿はありません</p>}
      {posts.status === 'loading' && <output className={list.status}>読み込み中…</output>}
      {posts.status === 'failed' && (
        <div className={list.status} role="alert">
          <p>{M[9]}</p>
          <button type="button" className={ui.secondary}
            onClick={() => void loadPosts(posts.items.length === 0 ? null : posts.nextCursor)}>再読み込み</button>
        </div>
      )}
      <div ref={sentinelRef} />
    </>
  )
}
