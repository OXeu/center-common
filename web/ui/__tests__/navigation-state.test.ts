import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { useToastHost } from '../../../ui/toast-host.ts'
import { navigateDocument } from '../../../ui/navigation.ts'

afterEach(() => vi.unstubAllGlobals())

it('isolates toast ownership by application and does not detach a newer dialog', () => {
  const first = createPinia()
  const second = createPinia()
  try {
    const host = useToastHost(first)
    const other = useToastHost(second)
    const oldDialog = document.createElement('dialog')
    const newDialog = document.createElement('dialog')
    const releaseOld = host.attach(oldDialog)
    expect(host.target).toBe(oldDialog)
    expect(other.target).toBe('body')
    const releaseNew = host.attach(newDialog)
    releaseOld()
    expect(host.target).toBe(newDialog)
    releaseNew()
    expect(host.target).toBe('body')
  } finally {
    disposePinia(first)
    disposePinia(second)
  }
})

it('preserves server-authorized callback schemes and requires an explicit handoff reason', () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { assign })
  const callback = 'cursor://anysphere.cursor-mcp/oauth/callback?code=fixture'
  navigateDocument(callback, 'oauth-consent')
  expect(assign).toHaveBeenCalledWith(callback)
  expect(() => navigateDocument('/projects', '')).toThrow('explicit reason')
  expect(assign).toHaveBeenCalledTimes(1)
})
