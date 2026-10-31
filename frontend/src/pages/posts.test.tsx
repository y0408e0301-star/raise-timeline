import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { PostView } from '../api'
import App from '../App'
import { json, mockFetch, type Handler } from '../test/fetchMock'

// 投稿（FN-03）の画面。10 章のテストの観点のうち、画面で確かめるもの

const me = { username: 'taro_y', displayName: 'たろう', iconUrl: null }

function post(overrides: Partial<PostView> = {}): PostView {
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

// G-3 を開くとタイムラインを読む（FN-02）。ここでは「まだ投稿がありません。」になるように空にしておく（タイムラインの画面は timeline.test.tsx）
const loggedIn = {
  'GET /api/auth/me': () => json(200, me),
  'GET /api/timeline?tab=following': () => json(200, { items: [], nextCursor: null, followingCount: 1 }),
  // G-4 を開くとコメントを読む（FN-05。コメントの画面は comments.test.tsx）
  'GET /api/posts/1/comments': () => json(200, { items: [], nextCursor: null }),
}

function renderAt(path: string, routes: Record<string, Handler | Handler[]> = {}) {
  const fetch = mockFetch({ ...loggedIn, ...routes })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return fetch
}

const textbox = () => screen.findByRole('textbox', { name: '投稿の本文' })
const submitButton = () => screen.getByRole('button', { name: '投稿する' })

// 投稿フォームから 1 つ投稿し、フォームが空になる（投稿が終わる）まで待つ
async function postFromForm(body: string) {
  await userEvent.type(await textbox(), body)
  await userEvent.click(submitButton())
  await waitFor(async () => expect(await textbox()).toHaveValue(''))
}

// 「…」→「編集」で、編集中の表示にする
async function startEdit() {
  await userEvent.click(await screen.findByRole('button', { name: 'メニュー' }))
  await userEvent.click(screen.getByRole('menuitem', { name: '編集' }))
  return screen.getByRole('textbox', { name: '投稿の本文を編集' })
}

// 「…」→「削除」で、確認ダイアログを開く
async function openDelete() {
  await userEvent.click(await screen.findByRole('button', { name: 'メニュー' }))
  await userEvent.click(screen.getByRole('menuitem', { name: '削除' }))
  return screen.getByRole('alertdialog', { name: '投稿を削除' })
}

describe('投稿フォーム（W-1〜W-3）', () => {
  it('投稿すると一覧の先頭に足し、フォームを空にする', async () => {
    const fetch = renderAt('/', {
      'POST /api/posts': [() => json(201, post({ id: 1, body: '1 つ目' })), () => json(201, post({ id: 2, body: '2 つ目' }))],
    })
    expect(await screen.findByText('まだ投稿がありません。')).toBeInTheDocument()
    await postFromForm('  1 つ目 ')
    expect(await textbox()).toHaveValue('')
    await postFromForm('2 つ目')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getAllByRole('article').map((a) => within(a).getByRole('link', { name: /つ目/ }).textContent))
      .toEqual(['2 つ目', '1 つ目'])
    // 本文はトリムして multipart で送る
    const sent = fetch.calls.find((c) => c.key === 'POST /api/posts')?.init?.body
    expect(sent).toBeInstanceOf(FormData)
    expect((sent as FormData).get('body')).toBe('1 つ目')
  })

  it('残りの文字数を出し、280 文字を超えたら負の数にして押せなくする', async () => {
    renderAt('/')
    await userEvent.click(await textbox())
    expect(screen.getByText('残り 280')).toBeInTheDocument()
    await userEvent.paste('あ'.repeat(280))
    expect(screen.getByText('残り 0')).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
    await userEvent.paste('あ')
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('絵文字はコードポイントで数え、前後の空白は数えない', async () => {
    renderAt('/')
    await userEvent.click(await textbox())
    // 🇯🇵 と 👍🏽 はどちらも 2 コードポイント（API と同じ数え方）
    await userEvent.paste('  🇯🇵👍🏽\n')
    expect(screen.getByText('残り 276')).toBeInTheDocument()
  })

  it('本文が空・空白だけのときは押せない', async () => {
    renderAt('/')
    await textbox()
    expect(submitButton()).toBeDisabled()
    await userEvent.type(await textbox(), '   ')
    expect(submitButton()).toBeDisabled()
  })

  it('素早く 2 回押しても 1 つだけ投稿し、送信中は「投稿中…」にする', async () => {
    let finish: ((res: Response) => void) | undefined
    const fetch = renderAt('/', { 'POST /api/posts': () => new Promise<Response>((resolve) => { finish = resolve }) })
    await userEvent.type(await textbox(), '本文')
    const button = submitButton()
    await userEvent.dblClick(button)
    expect(button).toHaveTextContent('投稿中…')
    expect(button).toBeDisabled()
    finish?.(json(201, post({ body: '本文' })))
    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(fetch.keys().filter((k) => k === 'POST /api/posts')).toHaveLength(1)
  })

  it('Ctrl＋Enter で投稿する', async () => {
    renderAt('/', { 'POST /api/posts': () => json(201, post({ body: '本文' })) })
    await userEvent.type(await textbox(), '本文{Control>}{Enter}{/Control}')
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('失敗したら M-14 を出し、入力した本文を残す', async () => {
    renderAt('/', { 'POST /api/posts': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    await userEvent.type(await textbox(), '残る本文')
    await userEvent.click(submitButton())
    expect(await screen.findByRole('status')).toHaveTextContent('投稿に失敗しました。時間をおいてもう一度お試しください。')
    expect(await textbox()).toHaveValue('残る本文')
  })
})

describe('投稿カード（W-4・W-5・W-11）', () => {
  it('HTML の記号はそのまま文字で出し、改行もそのまま出す', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post({ body: '<script>alert(1)</script>\n2 行目' })) })
    const card = await screen.findByRole('article')
    expect(card.querySelector('script')).toBeNull()
    expect(within(card).getByText((_, el) => el?.textContent === '<script>alert(1)</script>\n2 行目')).toBeInTheDocument()
  })

  it('編集した投稿には「（編集済み）」を出し、マウスを乗せると編集した日時を出す', async () => {
    renderAt('/posts/1', {
      'GET /api/posts/1': () => json(200, post({ createdAt: '2026-10-16T06:00:00Z', editedAt: '2026-10-16T06:30:00Z' })),
    })
    expect(await screen.findByText('（編集済み）')).toHaveAttribute('title', '2026/10/16 15:30 に編集')
    expect(screen.getByText(/10月16日/)).toHaveAttribute('title', '2026/10/16 15:00')
  })

  it('他人の投稿には「…」を出さない', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post({ mine: false })) })
    await screen.findByRole('article')
    expect(screen.queryByRole('button', { name: 'メニュー' })).not.toBeInTheDocument()
  })
})

describe('編集（W-9・W-10）', () => {
  it('今の本文を入れた入力欄にし、変えていないときは「保存する」を押せない', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post({ body: '前の本文' })) })
    const editor = await startEdit()
    expect(editor).toHaveValue('前の本文')
    expect(editor).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'メニュー' })).not.toBeInTheDocument()
    const save = screen.getByRole('button', { name: '保存する' })
    expect(save).toBeDisabled()
    // 前後に空白を足しただけでも、変えていないことになる
    await userEvent.type(editor, '  ')
    expect(save).toBeDisabled()
  })

  it('保存すると本文を変えて「（編集済み）」を出す', async () => {
    const fetch = renderAt('/posts/1', {
      'GET /api/posts/1': () => json(200, post({ body: '前の本文' })),
      'PATCH /api/posts/1': () => json(200, post({ body: '新しい本文', editedAt: new Date().toISOString() })),
    })
    const editor = await startEdit()
    await userEvent.clear(editor)
    await userEvent.type(editor, ' 新しい本文 ')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(await screen.findByText('（編集済み）')).toBeInTheDocument()
    expect(screen.getByText('新しい本文')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '投稿の本文を編集' })).not.toBeInTheDocument()
    const sent = fetch.calls.find((c) => c.key === 'PATCH /api/posts/1')
    expect(JSON.parse(sent?.init?.body as string)).toEqual({ body: '新しい本文' })
  })

  it('画像のない投稿は本文を空にできず、281 文字では押せない', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post()) })
    const editor = await startEdit()
    const save = screen.getByRole('button', { name: '保存する' })
    await userEvent.clear(editor)
    expect(save).toBeDisabled()
    await userEvent.paste('い'.repeat(281))
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('「キャンセル」・Esc キーで入力した内容を捨てて元に戻す', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post({ body: '元の本文' })) })
    await userEvent.type(await startEdit(), '追加')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.getByText('元の本文')).toBeInTheDocument()
    await userEvent.type(await startEdit(), '追加{Escape}')
    expect(screen.queryByRole('textbox', { name: '投稿の本文を編集' })).not.toBeInTheDocument()
    expect(screen.getByText('元の本文')).toBeInTheDocument()
  })

  it('削除されていたら M-11 を出し、入力した本文を残す', async () => {
    renderAt('/posts/1', {
      'GET /api/posts/1': () => json(200, post()),
      'PATCH /api/posts/1': () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' }),
    })
    const editor = await startEdit()
    await userEvent.type(editor, '！')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(await screen.findByRole('status')).toHaveTextContent('この投稿は削除されました。')
    expect(editor).toHaveValue('今日は晴れ！')
  })

  it('同じ画面で編集中にできるのは 1 つだけ', async () => {
    renderAt('/', {
      'POST /api/posts': [() => json(201, post({ id: 1, body: '1 つ目' })), () => json(201, post({ id: 2, body: '2 つ目' }))],
    })
    await postFromForm('1 つ目')
    await postFromForm('2 つ目')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'メニュー' })).toHaveLength(2))
    // 上の「2 つ目」を編集中にしてから、下の「1 つ目」の「編集」を押す（編集中の投稿には「…」を出さない）
    await userEvent.click(screen.getAllByRole('button', { name: 'メニュー' })[0])
    await userEvent.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(screen.getAllByRole('button', { name: 'メニュー' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(screen.getAllByRole('textbox', { name: '投稿の本文を編集' })).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: '投稿の本文を編集' })).toHaveValue('1 つ目')
  })
})

describe('削除（W-7）', () => {
  // N-19
  it('確認ダイアログに M-10 を出し、「キャンセル」にカーソルを置く。「キャンセル」では何もしない', async () => {
    const fetch = renderAt('/', { 'POST /api/posts': () => json(201, post()) })
    await postFromForm('本文')
    const dialog = await openDelete()
    expect(dialog).toHaveTextContent('この投稿を削除しますか？画像・コメント・いいねも削除され、元に戻せません。')
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await openDelete()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('article')).toBeInTheDocument()
    expect(fetch.keys()).not.toContain('DELETE /api/posts/1')
  })

  it('「削除」で削除して一覧から消す', async () => {
    renderAt('/', { 'POST /api/posts': () => json(201, post()), 'DELETE /api/posts/1': () => json(204) })
    await postFromForm('本文')
    await userEvent.click(within(await openDelete()).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('失敗したらダイアログを閉じて M-18 を出し、投稿は残す', async () => {
    renderAt('/', {
      'POST /api/posts': () => json(201, post()),
      'DELETE /api/posts/1': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }),
    })
    await postFromForm('本文')
    await userEvent.click(within(await openDelete()).getByRole('button', { name: '削除' }))
    expect(await screen.findByRole('status')).toHaveTextContent('操作に失敗しました。時間をおいてもう一度お試しください。')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('G-4 で削除したら前の画面に戻る（直接開いたときは G-3）', async () => {
    renderAt('/posts/1', { 'GET /api/posts/1': () => json(200, post()), 'DELETE /api/posts/1': () => json(204) })
    await userEvent.click(within(await openDelete()).getByRole('button', { name: '削除' }))
    expect(await textbox()).toBeInTheDocument()
  })
})

describe('投稿の詳細（G-4、W-6・W-8）', () => {
  it('投稿カードの本文から G-4 を開き、「←」で戻る', async () => {
    renderAt('/', {
      'POST /api/posts': () => json(201, post({ body: '詳しく見る' })),
      'GET /api/posts/1': () => json(200, post({ body: '詳しく見る' })),
    })
    await postFromForm('詳しく見る')
    await userEvent.click(screen.getByRole('link', { name: '詳しく見る' }))
    expect(await screen.findByRole('heading', { name: '投稿' })).toBeInTheDocument()
    // G-4 の上では本文を押しても何もしない
    expect(await screen.findByText('詳しく見る')).not.toHaveAttribute('href')
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await textbox()).toBeInTheDocument()
  })

  it('削除された投稿を開いたら M-11 を出す', async () => {
    renderAt('/posts/9', {
      'GET /api/posts/9': () => json(404, { code: 'POST_NOT_FOUND', message: 'この投稿は削除されました。' }),
    })
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('数字でない ID も M-11 を出す（API は呼ばない）', async () => {
    const fetch = renderAt('/posts/abc')
    expect(await screen.findByText('この投稿は削除されました。')).toBeInTheDocument()
    expect(fetch.keys()).toEqual(['GET /api/auth/me'])
  })

  it('読み込みに失敗したら M-9 と「再読み込み」を出す', async () => {
    renderAt('/posts/1', {
      'GET /api/posts/1': [() => json(500, { code: 'INTERNAL_ERROR', message: '…' }), () => json(200, post())],
    })
    expect(await screen.findByText('読み込みに失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })
})
