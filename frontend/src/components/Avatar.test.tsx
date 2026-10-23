import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

// ユーザーを表す丸（画面設計書 3.11、FN-09 PF-10）
describe('Avatar', () => {
  it('アイコンがあれば画像を出す', () => {
    render(<Avatar displayName="たろう" iconUrl="https://s3/icons/a.png" size={40} />)
    expect(screen.getByRole('img', { name: 'たろうのアイコン' })).toHaveAttribute('src', 'https://s3/icons/a.png')
  })

  it('アイコンがなければ表示名の 1 文字目を出す', () => {
    const { container } = render(<Avatar displayName="たろう" iconUrl={null} size={40} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container).toHaveTextContent('た')
  })

  it('1 文字目が絵文字でも 1 文字として出す', () => {
    const { container } = render(<Avatar displayName="😀たろう" iconUrl={null} size={40} />)
    expect(container.textContent).toBe('😀')
  })

  it('画像を読めなかったら 1 文字目に替え、URL が変わったらまた画像を出す', () => {
    const { container, rerender } = render(<Avatar displayName="たろう" iconUrl="https://s3/icons/old.png" size={40} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container).toHaveTextContent('た')

    rerender(<Avatar displayName="たろう" iconUrl="https://s3/icons/new.png" size={40} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3/icons/new.png')
  })

  it('大きさに合わせて丸と文字の大きさを決める', () => {
    const { container } = render(<Avatar displayName="たろう" iconUrl={null} size={80} />)
    expect(container.firstChild).toHaveStyle({ width: '80px', height: '80px', fontSize: '32px' })
  })
})
