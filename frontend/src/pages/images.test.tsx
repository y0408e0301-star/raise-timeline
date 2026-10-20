import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostImage, PostView } from '../api'
import App from '../App'
import { M } from '../messages'
import { json, mockFetch, type Handler } from '../test/fetchMock'

// 画像（FN-04）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

const later = () => new Date(Date.now() + 15 * 60 * 1000).toISOString()

function image(id: number, overrides: Partial<PostImage> = {}): PostImage {
  return { id, url: `https://s3.example/posts/${id}.png?sig=1`, expiresAt: later(), ...overrides }
}

function post(id: number, images: PostImage[], overrides: Partial<PostView> = {}): PostView {
  return {
    id,
    author: me,
    body: `投稿 ${id}`,
    images,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    mine: true,
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...overrides,
  }
}

function renderHome(items: PostView[], routes: Record<string, Handler | Handler[]> = {}) {
  const fetch = mockFetch({
    'GET /api/auth/me': () => json(200, me),
    'GET /api/timeline?tab=all': () => json(200, { items, nextCursor: null }),
    ...routes,
  })
  render(<MemoryRouter initialEntries={['/?tab=all']}><App /></MemoryRouter>)
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
const fileInput = () => screen.getByLabelText<HTMLInputElement>('添える画像のファイル')
const previews = () => screen.queryAllByRole('img', { name: /^添える画像 / })
const toast = () => screen.findByRole('status')

beforeEach(() => {
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:preview-${++n}`),
    revokeObjectURL: vi.fn(),
  }))
})

describe('投稿フォームの画像（I-1〜I-5）', () => {
  it('選んだ画像をプレビューに並べ、「×」で外せる。4 枚選ぶと「画像を選ぶ」を押せない', async () => {
    renderHome([])
    await screen.findByText('まだ投稿がありません。')
    await user().upload(fileInput(), [file('a.png'), file('b.jpg', 'image/jpeg')])
    expect(previews()).toHaveLength(2)
    await user().upload(fileInput(), [file('c.gif', 'image/gif'), file('d.webp', 'image/webp')])
    expect(previews()).toHaveLength(4)
    expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '画像 2 を外す' }))
    expect(previews()).toHaveLength(3)
    expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeEnabled()
  })

  it('合わせて 5 枚以上選んだら、先に選んだ 4 枚だけを添えて M-12 を出す', async () => {
    renderHome([])
    await screen.findByText('まだ投稿がありません。')
    await user().upload(fileInput(), ['1', '2', '3', '4', '5', '6'].map((n) => file(`${n}.png`)))
    expect(previews()).toHaveLength(4)
    expect(await toast()).toHaveTextContent(M[12])
  })

  it('5MB を超える画像・形式の違うファイルは添えずに M-13 を出す。5MB ちょうどは添えられる', async () => {
    renderHome([])
    await screen.findByText('まだ投稿がありません。')
    await user().upload(fileInput(), [file('ok.png', 'image/png', 5 * 1024 * 1024), file('big.png', 'image/png', 5 * 1024 * 1024 + 1)])
    expect(previews()).toHaveLength(1)
    expect(await toast()).toHaveTextContent(M[13])

    await user().upload(fileInput(), [file('doc.pdf', 'application/pdf'), file('fake.jpg', 'text/plain')])
    expect(previews()).toHaveLength(1)
  })

  it('画像だけで投稿でき、画像は選んだ順に送る。投稿したらフォームを空にする', async () => {
    const fetch = renderHome([], { 'POST /api/posts': () => json(201, post(1, [image(1), image(2)], { body: '' })) })
    await screen.findByText('まだ投稿がありません。')
    const submit = screen.getByRole('button', { name: '投稿する' })
    expect(submit).toBeDisabled()
    await user().upload(fileInput(), [file('first.png'), file('second.jpg', 'image/jpeg')])
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() => expect(previews()).toHaveLength(0))
    const sent = fetch.calls.find((c) => c.key === 'POST /api/posts')?.init?.body as FormData
    expect(sent.get('body')).toBe('')
    expect((sent.getAll('images') as File[]).map((f) => f.name)).toEqual(['first.png', 'second.jpg'])
    expect(await screen.findAllByRole('button', { name: /を拡大$/ })).toHaveLength(2)
  })

  it('投稿に失敗したら M-14 を出し、本文と画像を残す', async () => {
    renderHome([], { 'POST /api/posts': () => json(500, { code: 'IMAGE_UPLOAD_FAILED', message: M[14] }) })
    await screen.findByText('まだ投稿がありません。')
    await userEvent.type(screen.getByRole('textbox', { name: '投稿の本文' }), '写真')
    await user().upload(fileInput(), [file('a.png')])
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await toast()).toHaveTextContent(M[14])
    expect(previews()).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: '投稿の本文' })).toHaveValue('写真')
  })
})

describe('投稿カードの画像と G-10（I-6・I-7）', () => {
  it('画像を選んだ順に並べ、押すと G-10 で大きく出す。矢印キー・「‹」「›」で切り替え、Esc キーで閉じる', async () => {
    renderHome([post(1, [image(11), image(12), image(13)])])
    const cells = await screen.findAllByRole('button', { name: /を拡大$/ })
    expect(cells.map((c) => c.getAttribute('aria-label')))
      .toEqual(['画像 1 / 3 を拡大', '画像 2 / 3 を拡大', '画像 3 / 3 を拡大'])

    await userEvent.click(cells[1])
    const dialog = screen.getByRole('dialog', { name: '画像の拡大' })
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', image(12).url)
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '閉じる' })).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '前の画像' }))
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('1 枚のときは「‹」「›」と枚数を出さない。「×」・画像の外側のクリックで閉じる', async () => {
    renderHome([post(1, [image(11)])])
    await userEvent.click(await screen.findByRole('button', { name: '画像 1 / 1 を拡大' }))
    const dialog = screen.getByRole('dialog', { name: '画像の拡大' })
    expect(within(dialog).queryByRole('button', { name: '次の画像' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('1 / 1')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '画像 1 / 1 を拡大' }))
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('URL の取り直し（I-8）', () => {
  it('画像を読み込めなかったら新しい URL を取り直して出す', async () => {
    const fetch = renderHome([post(1, [image(11), image(12)])], {
      'POST /api/images/urls': () => json(200, { items: [image(11, { url: 'https://s3.example/new-11' }), image(12, { url: 'https://s3.example/new-12' })] }),
    })
    const cells = await screen.findAllByRole('button', { name: /を拡大$/ })
    fireEvent.error(cells[0].querySelector('img')!)
    await waitFor(() => expect(cells[0].querySelector('img')).toHaveAttribute('src', 'https://s3.example/new-11'))
    expect(cells[1].querySelector('img')).toHaveAttribute('src', 'https://s3.example/new-12')
    const sent = fetch.calls.find((c) => c.key === 'POST /api/images/urls')?.init?.body
    expect(JSON.parse(sent as string)).toEqual({ imageIds: [11, 12] })
  })

  it('同じ投稿の画像がいくつ同時に読み込めなくても、取り直しは 1 回だけ送る', async () => {
    const fetch = renderHome([post(1, [image(11), image(12), image(13), image(14)])], {
      'POST /api/images/urls': () => json(200, { items: [11, 12, 13, 14].map((id) => image(id, { url: `https://s3.example/new-${id}` })) }),
    })
    const cells = await screen.findAllByRole('button', { name: /を拡大$/ })
    cells.forEach((cell) => fireEvent.error(cell.querySelector('img')!))
    await waitFor(() => expect(cells[3].querySelector('img')).toHaveAttribute('src', 'https://s3.example/new-14'))
    expect(fetch.calls.filter((c) => c.key === 'POST /api/images/urls')).toHaveLength(1)
  })

  it('取り直した URL でも読み込めなければ、もう取り直さずに「画像を読み込めませんでした」を出す', async () => {
    const fetch = renderHome([post(1, [image(11)])], {
      'POST /api/images/urls': () => json(200, { items: [image(11, { url: 'https://s3.example/new-11' })] }),
    })
    const cell = await screen.findByRole('button', { name: '画像 1 / 1 を拡大' })
    fireEvent.error(cell.querySelector('img')!)
    await waitFor(() => expect(cell.querySelector('img')).toHaveAttribute('src', 'https://s3.example/new-11'))
    fireEvent.error(cell.querySelector('img')!)
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
    expect(fetch.calls.filter((c) => c.key === 'POST /api/images/urls')).toHaveLength(1)
  })

  it('取り直した URL の期限も切れていれば、また取り直す', async () => {
    const expired = new Date(Date.now() - 1000).toISOString()
    const fetch = renderHome([post(1, [image(11)])], {
      'POST /api/images/urls': [
        () => json(200, { items: [image(11, { url: 'https://s3.example/new-11', expiresAt: expired })] }),
        () => json(200, { items: [image(11, { url: 'https://s3.example/newer-11' })] }),
      ],
    })
    const cell = await screen.findByRole('button', { name: '画像 1 / 1 を拡大' })
    fireEvent.error(cell.querySelector('img')!)
    await waitFor(() => expect(cell.querySelector('img')).toHaveAttribute('src', 'https://s3.example/new-11'))
    fireEvent.error(cell.querySelector('img')!)
    await waitFor(() => expect(cell.querySelector('img')).toHaveAttribute('src', 'https://s3.example/newer-11'))
    expect(fetch.calls.filter((c) => c.key === 'POST /api/images/urls')).toHaveLength(2)
  })

  it('取り直しの結果に入っていない（削除された）画像があれば、「画像を読み込めませんでした」を出す', async () => {
    renderHome([post(1, [image(11), image(12)])], {
      'POST /api/images/urls': () => json(200, { items: [image(11, { url: 'https://s3.example/new-11' })] }),
    })
    const cells = await screen.findAllByRole('button', { name: /を拡大$/ })
    fireEvent.error(cells[1].querySelector('img')!)
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
  })

  it('期限が切れていたら、G-10 を開く前に取り直す', async () => {
    const expired = new Date(Date.now() - 1000).toISOString()
    renderHome([post(1, [image(11, { expiresAt: expired })])], {
      'POST /api/images/urls': () => json(200, { items: [image(11, { url: 'https://s3.example/new-11' })] }),
    })
    await userEvent.click(await screen.findByRole('button', { name: '画像 1 / 1 を拡大' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://s3.example/new-11')
  })

  it('取り直しに失敗したら「画像を読み込めませんでした」を出す', async () => {
    renderHome([post(1, [image(11)])], {
      'POST /api/images/urls': () => json(500, { code: 'INTERNAL_ERROR', message: M[18] }),
    })
    const cell = await screen.findByRole('button', { name: '画像 1 / 1 を拡大' })
    fireEvent.error(cell.querySelector('img')!)
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
  })
})
