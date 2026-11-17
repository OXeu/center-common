import { computed, onMounted, onUnmounted, ref } from 'vue'

export type Theme = 'light' | 'dark'

function validTheme(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}

function savedTheme(storageKey: string): Theme | null {
  try {
    return validTheme(window.localStorage.getItem(storageKey))
  } catch {
    return null
  }
}

/** Manages the saved theme and follows system changes until a choice is made. */
export function useTheme(storageKey: string) {
  const preference = ref(savedTheme(storageKey))
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const systemDark = ref(media?.matches ?? false)
  const theme = computed(() => preference.value ?? (systemDark.value ? 'dark' : 'light'))

  function systemChanged(event: MediaQueryListEvent): void {
    systemDark.value = event.matches
  }
  function storageChanged(event: StorageEvent): void {
    if (event.key === storageKey || event.key === null) preference.value = savedTheme(storageKey)
  }
  function toggleTheme(): void {
    preference.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      window.localStorage.setItem(storageKey, preference.value)
    } catch {
      // Browsers may deny storage; the current page still keeps the chosen theme.
    }
  }
  onMounted(() => {
    media?.addEventListener('change', systemChanged)
    window.addEventListener('storage', storageChanged)
  })
  onUnmounted(() => {
    media?.removeEventListener('change', systemChanged)
    window.removeEventListener('storage', storageChanged)
  })
  return { theme, toggleTheme }
}
