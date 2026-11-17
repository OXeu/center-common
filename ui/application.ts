import { createApp, shallowRef, ref } from 'vue'
import { createPinia, defineStore, disposePinia } from 'pinia'
import {
  createRouter,
  createWebHistory,
  START_LOCATION,
  type RouteLocationNormalized,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'
import ApplicationRoot from './ApplicationRoot.vue'
import { DocumentNavigation } from './page-data.ts'

export type PageSnapshot<T extends object> = { data: T; title: string }

export type PageApplicationOptions<T extends object> = {
  routes: RouteRecordRaw[]
  initial: PageSnapshot<T>
  load: (path: string, signal: AbortSignal) => Promise<PageSnapshot<T>>
  report: (error: unknown) => void
  setTitle: (title: string) => void
  history?: RouterHistory
  visit?: (path: string) => void
}

/** Creates isolated Router and Pinia instances with consumer-owned routes and page data. */
export function createPageApplication<T extends object>(options: PageApplicationOptions<T>) {
  const pinia = createPinia()
  const usePageStore = defineStore('center-page', () => {
    const snapshot = shallowRef({ ...options.initial, key: 'initial' })
    const pending = ref(false)
    function commit(page: PageSnapshot<T>, key: string) {
      snapshot.value = { ...page, key }
    }
    return { snapshot, pending, commit }
  })
  const page = usePageStore(pinia)
  const router = createRouter({
    history: options.history ?? createWebHistory(),
    routes: options.routes,
    scrollBehavior(to, _from, saved) {
      return saved ?? (to.hash ? { el: to.hash } : { top: 0, left: 0 })
    },
  })
  const visit = options.visit ?? ((path: string) => location.assign(path))
  const staged = new WeakMap<RouteLocationNormalized, PageSnapshot<T>>()
  let request: AbortController | undefined
  const path = (route: RouteLocationNormalized) => route.fullPath.split('#')[0]
  router.beforeEach(async (to, from) => {
    request?.abort()
    page.pending = false
    if (from === START_LOCATION) return true
    if (to.meta.document || from.meta.document) {
      visit(to.fullPath)
      return false
    }
    if (path(to) === path(from)) return true
    const current = new AbortController()
    request = current
    page.pending = true
    try {
      const snapshot = await options.load(path(to), current.signal)
      if (current.signal.aborted) return false
      staged.set(to, snapshot)
    } catch (error) {
      if (!current.signal.aborted) {
        if (error instanceof DocumentNavigation) visit(to.fullPath)
        else options.report(error)
      }
      return false
    } finally {
      if (request === current) page.pending = false
    }
    return true
  })
  router.afterEach((to, _from, failure) => {
    const snapshot = staged.get(to)
    if (failure || !snapshot) return
    page.commit(snapshot, path(to))
    options.setTitle(snapshot.title)
  })
  router.onError((error) => {
    request?.abort()
    page.pending = false
    options.report(error)
  })
  const app = createApp(ApplicationRoot, { page })
  app.use(pinia)
  app.use(router)
  app.onUnmount(() => {
    request?.abort()
    disposePinia(pinia)
  })
  return { app, router, pinia, usePageStore }
}
