import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FollowButton from './FollowButton'

// フォローボタンの見た目（F-2、画面設計書 3.3）。状態と送信は useFollow
describe('FollowButton', () => {
  it('フォローしていなければ「フォローする」', () => {
    render(<FollowButton following={false} onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('フォローする')
  })

  it('「フォロー中」にマウスを乗せている間だけ「フォロー解除」にする', async () => {
    render(<FollowButton following onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('フォロー中')
    await userEvent.hover(button)
    expect(button).toHaveTextContent('フォロー解除')
    await userEvent.unhover(button)
    expect(button).toHaveTextContent('フォロー中')
  })

  it('押すと onClick を呼び、マウスが乗ったままでも乗せ直すまでは「フォロー中」と出す', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<FollowButton following={false} onClick={onClick} />)
    const button = screen.getByRole('button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()

    // 呼んだ側がフォロー中にした
    rerender(<FollowButton following onClick={onClick} />)
    expect(button).toHaveTextContent('フォロー中')
    await userEvent.unhover(button)
    await userEvent.hover(button)
    expect(button).toHaveTextContent('フォロー解除')
  })
})
