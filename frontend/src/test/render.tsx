import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { Me, PostView } from '../api'
import { AuthContext, type Auth } from '../auth/AuthContext'
import { ToastProvider } from '../components/ToastProvider'
import CurrentLocation from './CurrentLocation'

// 部品のテストで使う準備。部品を 1 つだけ描画し、ルーター・ログインしている自分・トーストを用意する。
// App 全体（AuthProvider）は使わないので、GET /api/auth/me は呼ばない

export const me: Me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

export function post(overrides: Partial<PostView> = {}): PostView {
  return {
    id: 1,
    author: { username: 'taro_y', displayName: 'たろう', iconUrl: null },
    body: '今日は晴れ',
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    mine: true,
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...overrides,
  }
}

export function renderComponent(ui: ReactNode, { path = '/', auth = {} }: { path?: string, auth?: Partial<Auth> } = {}) {
  const value: Auth = { me, signedIn: vi.fn(), signOut: vi.fn(async () => {}), ...auth }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext value={value}>
        <ToastProvider>
          <Routes>
            <Route path="*" element={<>{ui}<CurrentLocation /></>} />
          </Routes>
        </ToastProvider>
      </AuthContext>
    </MemoryRouter>,
  )
}
