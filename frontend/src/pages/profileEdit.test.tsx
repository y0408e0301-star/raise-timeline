import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../api'
import App from '../App'
import Avatar from '../components/Avatar'
import { M } from '../messages'
import { json, mockFetch, type Handler } from '../test/fetchMock'
import { mockIntersectionObserver } from '../test/intersection'

// プロフィールの編集（FN-09 第 2 版、PF-5〜PF-10）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }
const iconUrl = 'https://s3.example/icons/a.png?sig=1'

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    username: 'taro_y',
    displayName: 'たろう',
    bio: '川沿いを散歩するのが好きです',
    iconUrl: null,
    joinedAt: '2026-09-30T15:00:00Z',
    followingCount: 0,
    followerCount: 0,
    postCount: 0,
    followedByMe: false,
    me: true,
    ...overrides,
  }
}

function renderAt(path: string, routes: Record<string, Handler | Handler[]> = {}) {
  const fetch = mockFetch({
    'GET /api/auth/me': () => json(200, me),
    'GET /api/users/taro_y': () => json(200, profile()),
    'GET /api/users/taro_y/posts': () => json(200, { items: [], nextCursor: null }),
    ...routes,
  })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

// 選べる形式・大きさを変えられる画像ファイル
function file(name: string, type = 'image/png', size = 10): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

// accept 属性で選べないファイルも、画面の確認を試すために選べるようにする
const user = () => userEvent.setup({ applyAccept: false })
const fileInput = () => screen.getByLabelText<HTMLInputElement>('アイコン画像のファイル')
const nameInput = () => screen.getByLabelText<HTMLInputElement>('表示名')
const bioInput = () => screen.getByLabelText<HTMLTextAreaElement>('自己紹介')
const save = () => screen.getByRole('button', { name: '保存する' })
const sent = (init: RequestInit | undefined) => JSON.parse(String(init?.body))
// 見出しは読み込み中にも出るので、今の値を入れた入力欄が出るまで待つ
const opened = () => screen.findByLabelText('表示名')

beforeEach(() => {
  mockIntersectionObserver()
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:icon-${++n}`),
    revokeObjectURL: vi.fn(),
  }))
})

describe('G-6 の「プロフィールを編集」（PF-3・PF-5）', () => {
  it('自分の G-6 には「プロフィールを編集」を出し、押すと G-7 を開く', async () => {
    renderAt('/users/taro_y')
    await user().click(await screen.findByRole('link', { name: 'プロフィールを編集' }))
    await opened()
    expect(screen.queryByRole('button', { name: /フォロー/ })).not.toBeInTheDocument()
  })

  it('ほかの人の G-6 には出さない', async () => {
    renderAt('/users/hanako', {
      'GET /api/users/hanako': () => json(200, profile({ username: 'hanako', displayName: 'はなこ', me: false })),
      'GET /api/users/hanako/posts': () => json(200, { items: [], nextCursor: null }),
    })
    await screen.findByRole('button', { name: 'フォローする' })
    expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).not.toBeInTheDocument()
  })
})

describe('表示名・自己紹介（PF-5〜PF-7）', () => {
  it('今の値を入れておき、変えて「保存する」と送ってヘッダーの表示名も変え、G-6 に戻る', async () => {
    const saved = profile({ displayName: 'たろう（新）', bio: '1 行目\n2 行目' })
    const fetch = renderAt('/settings/profile', {
      // 1 回目は G-7 を開いたとき、2 回目は保存して G-6 に戻ったとき
      'GET /api/users/taro_y': [() => json(200, profile()), () => json(200, saved)],
      'PATCH /api/me/profile': () => json(200, saved),
    })
    await opened()
    expect(nameInput()).toHaveValue('たろう')
    expect(bioInput()).toHaveValue('川沿いを散歩するのが好きです')
    // ユーザー ID とパスワードの入力欄はない（PF-7）
    expect(screen.queryByLabelText(/ユーザー ID|パスワード/)).not.toBeInTheDocument()

    await user().clear(nameInput())
    await user().type(nameInput(), '  たろう（新） ')
    await user().clear(bioInput())
    await user().type(bioInput(), '1 行目{Enter}2 行目')
    await user().click(save())

    await screen.findByRole('heading', { name: 'たろう（新）', level: 1 })
    const patch = fetch.calls.find((c) => c.key === 'PATCH /api/me/profile')
    expect(sent(patch?.init)).toEqual({ displayName: 'たろう（新）', bio: '1 行目\n2 行目' })
    expect(screen.getByRole('link', { name: '自分のプロフィール' })).toHaveAttribute('title', 'たろう（新）（@taro_y）')
    // アイコンを変えていなければ、アイコンの API は呼ばない
    expect(fetch.keys().filter((k) => k.includes('/api/me/icon'))).toEqual([])
  })

  it('表示名は 30 文字（コードポイント）まで。絵文字だけでも 30 文字入れて保存できる', async () => {
    const fetch = renderAt('/settings/profile', {
      'PATCH /api/me/profile': () => json(200, profile({ displayName: '😀'.repeat(30) })),
    })
    await opened()
    await user().clear(nameInput())
    await user().paste('😀'.repeat(31))
    expect(Array.from(nameInput().value)).toHaveLength(30)
    await user().click(save())
    await waitFor(() => expect(fetch.keys()).toContain('PATCH /api/me/profile'))
    const patch = fetch.calls.find((c) => c.key === 'PATCH /api/me/profile')
    expect(sent(patch?.init)).toMatchObject({ displayName: '😀'.repeat(30) })
  })

  it('自己紹介は 160 文字まで。161 文字目は入力できない', async () => {
    renderAt('/settings/profile', { 'GET /api/users/taro_y': () => json(200, profile({ bio: '' })) })
    await opened()
    await user().click(bioInput())
    await user().paste('😀'.repeat(161))
    expect(Array.from(bioInput().value)).toHaveLength(160)
    expect(screen.getByText('残り 0')).toBeInTheDocument()
  })

  it('表示名が空なら M-5 を入力欄の下に出して送らない。入力すると消える', async () => {
    const fetch = renderAt('/settings/profile')
    await opened()
    await user().clear(nameInput())
    await user().type(nameInput(), '   ')
    await user().click(save())
    expect(await screen.findByText(M[5])).toBeInTheDocument()
    expect(nameInput()).toHaveFocus()
    expect(fetch.keys()).not.toContain('PATCH /api/me/profile')

    await user().type(nameInput(), 'た')
    expect(screen.queryByText(M[5])).not.toBeInTheDocument()
  })

  it('保存に失敗したら M-18 を出し、入力した内容を残して G-7 にとどまる', async () => {
    renderAt('/settings/profile', { 'PATCH /api/me/profile': () => json(500, { code: 'INTERNAL_ERROR', message: M[18] }) })
    await opened()
    await user().type(bioInput(), '！')
    await user().click(save())
    expect(await screen.findByRole('status')).toHaveTextContent(M[18])
    expect(bioInput()).toHaveValue('川沿いを散歩するのが好きです！')
    expect(save()).toBeEnabled()
  })

  it('「キャンセル」では送らずに G-6 に戻る', async () => {
    const fetch = renderAt('/settings/profile')
    await opened()
    await user().type(bioInput(), '変えた')
    await user().click(screen.getByRole('button', { name: 'キャンセル' }))
    await screen.findByRole('link', { name: 'プロフィールを編集' })
    expect(fetch.keys().filter((k) => !k.startsWith('GET'))).toEqual([])
  })
})

describe('アイコン画像（PF-8〜PF-10）', () => {
  it('選んだ画像を丸いプレビューに出し、「保存する」で先にアイコンを送ってから表示名・自己紹介を送る', async () => {
    const fetch = renderAt('/settings/profile', {
      'PUT /api/me/icon': () => json(200, profile({ iconUrl })),
      'PATCH /api/me/profile': () => json(200, profile({ iconUrl })),
    })
    await opened()
    await user().upload(fileInput(), file('me.webp', 'image/webp'))
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toHaveAttribute('src', 'blob:icon-1')

    await user().click(save())
    await screen.findByRole('link', { name: 'プロフィールを編集' })
    expect(fetch.keys().filter((k) => !k.startsWith('GET'))).toEqual(['PUT /api/me/icon', 'PATCH /api/me/profile'])
    const put = fetch.calls.find((c) => c.key === 'PUT /api/me/icon')
    expect(put?.init?.body).toBeInstanceOf(FormData)
    expect((put!.init!.body as FormData).get('icon')).toBeInstanceOf(File)
    // ヘッダーの自分のアイコンも替わる
    expect(screen.getByRole('link', { name: '自分のプロフィール' }).querySelector('img')).toHaveAttribute('src', iconUrl)
  })

  it('GIF・5MB を超える画像は選ばずに M-21 を出す。次に選び直すと消える', async () => {
    renderAt('/settings/profile')
    await opened()
    await user().upload(fileInput(), file('a.gif', 'image/gif'))
    expect(await screen.findByText(M[21])).toBeInTheDocument()
    await user().upload(fileInput(), file('big.png', 'image/png', 5 * 1024 * 1024 + 1))
    expect(screen.getByText(M[21])).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'たろうのアイコン' })).not.toBeInTheDocument()

    // 5MB ちょうどは選べる
    await user().upload(fileInput(), file('ok.jpg', 'image/jpeg', 5 * 1024 * 1024))
    expect(screen.queryByText(M[21])).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toBeInTheDocument()
  })

  it('「アイコンを外す」はアイコンがあるときだけ出し、保存すると外してから表示名・自己紹介を送る', async () => {
    const fetch = renderAt('/settings/profile', {
      'GET /api/users/taro_y': () => json(200, profile({ iconUrl })),
      'DELETE /api/me/icon': () => new Response(null, { status: 204 }),
      'PATCH /api/me/profile': () => json(200, profile()),
    })
    await opened()
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toHaveAttribute('src', iconUrl)
    await user().click(screen.getByRole('button', { name: 'アイコンを外す' }))
    // プレビューは頭文字の丸にし、まだ保存しない
    expect(screen.queryByRole('img', { name: 'たろうのアイコン' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'アイコンを外す' })).not.toBeInTheDocument()
    expect(fetch.keys()).not.toContain('DELETE /api/me/icon')

    await user().click(save())
    await screen.findByRole('link', { name: 'プロフィールを編集' })
    expect(fetch.keys().filter((k) => !k.startsWith('GET'))).toEqual(['DELETE /api/me/icon', 'PATCH /api/me/profile'])
  })

  it('アイコンがないときは「アイコンを外す」を出さず、画像を選んだら出す', async () => {
    renderAt('/settings/profile')
    await opened()
    expect(screen.queryByRole('button', { name: 'アイコンを外す' })).not.toBeInTheDocument()
    await user().upload(fileInput(), file('a.png'))
    expect(screen.getByRole('button', { name: 'アイコンを外す' })).toBeInTheDocument()
  })

  // TC-09-10
  it('アイコンの保存に失敗したら M-18 を出し、表示名・自己紹介は送らない', async () => {
    const fetch = renderAt('/settings/profile', {
      'PUT /api/me/icon': () => json(500, { code: 'ICON_UPLOAD_FAILED', message: M[18] }),
    })
    await opened()
    await user().upload(fileInput(), file('a.png'))
    await user().click(save())
    expect(await screen.findByRole('status')).toHaveTextContent(M[18])
    expect(fetch.keys()).not.toContain('PATCH /api/me/profile')
    // 選んだ画像は残す
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toHaveAttribute('src', 'blob:icon-1')
  })

  it('アイコンだけ保存できて表示名・自己紹介に失敗したら、保存できたアイコンを出したまま G-7 にとどまる', async () => {
    renderAt('/settings/profile', {
      'PUT /api/me/icon': () => json(200, profile({ iconUrl })),
      'PATCH /api/me/profile': () => json(500, { code: 'INTERNAL_ERROR', message: M[18] }),
    })
    await opened()
    await user().upload(fileInput(), file('a.png'))
    await user().click(save())
    expect(await screen.findByRole('status')).toHaveTextContent(M[18])
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'たろうのアイコン' })
      .map((img) => img.getAttribute('src'))).toEqual([iconUrl, iconUrl]))
  })
})

describe('アイコンの表示（PF-10）', () => {
  it('アイコンがあれば画像を出し、読めなければ頭文字の丸にする。URL が変わればまた画像を出す', async () => {
    const { rerender } = render(<Avatar displayName="たろう" iconUrl={iconUrl} size={40} />)
    const img = screen.getByRole('img', { name: 'たろうのアイコン' })
    img.dispatchEvent(new Event('error'))
    expect(await screen.findByText('た')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    rerender(<Avatar displayName="たろう" iconUrl={`${iconUrl}&new`} size={40} />)
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toBeInTheDocument()
  })
})
