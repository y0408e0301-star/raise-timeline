import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Me } from '../api'
import { AuthContext } from '../auth/AuthContext'
import Layout from './Layout'

// G-3〜G-9 で共通のヘッダー（画面設計書 3.6）

const me: Me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

function renderLayout(path: string, signOut = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext value={{ me, signedIn: vi.fn(), signOut }}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<p>中身</p>} />
          </Route>
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  )
  return { signOut }
}

const searchInput = () => screen.getByRole('searchbox', { name: 'ユーザーを検索する文字' })

describe('Layout', () => {
  it('アプリ名は G-3、自分のアイコンは自分の G-6 へのリンク', () => {
    renderLayout('/posts/1')
    expect(screen.getByRole('link', { name: /Raise timeline/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '自分のプロフィール' })).toHaveAttribute('href', '/users/taro_y')
    expect(screen.getByText('中身')).toBeInTheDocument()
  })

  it('ログアウトは確認なしで送り、送っている間は押せない', async () => {
    const { signOut } = renderLayout('/', vi.fn(() => new Promise<void>(() => {})))
    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(signOut).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeDisabled()
  })

  it('G-9 では検索した文字を検索欄に入れておき、ほかの画面では空にする', () => {
    renderLayout('/search?q=%E3%81%9F%E3%82%8D%E3%81%86')
    expect(searchInput()).toHaveValue('たろう')
  })

  it('ほかの画面では検索欄を空にする', () => {
    renderLayout('/users/hanako')
    expect(searchInput()).toHaveValue('')
  })

  it('狭い画面の虫めがねを押すと検索欄にカーソルを置き、「←」で閉じる', async () => {
    renderLayout('/')
    await userEvent.click(screen.getByRole('button', { name: 'ユーザーを検索' }))
    expect(searchInput()).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: '検索を閉じる' }))
    expect(screen.queryByRole('button', { name: '検索を閉じる' })).not.toBeInTheDocument()
  })
})
