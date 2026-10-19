import { describe, expect, it } from 'vitest'
import { addImages, isAcceptableImage, isValidDisplayName, isValidPassword, isValidUsername } from './validation'

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
})

function file(name: string, type: string, size = 10): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('isAcceptableImage', () => {
  it('JPEG・PNG・GIF・WebP で 5MB までなら添えられる', () => {
    expect(isAcceptableImage(file('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isAcceptableImage(file('a.JPEG', 'image/jpeg'))).toBe(true)
    expect(isAcceptableImage(file('a.png', 'image/png', 5 * 1024 * 1024))).toBe(true)
    expect(isAcceptableImage(file('a.gif', 'image/gif'))).toBe(true)
    expect(isAcceptableImage(file('a.webp', 'image/webp'))).toBe(true)
  })

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

  it('合わせて 5 枚以上なら先の 4 枚だけにして M-12', () => {
    const files = [1, 2, 3, 4, 5].map(png)
    expect(addImages(files.slice(0, 3), files.slice(3))).toEqual({ images: files.slice(0, 4), error: 'M12' })
  })

  it('添えられない画像は外して M-13', () => {
    const ok = png(1)
    expect(addImages([], [ok, file('a.pdf', 'application/pdf')])).toEqual({ images: [ok], error: 'M13' })
  })
})
