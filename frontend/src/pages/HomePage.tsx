import { useState } from 'react'
import type { PostView } from '../api'
import PostCard from '../components/PostCard'
import PostForm from '../components/PostForm'
import ui from '../components/ui.module.css'

// G-3 タイムライン画面のうち、投稿フォームと投稿カード（W-1〜W-7・W-9〜W-11）。
// タブとタイムラインの一覧（FN-02）は開発計画書 1-4 で作る。それまでは、この画面で投稿したものを新しい順に出す
export default function HomePage() {
  const [posts, setPosts] = useState<PostView[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)

  return (
    <>
      {/* 投稿したら一覧の先頭に足す（T-5） */}
      <PostForm onPosted={(post) => setPosts((prev) => [post, ...prev])} />
      {posts.length === 0
        ? <p className={ui.empty}>まだ投稿がありません。</p>
        : posts.map((post) => (
          <PostCard key={post.id} post={post} editing={editingId === post.id}
            onEditingChange={(editing) => setEditingId(editing ? post.id : null)}
            onChange={(changed) => setPosts((prev) => prev.map((p) => (p.id === changed.id ? changed : p)))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
        ))}
    </>
  )
}
