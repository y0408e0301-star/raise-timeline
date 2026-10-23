// 入力の確認（機能定義書 FN-01・FN-03・FN-04・FN-09 4 章）。API でも同じことを確かめる

export const USERNAME_MAX = 15
export const DISPLAY_NAME_MAX = 30
export const PASSWORD_MAX = 64
export const POST_BODY_MAX = 280
export const BIO_MAX = 160
export const SEARCH_QUERY_MAX = 30

// 文字数は Unicode の文字（コードポイント）で数える（画面設計書 3.8）。API の数え方と同じ
export function countChars(text: string): number {
  return Array.from(text).length
}

// トリムした後の値を渡す。3〜15 文字の半角英数字と「_」
export function isValidUsername(username: string): boolean {
  return /^[A-Za-z0-9_]{3,15}$/.test(username)
}

// トリムしない。8〜64 文字の半角文字（英字・数字・記号・空白）で、英字と数字を両方含む
export function isValidPassword(password: string): boolean {
  return /^[\x20-\x7E]{8,64}$/.test(password) && /[A-Za-z]/.test(password) && /\d/.test(password)
}

// text を max 文字（コードポイント）までにし、超えた分は入力できないようにする。
// 入力欄の maxLength は UTF-16 の長さで数える（絵文字 1 文字を 2 と数える）ので使わない
export function limitChars(text: string, max: number): string {
  return countChars(text) > max ? Array.from(text).slice(0, max).join('') : text
}

// トリムした後の値を渡す。1〜30 文字
export function isValidDisplayName(displayName: string): boolean {
  const length = countChars(displayName)
  return length >= 1 && length <= DISPLAY_NAME_MAX
}

// 投稿の本文の残りの文字数（W-2）。トリムした後で数える。負の数なら送れない
export function remainingChars(body: string): number {
  return POST_BODY_MAX - countChars(body.trim())
}

// ---- 画像（FN-04 I-1〜I-3）

export const IMAGES_MAX = 4
export const IMAGE_BYTES_MAX = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp)$/i

// 画面では拡張子と File.type で確かめる。ファイルの中身（先頭のバイト）は API が確かめる
export function isAcceptableImage(file: File): boolean {
  return file.size <= IMAGE_BYTES_MAX && IMAGE_TYPES.includes(file.type) && IMAGE_EXTENSIONS.test(file.name)
}

// ---- アイコン画像（FN-09 PF-8）。GIF は使えない

export const ICON_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ICON_EXTENSIONS = /\.(jpe?g|png|webp)$/i

// 画面では拡張子と File.type で確かめる。ファイルの中身（先頭のバイト）は API が確かめる
export function isAcceptableIcon(file: File): boolean {
  return file.size <= IMAGE_BYTES_MAX && ICON_TYPES.includes(file.type) && ICON_EXTENSIONS.test(file.name)
}

// 自己紹介を 160 文字（コードポイント）までにする。161 文字目以降は入力できない（PF-6）
export function limitBio(bio: string): string {
  return limitChars(bio, BIO_MAX)
}

// 選んだ画像を今の画像の後ろに足す。添えられない画像は外し（M-13）、合わせて 5 枚以上なら先の 4 枚だけにする（M-12）
export function addImages(current: File[], picked: File[]): { images: File[], error: 'M12' | 'M13' | null } {
  const acceptable = picked.filter(isAcceptableImage)
  const all = [...current, ...acceptable]
  if (all.length > IMAGES_MAX) return { images: all.slice(0, IMAGES_MAX), error: 'M12' }
  return { images: all, error: acceptable.length < picked.length ? 'M13' : null }
}
