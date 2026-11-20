import { ref, watch, type Ref, type CSSProperties } from 'vue'

export function useDropdownPosition(
  trigger: Ref<HTMLElement | null>,
  panel: Ref<HTMLElement | null>,
  open: Ref<boolean>,
  matchWidth = false,
) {
  const position = ref<CSSProperties>({})
  function update() {
    if (!open.value || !trigger.value || !panel.value) return
    const anchor = trigger.value.getBoundingClientRect()
    const bounds = panel.value.getBoundingClientRect()
    const margin = 8
    const gap = 4
    const width = Math.min(matchWidth ? anchor.width : bounds.width, window.innerWidth - margin * 2)
    const below = window.innerHeight - anchor.bottom - margin - gap
    const above = anchor.top - margin - gap
    const limit = matchWidth ? 192 : window.innerHeight - margin * 2
    const upwards = below < Math.min(panel.value.scrollHeight, limit) && above > below
    const maxHeight = Math.max(0, Math.min(limit, upwards ? above : below))
    const height = Math.min(panel.value.scrollHeight, maxHeight)
    const left = matchWidth ? anchor.left : anchor.right - width
    position.value = {
      left: `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`,
      top: `${Math.max(margin, upwards ? anchor.top - gap - height : anchor.bottom + gap)}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
    }
  }
  watch(
    open,
    (isOpen, _, onCleanup) => {
      if (!isOpen) return
      update()
      window.addEventListener('resize', update)
      window.addEventListener('scroll', update, true)
      onCleanup(() => {
        window.removeEventListener('resize', update)
        window.removeEventListener('scroll', update, true)
      })
    },
    { flush: 'post' },
  )
  return position
}
