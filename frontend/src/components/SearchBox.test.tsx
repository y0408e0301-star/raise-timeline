import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderComponent } from '../test/render'
import SearchBox from './SearchBox'

// ヘッダーの検索欄（FN-08 S-1・S-2・S-5、画面設計書 3.6）

const input = () => screen.getByRole('searchbox', { name: 'ユーザーを検索する文字' })
const location = () => screen.getByRole('status', { name: '今の URL' })

describe('SearchBox', () => {
  it('Enter キーで、トリムした検索語の G-9 を開く', async () => {
    renderComponent(<SearchBox initialQuery="" autoFocus={false} className="" />)
    await userEvent.type(input(), '  たろう {Enter}')
    expect(location()).toHaveTextContent('/search?q=%E3%81%9F%E3%82%8D%E3%81%86')
  })

  it('虫めがねのボタンでも開く', async () => {
    renderComponent(<SearchBox initialQuery="" autoFocus={false} className="" />)
    await userEvent.type(input(), 'taro')
    await userEvent.click(screen.getByRole('button', { name: '検索' }))
    expect(location()).toHaveTextContent('/search?q=taro')
  })

  it('空白だけなら何もしない', async () => {
    renderComponent(<SearchBox initialQuery="" autoFocus={false} className="" />, { path: '/users/hanako' })
    await userEvent.type(input(), '   {Enter}')
    expect(location()).toHaveTextContent('/users/hanako')
  })

  it('30 文字までしか入力できない', async () => {
    renderComponent(<SearchBox initialQuery="" autoFocus={false} className="" />)
    expect(input()).toHaveAttribute('maxLength', '30')
  })

  it('G-9 では検索した文字を入れておき、指定されたら入力欄にカーソルを置く', () => {
    renderComponent(<SearchBox initialQuery="たろう" autoFocus className="" />)
    expect(input()).toHaveValue('たろう')
    expect(input()).toHaveFocus()
  })
})
