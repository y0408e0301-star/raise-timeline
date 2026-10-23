import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UserSummary } from '../api'
import { json, mockFetch } from '../test/fetchMock'
import { renderComponent } from '../test/render'
import UserRow from './UserRow'

// ユーザーの行（画面設計書 8 章。G-5・G-8・G-9 で同じ形）

function user(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    username: 'hanako', displayName: 'はなこ', bioFirstLine: '写真が好き', iconUrl: null,
    followedByMe: false, me: false, ...overrides,
  }
}

function renderRow(target: UserSummary, showBio = false) {
  const onChange = vi.fn()
  renderComponent(<ul><UserRow user={target} showBio={showBio} onChange={onChange} /></ul>)
  return { row: screen.getByRole('listitem', { name: target.displayName }), onChange }
}

describe('UserRow', () => {
  it('表示名と @ユーザー ID を出し、押すとその人の G-6 を開く', async () => {
    const { row } = renderRow(user())
    const link = within(row).getByRole('link')
    expect(link).toHaveTextContent('はなこ@hanako')
    await userEvent.click(link)
    expect(screen.getByRole('status', { name: '今の URL' })).toHaveTextContent('/users/hanako')
  })

  it('自己紹介の 1 行目は showBio のときだけ出す', () => {
    renderRow(user(), true)
    expect(screen.getByText('写真が好き')).toBeInTheDocument()
  })

  it('showBio でなければ自己紹介は出さない', () => {
    renderRow(user())
    expect(screen.queryByText('写真が好き')).not.toBeInTheDocument()
  })

  it('自分の行にはフォローボタンを出さない', () => {
    const { row } = renderRow(user({ me: true }))
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('フォローしたら、新しい followedByMe を入れた行を渡す', async () => {
    mockFetch({ 'PUT /api/users/hanako/follow': () => json(200, { following: true, followerCount: 1 }) })
    const { row, onChange } = renderRow(user())
    await userEvent.click(within(row).getByRole('button', { name: 'フォローする' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(user({ followedByMe: true })))
  })
})
