import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { api, createApi, timeOnly } from '../../../ui/http.ts'
import { createCopyFactory, interpolateMessage } from '../../../ui/i18n.ts'
import { describeError } from '../../../ui/errors.ts'
import { createDangerAction } from '../../../ui/danger.ts'
import { createToastController } from '../../../ui/toast.ts'
import { createPageFactory } from '../../../ui/page.ts'
import {
  addScopeDraft,
  excludeScopeDraft,
  limitScopePermissions,
  permissionsForScope,
  type ScopeFormState,
} from '../../../ui/form-base.ts'
import { checkFormFeedback, formFeedback } from '../../../tools/oxlint/form-feedback.ts'
import DangerActions from '../../../ui/DangerActions.vue'
import ToastViewport from '../../../ui/ToastViewport.vue'
import ModalDialog from '../../../ui/ModalDialog.vue'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('shared UI helpers and components', () => {
  it('formats timestamps, messages and structured API errors', () => {
    expect(timeOnly('0001-01-01T00:00:00Z')).toBe('')
    expect(timeOnly(null)).toBe('')
    expect(timeOnly('2026-04-01T12:34:56Z')).not.toBe('')
    expect(interpolateMessage('Hello {{.name}} and {{other}}', { name: 'A', other: 'B' })).toBe(
      'Hello A and B',
    )

    const createCopy = createCopyFactory({
      en: {
        'error.title': 'Error',
        'error.notFound': 'Item not found',
        'error.network': 'Network failure',
        'authError.invalid_code': 'Invalid verification code',
      },
    })
    const { msg } = createCopy('en')
    expect(describeError(msg, new Error('missing', { cause: 404 }))).toBe('Item not found')
    expect(describeError(msg, new Error('offline'))).toBe('Network failure')
    expect(
      describeError(msg, new Error('invalid_code', { cause: 400 }), {
        knownCodes: ['invalid_code'],
      }),
    ).toBe('Invalid verification code')

    const notified: [string, string][] = []
    const createPage = createPageFactory({
      createCopy,
      describeError,
      notifyError: (title, desc) => notified.push([title, desc]),
    })
    const page = createPage({ lang: 'en', csrf: 'token-1' })
    page.report(new Error('missing', { cause: 404 }))
    expect(notified).toEqual([['Error', 'Item not found']])
  })

  it('sends CSRF headers via createApi and manages scope drafts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"error":"denied"}', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const authApi = createApi({ 'X-Authcenter-Request': '1' })
    await expect(
      authApi('/api/items', { method: 'POST', csrf: 'c1', body: { a: 1 } }),
    ).resolves.toEqual({ ok: true })
    await expect(api('/api/items')).rejects.toThrow('denied')

    const state: ScopeFormState = {
      busy: false,
      scopes: [],
      scopeProjects: [
        { value: '*', label: 'All' },
        { value: 'app', label: 'App' },
      ],
      scopePermissions: [
        { value: 'read', label: 'Read' },
        { value: 'admin', label: 'Admin' },
      ],
      globalPermissions: ['admin'],
      nextScopeId: 1,
    }
    addScopeDraft(state)
    addScopeDraft(state)
    expect(state.scopes).toHaveLength(2)
    expect(permissionsForScope(state, state.scopes![0]!)).toHaveLength(2)
    state.scopes![0]!.permissions = ['read', 'admin']
    state.scopes![0]!.project = 'app'
    limitScopePermissions(state, state.scopes![0]!)
    expect(state.scopes![0]!.permissions).toEqual(['read'])
    excludeScopeDraft(state, state.scopes![0]!.id)
    expect(state.scopes).toHaveLength(1)
  })

  it('mounts ToastViewport, ModalDialog and DangerActions and checks form feedback', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const pinia = createPinia()
    setActivePinia(pinia)
    const { notify } = createToastController(() => ({
      region: 'Notifications',
      dismiss: 'Dismiss',
    }))
    notify('success', 'Saved')

    const viewport = mount(ToastViewport, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.body.textContent).toContain('Saved')
    viewport.unmount()

    const formTarget = {
      danger: false,
      description: '',
      show: vi.fn(),
    }
    const action = createDangerAction(
      formTarget,
      'deleteItem',
      'Delete',
      'item-1',
      async () => {},
      { description: 'Permanent' },
    )
    const dangerWrapper = mount(DangerActions, {
      props: { actions: [action], disabled: false, label: 'More' },
      global: { plugins: [pinia] },
    })
    await dangerWrapper.find('button').trigger('click')
    await dangerWrapper.find('[data-danger-action="deleteItem"]').trigger('click')
    expect(formTarget.show).toHaveBeenCalledOnce()
    expect(formTarget.danger).toBe(true)
    expect(formTarget.description).toBe('Permanent')
    dangerWrapper.unmount()

    const modal = mount(ModalDialog, {
      props: { open: false, title: 'Settings', closeLabel: 'Close' },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    const dialogEl = modal.find('dialog').element as HTMLDialogElement
    dialogEl.showModal = vi.fn(() => dialogEl.setAttribute('open', ''))
    dialogEl.close = vi.fn(() => dialogEl.removeAttribute('open'))
    await modal.setProps({ open: true })
    await nextTick()
    expect(dialogEl.showModal).toHaveBeenCalledOnce()
    await modal.setProps({ open: false })
    await nextTick()
    expect(dialogEl.close).toHaveBeenCalledOnce()
    modal.unmount()

    expect(checkFormFeedback('<p>{{ form.error }}</p>')).toEqual(['form-feedback-requires-toast'])
    expect(formFeedback('const saveError = ref("")')('saveError', false)).toBe(true)
  })
})
