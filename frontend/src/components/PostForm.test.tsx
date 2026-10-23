import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockFetch, sentForm } from '../test/fetchMock'
import { post, renderComponent } from '../test/render'
import PostForm from './PostForm'

// G-3 の上の投稿フォーム（W-1〜W-3・I-1〜I-5、画面設計書 6 章）

const textbox = () => screen.getByRole('textbox', { name: '投稿の本文' })
const submit = () => screen.getByRole('button', { name: /投稿する|投稿中…/ })
const fileInput = () => screen.getByLabelText('添える画像のファイル')

function png(name: string): File {
  return new File(['x'], name, { type: 'image/png' })
}

function renderForm() {
  const onPosted = vi.fn()
  renderComponent(<PostForm onPosted={onPosted} />)
  return { onPosted }
}

beforeEach(() => {
  // jsdom には画像のプレビューの URL を作る仕組みがない
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

describe('PostForm', () => {
  it('空・空白だけでは押せず、1 文字入れると押せる', async () => {
    renderForm()
    expect(submit()).toBeDisabled()
    await userEvent.type(textbox(), '   ')
    expect(submit()).toBeDisabled()
    await userEvent.type(textbox(), 'a')
    expect(submit()).toBeEnabled()
  })

  it('残りの文字数を出し、280 文字は押せて 281 文字は負の数を出して押せない', () => {
    renderForm()
    expect(screen.getByText('残り 280')).toBeInTheDocument()
    fireEvent.change(textbox(), { target: { value: 'あ'.repeat(280) } })
    expect(screen.getByText('残り 0')).toBeInTheDocument()
    expect(submit()).toBeEnabled()
    fireEvent.change(textbox(), { target: { value: 'あ'.repeat(281) } })
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('トリムして送り、送れたらフォームを空にして投稿を渡す', async () => {
    const created = post({ id: 9, body: '今日は晴れ' })
    const fetch = mockFetch({ 'POST /api/posts': () => json(201, created) })
    const { onPosted } = renderForm()

    await userEvent.type(textbox(), '  今日は晴れ  ')
    await userEvent.click(submit())

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(created))
    expect(textbox()).toHaveValue('')
    expect(sentForm(fetch).get('body')).toBe('今日は晴れ')
  })

  it('素早く 2 回押しても 1 回だけ送り、送っている間は「投稿中…」で押せない', async () => {
    let release: (() => void) | undefined
    const fetch = mockFetch({
      'POST /api/posts': () => new Promise((resolve) => {
        release = () => resolve(json(201, post()))
      }),
    })
    renderForm()
    await userEvent.type(textbox(), '本文')
    await userEvent.dblClick(submit())

    expect(submit()).toHaveTextContent('投稿中…')
    expect(submit()).toBeDisabled()
    release?.()
    await waitFor(() => expect(textbox()).toHaveValue(''))
    expect(fetch.keys()).toEqual(['POST /api/posts'])
  })

  it('失敗したら M-14 を出し、入力した本文と画像を残す', async () => {
    mockFetch({ 'POST /api/posts': () => json(500, { code: 'IMAGE_UPLOAD_FAILED', message: '…' }) })
    const { onPosted } = renderForm()
    await userEvent.type(textbox(), '本文')
    await userEvent.upload(fileInput(), png('a.png'))
    await userEvent.click(submit())

    expect(await screen.findByText('投稿に失敗しました。時間をおいてもう一度お試しください。')).toBeInTheDocument()
    expect(textbox()).toHaveValue('本文')
    expect(screen.getByRole('img', { name: '添える画像 1' })).toBeInTheDocument()
    expect(onPosted).not.toHaveBeenCalled()
  })

  it('Ctrl＋Enter で送り、Enter だけでは改行する', async () => {
    const fetch = mockFetch({ 'POST /api/posts': () => json(201, post()) })
    renderForm()
    await userEvent.type(textbox(), '1 行目{Enter}2 行目')
    expect(fetch.keys()).toEqual([])
    expect(textbox()).toHaveValue('1 行目\n2 行目')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(fetch.keys()).toEqual(['POST /api/posts']))
  })

  it('画像があれば本文が空でも押せ、選んだ順に送る', async () => {
    const fetch = mockFetch({ 'POST /api/posts': () => json(201, post()) })
    renderForm()
    await userEvent.upload(fileInput(), [png('a.png'), png('b.png')])
    expect(submit()).toBeEnabled()
    await userEvent.click(submit())
    await waitFor(() => expect(fetch.keys()).toEqual(['POST /api/posts']))
    const images = sentForm(fetch).getAll('images') as File[]
    expect(images.map((f) => f.name)).toEqual(['a.png', 'b.png'])
  })

  it('「×」で画像を外し、4 枚になったら「画像を選ぶ」を押せない', async () => {
    renderForm()
    await userEvent.upload(fileInput(), [png('1.png'), png('2.png'), png('3.png'), png('4.png')])
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '画像 1 を外す' }))
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeEnabled()
  })

  it('5 枚以上選んだら先の 4 枚だけを添えて M-12 を出す', async () => {
    renderForm()
    await userEvent.upload(fileInput(), [1, 2, 3, 4, 5].map((n) => png(`${n}.png`)))
    expect(await screen.findByText('画像は 1 つの投稿に 4 枚までです。')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })

  it('添えられないファイルは添えずに M-13 を出す', async () => {
    renderForm()
    // accept 属性に合わないファイルも選べるようにする（ブラウザでは「すべてのファイル」で選べる）
    await userEvent.setup({ applyAccept: false }).upload(fileInput(), new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('添えられるのは 5MB までの JPEG・PNG・GIF・WebP の画像です。')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /添える画像/ })).not.toBeInTheDocument()
  })

  it('ログインしている自分のアイコンを出す', () => {
    renderComponent(<PostForm onPosted={() => {}} />, {
      auth: { me: { username: 'taro_y', displayName: 'たろう', iconUrl: 'https://s3/icons/me.png' } },
    })
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toBeInTheDocument()
  })
})
