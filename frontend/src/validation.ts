// 入力の確認（機能定義書 FN-01 4 章）。API でも同じことを確かめる

export const USERNAME_MAX = 15
export const DISPLAY_NAME_MAX = 30
export const PASSWORD_MAX = 64

// トリムした後の値を渡す。3〜15 文字の半角英数字と「_」
export function isValidUsername(username: string): boolean {
  return /^[A-Za-z0-9_]{3,15}$/.test(username)
}

// トリムしない。8〜64 文字の半角文字（英字・数字・記号・空白）で、英字と数字を両方含む
export function isValidPassword(password: string): boolean {
  return /^[\x20-\x7E]{8,64}$/.test(password) && /[A-Za-z]/.test(password) && /\d/.test(password)
}

// トリムした後の値を渡す。1〜30 文字
export function isValidDisplayName(displayName: string): boolean {
  return displayName.length >= 1 && displayName.length <= DISPLAY_NAME_MAX
}
