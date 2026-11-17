import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, nextTick, type App } from 'vue'
import { defineStore } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import { createPageApplication, type PageSnapshot } from '../../../ui/application.ts'
import { DocumentNavigation, loadPageData } from '../../../ui/page-data.ts'
import NavigationLink from '../../../ui/NavigationLink.vue'

const apps: App[] = []
const useVisits = defineStore('visits', { state: () => ({ count: 0 }) })
const View = defineComponent({
  props: ['data'],
  setup(props) {
    const visits = useVisits()
    visits.count++
    return () =>
      h('main', [
        h('p', `${props.data.name}:${visits.count}`),
        h(NavigationLink, { href: '/two' }, () => 'Two'),
        h(NavigationLink, { href: '/docs/' }, () => 'Docs'),
        h(NavigationLink, { href: 'https://example.test/' }, () => 'External'),
      ])
  },
})
type Data = { name: string }
const snapshot = (name: string): PageSnapshot<Data> => ({ data: { name }, title: name })
function deferred() {
  let resolve!: (value: PageSnapshot<Data>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<PageSnapshot<Data>>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function setup(initialPath = '/one') {
  const history = createMemoryHistory()
  history.push(initialPath)
  const load = vi.fn(async (path: string, _signal: AbortSignal) => snapshot(path))
  const report = vi.fn()
  const visit = vi.fn()
  const setTitle = vi.fn()
  const application = createPageApplication({
    routes: [
      ...['/one', '/two', '/three'].map((path) => ({ path, component: View })),
      { path: '/:pathMatch(.*)*', component: View, meta: { document: true } },
    ],
    history,
    initial: snapshot('initial'),
    load,
    report,
    visit,
    setTitle,
  })
  await application.router.isReady()
  const host = document.createElement('div')
  document.body.append(host)
  application.app.mount(host)
  apps.push(application.app)
  return {
    ...application,
    host,
    load,
    report,
    visit,
    setTitle,
    state: application.usePageStore(application.pinia),
  }
}
beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()))
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('page applications', () => {
  it('hydrates bootstrap state without another request and preserves Pinia across routes', async () => {
    const app = await setup()
    expect(app.load).not.toHaveBeenCalled()
    expect(app.host.textContent).toContain('initial:1')
    await app.router.push('/two')
    await nextTick()
    expect(app.host.textContent).toContain('/two:2')
    expect(app.state.snapshot.data).toEqual({ name: '/two' })
    expect(app.setTitle).toHaveBeenCalledWith('/two')
    expect(document.activeElement).toBe(app.host.firstElementChild)
    expect(app.visit).not.toHaveBeenCalled()
  })

  it('keeps the current view while pending and ignores superseded responses', async () => {
    const app = await setup()
    const slow = deferred()
    const fast = deferred()
    app.load.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const first = app.router.push('/two')
    await flushPromises()
    expect(app.host.textContent).toContain('initial:1')
    expect(app.host.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    const second = app.router.push('/three')
    await flushPromises()
    expect(app.load.mock.calls[0][1].aborted).toBe(true)
    fast.resolve(snapshot('newer'))
    await second
    slow.resolve(snapshot('older'))
    await first
    await nextTick()
    expect(app.host.textContent).toContain('newer:2')
    expect(app.router.currentRoute.value.path).toBe('/three')
    expect(app.state.pending).toBe(false)
    expect(app.report).not.toHaveBeenCalled()
  })

  it('retains the current URL and data on a network failure', async () => {
    const app = await setup()
    const error = new Error('offline')
    app.load.mockRejectedValueOnce(error)
    await app.router.push('/two')
    expect(app.router.currentRoute.value.path).toBe('/one')
    expect(app.state.snapshot.data.name).toBe('initial')
    expect(app.state.pending).toBe(false)
    expect(app.report).toHaveBeenCalledWith(error)
  })

  it('uses document navigation for authentication redirects and server-only routes', async () => {
    const app = await setup()
    app.load.mockRejectedValueOnce(new DocumentNavigation('session expired'))
    await app.router.push('/two')
    expect(app.visit).toHaveBeenCalledWith('/two')
    await app.router.push('/docs/')
    expect(app.visit).toHaveBeenCalledWith('/docs/')
    expect(app.load).toHaveBeenCalledTimes(1)
    expect(app.report).not.toHaveBeenCalled()
  })

  it('leaves server-rendered documents through a document navigation', async () => {
    const app = await setup('/docs/')
    await app.router.push('/one')
    expect(app.visit).toHaveBeenCalledWith('/one')
    expect(app.load).not.toHaveBeenCalled()
  })

  it('refetches on query changes and back navigation but preserves hash-only views', async () => {
    const app = await setup()
    const anchor = document.createElement('div')
    anchor.id = 'target'
    app.host.append(anchor)
    await app.router.push('/one#target')
    expect(app.load).not.toHaveBeenCalled()
    await app.router.push('/one?view=mine')
    expect(app.load.mock.calls[0][0]).toBe('/one?view=mine')
    app.router.back()
    await flushPromises()
    expect(app.router.currentRoute.value.fullPath).toBe('/one#target')
    expect(app.load.mock.calls[1][0]).toBe('/one')
  })

  it('isolates stores between application instances', async () => {
    const first = await setup()
    const second = await setup()
    await first.router.push('/two')
    expect(useVisits(first.pinia).count).toBe(2)
    expect(useVisits(second.pinia).count).toBe(1)
    expect(second.state.snapshot.data.name).toBe('initial')
  })

  it('preserves native link modifiers and intercepts normal internal clicks', async () => {
    const app = await setup()
    const link = app.host.querySelector('a[href="/two"]')!
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    let routerPrevented = false
    link.addEventListener(
      'click',
      (event) => {
        routerPrevented = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    link.dispatchEvent(modified)
    expect(routerPrevented).toBe(false)
    expect(app.load).not.toHaveBeenCalled()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    await flushPromises()
    expect(app.router.currentRoute.value.path).toBe('/two')
    expect(app.host.querySelector('a[href="/docs/"]')?.className).not.toContain('router-link')
  })
})

describe('page transport', () => {
  it('sends same-origin credentials, the navigation marker and cancellation signal', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot('loaded')), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const { signal } = new AbortController()
    expect(await loadPageData('/two', signal)).toEqual(snapshot('loaded'))
    expect(fetch).toHaveBeenCalledWith(
      '/two',
      expect.objectContaining({
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Center-Navigation': '1' },
      }),
    )
  })

  it.each([401, 403, 404, 500])('falls back to server navigation for HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    await expect(loadPageData('/two', new AbortController().signal)).rejects.toBeInstanceOf(
      DocumentNavigation,
    )
  })

  it('rejects HTML and malformed page responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html></html>'))
      .mockResolvedValueOnce(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(loadPageData('/two', new AbortController().signal)).rejects.toBeInstanceOf(
      DocumentNavigation,
    )
    await expect(loadPageData('/two', new AbortController().signal)).rejects.toThrow(
      'Invalid page response',
    )
  })
})
