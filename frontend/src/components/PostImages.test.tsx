import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PostImage } from '../api'
import { json, mockFetch, sentJson } from '../test/fetchMock'
import { ToastProvider } from './ToastProvider'
import PostImages from './PostImages'

// 投稿カードの画像（画面設計書 3.7、FN-04 I-6〜I-8）。15 分で切れる署名付き URL の取り直し

const future = '2999-01-01T00:00:00Z'
const past = '2000-01-01T00:00:00Z'

const image = (id: number, expiresAt = future, url = `https://s3/old/${id}.png`): PostImage => ({ id, url, expiresAt })

function renderImages(images: PostImage[]) {
  return render(<ToastProvider><PostImages images={images} /></ToastProvider>)
}

const cells = () => screen.getAllByRole('button', { name: /を拡大/ })
const thumbnails = () => cells().map((cell) => cell.querySelector('img')!)

describe('PostImages', () => {
  it('画像がなければ何も出さない', () => {
    const { container } = renderImages([])
    expect(container).toBeEmptyDOMElement()
  })

  it('選んだ順に並べ、何枚目かを読み上げる', () => {
    renderImages([image(1), image(2), image(3)])
    expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['画像 1 / 3 を拡大', '画像 2 / 3 を拡大', '画像 3 / 3 を拡大'])
    expect(thumbnails().map((img) => img.getAttribute('src'))).toEqual(
      ['https://s3/old/1.png', 'https://s3/old/2.png', 'https://s3/old/3.png'])
  })

  it('押すと G-10 でその画像を大きく出す', async () => {
    renderImages([image(1), image(2)])
    await userEvent.click(cells()[1])
    expect(screen.getByRole('dialog', { name: '画像の拡大' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '画像 2 / 2' })).toBeInTheDocument()
  })

  // TC-04-9
  it('読み込めなければ URL を取り直し、同時にいくつ失敗しても送るのは 1 回だけ', async () => {
    const fetch = mockFetch({
      'POST /api/images/urls': () => json(200, { items: [image(1, future, 'https://s3/new/1.png'), image(2, future, 'https://s3/new/2.png')] }),
    })
    renderImages([image(1), image(2)])
    thumbnails().forEach((img) => fireEvent.error(img))

    await waitFor(() => expect(thumbnails()[0]).toHaveAttribute('src', 'https://s3/new/1.png'))
    expect(thumbnails()[1]).toHaveAttribute('src', 'https://s3/new/2.png')
    expect(fetch.keys()).toEqual(['POST /api/images/urls'])
    expect(sentJson(fetch)).toEqual({ imageIds: [1, 2] })
  })

  it('取り直しの結果に入っていない画像があれば（削除された）、「画像を読み込めませんでした」を出す', async () => {
    mockFetch({ 'POST /api/images/urls': () => json(200, { items: [image(1)] }) })
    renderImages([image(1), image(2)])
    fireEvent.error(thumbnails()[0])
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
  })

  it('取り直しに失敗したら「画像を読み込めませんでした」を出す', async () => {
    mockFetch({ 'POST /api/images/urls': () => json(500, { code: 'INTERNAL_ERROR', message: '…' }) })
    renderImages([image(1)])
    fireEvent.error(thumbnails()[0])
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
  })

  // TC-04-10
  it('取り直した期限内の URL でも読み込めなければ、もう取り直さない', async () => {
    const fetch = mockFetch({ 'POST /api/images/urls': () => json(200, { items: [image(1, future, 'https://s3/new/1.png')] }) })
    renderImages([image(1)])
    fireEvent.error(thumbnails()[0])
    await waitFor(() => expect(thumbnails()[0]).toHaveAttribute('src', 'https://s3/new/1.png'))

    fireEvent.error(thumbnails()[0])
    expect(await screen.findByText('画像を読み込めませんでした')).toBeInTheDocument()
    expect(fetch.keys()).toHaveLength(1)
  })

  // TC-04-8
  it('期限の切れた画像は、G-10 を開く前に取り直す', async () => {
    const fetch = mockFetch({ 'POST /api/images/urls': () => json(200, { items: [image(1, future, 'https://s3/new/1.png')] }) })
    renderImages([image(1, past)])
    await userEvent.click(cells()[0])
    expect(await screen.findByRole('img', { name: '画像 1 / 1' })).toHaveAttribute('src', 'https://s3/new/1.png')
    expect(fetch.keys()).toEqual(['POST /api/images/urls'])
  })

  it('投稿が読み直されて画像が変わったら、初めの URL に戻す', async () => {
    mockFetch({ 'POST /api/images/urls': () => json(200, { items: [image(1, future, 'https://s3/new/1.png')] }) })
    const { rerender } = renderImages([image(1)])
    fireEvent.error(thumbnails()[0])
    await waitFor(() => expect(thumbnails()[0]).toHaveAttribute('src', 'https://s3/new/1.png'))

    rerender(<ToastProvider><PostImages images={[image(1, future, 'https://s3/reloaded/1.png')]} /></ToastProvider>)
    expect(thumbnails()[0]).toHaveAttribute('src', 'https://s3/reloaded/1.png')
  })
})
