import { describe, expect, it } from 'vitest'
import {
  addImages, countChars, isAcceptableIcon, isAcceptableImage, isValidDisplayName, isValidPassword, isValidUsername,
  limitBio, limitChars, remainingChars,
} from './validation'

// 文字数の数え方（画面設計書 3.8）。API と同じくコードポイントで数える
describe('countChars', () => {
  it('絵文字・漢字も 1 文字と数える', () => {
    expect(countChars('')).toBe(0)
    expect(countChars('abc')).toBe(3)
    expect(countChars('今日は晴れ')).toBe(5)
    // 「😀」は JavaScript の文字列では長さ 2（サロゲートペア）
    expect('😀'.length).toBe(2)
    expect(countChars('😀😀')).toBe(2)
  })

  it('改行も 1 文字と数える', () => {
    expect(countChars('a\nb')).toBe(3)
  })
})

describe('remainingChars', () => {
  it('280 文字から、トリムした本文の文字数を引く', () => {
    expect(remainingChars('')).toBe(280)
    expect(remainingChars('  今日は晴れ \n')).toBe(275)
    expect(remainingChars('😀'.repeat(280))).toBe(0)
    expect(remainingChars('あ'.repeat(281))).toBe(-1)
  })
})

// FN-01 10 章のテストの観点
describe('isValidUsername', () => {
  it('3〜15 文字の半角英数字と「_」', () => {
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('abc')).toBe(true)
    expect(isValidUsername('a'.repeat(15))).toBe(true)
    expect(isValidUsername('a'.repeat(16))).toBe(false)
    expect(isValidUsername('Taro_1')).toBe(true)
    expect(isValidUsername('taro-y')).toBe(false)
    expect(isValidUsername('たろう')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('8〜64 文字の半角文字で、英字と数字を両方含む', () => {
    expect(isValidPassword('passwo1')).toBe(false)
    expect(isValidPassword('passwor1')).toBe(true)
    expect(isValidPassword(`1${'a'.repeat(63)}`)).toBe(true)
    expect(isValidPassword(`1${'a'.repeat(64)}`)).toBe(false)
    expect(isValidPassword('password')).toBe(false)
    expect(isValidPassword('12345678')).toBe(false)
    expect(isValidPassword('passwor1あ')).toBe(false)
    // 前後の空白も取り除かずにそのまま使う
    expect(isValidPassword(' pass word1 ')).toBe(true)
  })
})

describe('isValidDisplayName', () => {
  it('1〜30 文字', () => {
    expect(isValidDisplayName('')).toBe(false)
    expect(isValidDisplayName('た')).toBe(true)
    expect(isValidDisplayName('あ'.repeat(30))).toBe(true)
    expect(isValidDisplayName('あ'.repeat(31))).toBe(false)
  })

  it('絵文字も 1 文字と数える（API と同じ。Issue #56）', () => {
    expect(isValidDisplayName('😀'.repeat(30))).toBe(true)
    expect(isValidDisplayName('😀'.repeat(31))).toBe(false)
  })
})

describe('limitChars', () => {
  it('上限までの文字（コードポイント）だけを残す', () => {
    expect(limitChars('あ'.repeat(30), 30)).toBe('あ'.repeat(30))
    expect(limitChars('あ'.repeat(31), 30)).toBe('あ'.repeat(30))
    // 絵文字を途中で切らない
    expect(limitChars('😀'.repeat(31), 30)).toBe('😀'.repeat(30))
    expect(limitChars('', 30)).toBe('')
  })
})

function file(name: string, type: string, size = 10): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('isAcceptableImage', () => {
  // TC-04-2
  it('JPEG・PNG・GIF・WebP で 5MB までなら添えられる', () => {
    expect(isAcceptableImage(file('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isAcceptableImage(file('a.JPEG', 'image/jpeg'))).toBe(true)
    expect(isAcceptableImage(file('a.png', 'image/png', 5 * 1024 * 1024))).toBe(true)
    expect(isAcceptableImage(file('a.gif', 'image/gif'))).toBe(true)
    expect(isAcceptableImage(file('a.webp', 'image/webp'))).toBe(true)
  })

  // TC-04-2
  it('5MB を超える・形式や拡張子が違うものは添えられない', () => {
    expect(isAcceptableImage(file('a.png', 'image/png', 5 * 1024 * 1024 + 1))).toBe(false)
    expect(isAcceptableImage(file('a.bmp', 'image/bmp'))).toBe(false)
    expect(isAcceptableImage(file('a.jpg', 'text/plain'))).toBe(false)
    expect(isAcceptableImage(file('a.txt', 'image/png'))).toBe(false)
  })
})

const png = (n: number) => file(`${n}.png`, 'image/png')

describe('addImages', () => {
  it('今の画像の後ろに足す', () => {
    const [a, b, c] = [png(1), png(2), png(3)]
    expect(addImages([a], [b, c])).toEqual({ images: [a, b, c], error: null })
  })

  // TC-04-1
  it('合わせて 5 枚以上なら先の 4 枚だけにして M-12', () => {
    const files = [1, 2, 3, 4, 5].map(png)
    expect(addImages(files.slice(0, 3), files.slice(3))).toEqual({ images: files.slice(0, 4), error: 'M12' })
  })

  it('添えられない画像は外して M-13', () => {
    const ok = png(1)
    expect(addImages([], [ok, file('a.pdf', 'application/pdf')])).toEqual({ images: [ok], error: 'M13' })
  })

  it('ちょうど 4 枚ならエラーにしない', () => {
    const files = [1, 2, 3, 4].map(png)
    expect(addImages(files.slice(0, 2), files.slice(2))).toEqual({ images: files, error: null })
  })

  it('添えられない画像を外した後でも 5 枚以上なら M-12 を優先する', () => {
    const files = [1, 2, 3, 4, 5].map(png)
    const result = addImages(files.slice(0, 3), [files[3], file('a.pdf', 'application/pdf'), files[4]])
    expect(result).toEqual({ images: files.slice(0, 4), error: 'M12' })
  })

  it('添えられない画像だけを選んだら、今の画像はそのままで M-13', () => {
    const current = [png(1)]
    expect(addImages(current, [file('a.pdf', 'application/pdf')])).toEqual({ images: current, error: 'M13' })
  })
})

// FN-09 10 章のテストの観点
describe('isAcceptableIcon', () => {
  it('5MB までの JPEG・PNG・WebP。GIF は使えない', () => {
    expect(isAcceptableIcon(file('a.jpg', 'image/jpeg', 5 * 1024 * 1024))).toBe(true)
    expect(isAcceptableIcon(file('a.PNG', 'image/png'))).toBe(true)
    expect(isAcceptableIcon(file('a.webp', 'image/webp'))).toBe(true)
    expect(isAcceptableIcon(file('a.png', 'image/png', 5 * 1024 * 1024 + 1))).toBe(false)
    expect(isAcceptableIcon(file('a.gif', 'image/gif'))).toBe(false)
    expect(isAcceptableIcon(file('a.txt', 'image/png'))).toBe(false)
  })
})

describe('limitBio', () => {
  it('160 文字（コードポイント）を超えた分を切る', () => {
    expect(limitBio('あ'.repeat(160))).toBe('あ'.repeat(160))
    expect(limitBio('😀'.repeat(161))).toBe('😀'.repeat(160))
    expect(limitBio('1 行目\n2 行目')).toBe('1 行目\n2 行目')
  })
})
