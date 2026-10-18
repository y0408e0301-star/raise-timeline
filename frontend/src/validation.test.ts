import { describe, expect, it } from 'vitest'
import { isValidDisplayName, isValidPassword, isValidUsername } from './validation'

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
