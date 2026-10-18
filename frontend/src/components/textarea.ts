import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react'

const MAX_LINES = 10

// 本文の入力欄を、入力に合わせて最大 10 行まで高くする（画面設計書 6 章「投稿フォーム」）。
// 入力した・空にしたなど、描画のたびに高さを測り直す
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const style = getComputedStyle(el)
    const lineHeight = Number.parseFloat(style.lineHeight) || 22
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) || 0
    // box-sizing: border-box なので、高さには枠線も含める（scrollHeight は枠線を含まない）
    const border = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth) || 0
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_LINES + padding) + border}px`
  })
}

// 本文の入力欄では Enter キーで改行し、Ctrl＋Enter（macOS では ⌘＋Enter）で送る。
// 日本語入力の変換を確定するための Enter キーでは送らない（画面設計書 3.8）
export function isSubmitKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing
}

// 残りの文字数の表示（W-2）。280 文字を超えたら「-12」のように負の数だけを出す
export function remainingText(remaining: number): string {
  return remaining < 0 ? String(remaining) : `残り ${remaining}`
}
