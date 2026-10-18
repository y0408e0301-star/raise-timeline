import { createContext, useContext } from 'react'

// トースト（画面設計書 3.4）を出す。M-12・M-13・M-14・M-18 に使う
export const ToastContext = createContext<((message: string) => void) | null>(null)

export function useToast(): (message: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('ToastProvider の中で使ってください')
  return show
}
