import { injectStyles, toast } from '@yusufceng1z/ding'
import type { Theme } from './theme.ts'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading'
export type ToastLabels = { region: string; dismiss: string }

/** Creates a toast controller backed by Ding and the shared ToastViewport component. */
export function createToastController(
  resolveLabels: (lang: string) => ToastLabels = () => ({
    region: 'Notifications',
    dismiss: 'Close',
  }),
) {
  let mounted = false

  function mountToasts(lang: string, nonce = '', theme: Theme = 'dark'): void {
    const labels = resolveLabels(lang)
    if (!mounted) {
      mounted = true
      injectStyles(undefined, { nonce })
    }
    toast.configure({
      position: 'bottom-right',
      labels,
      held: 'queue',
      theme,
    })
  }

  function notify(type: ToastType, title: string, description?: string): string {
    if (!mounted) mountToasts('en')
    const options = description ? { description } : {}
    if (type === 'loading') return toast.loading(title, options)
    return toast[type](title, options)
  }

  function setToastTheme(theme: Theme): void {
    toast.configure({ theme })
  }

  return { mountToasts, notify, setToastTheme }
}
