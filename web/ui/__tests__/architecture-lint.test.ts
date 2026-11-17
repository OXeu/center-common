import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { checkArchitectureScript } from '../../../tools/oxlint/architecture-script.ts'
import { checkArchitectureTemplate } from '../../../tools/oxlint/architecture-template.ts'
import { checkArchitecture } from '../../../tools/lint-architecture.ts'
import { writeReadmeFixture } from './readme-fixture.ts'

const script = (text: string, setup = false) =>
  checkArchitectureScript(text, { filename: 'web/ui/src/example.ts', setup })

describe('Router enforcement', () => {
  it.each([
    "location.assign('/projects')",
    "document.location.href = '/keys'",
    "window.document.location.assign('/keys')",
    'export const navigate = window.location.assign',
    "window.location.href = '/keys'",
    "globalThis['location']['replace']('/projects')",
    "globalThis.window.location.assign('/keys')",
    "const { location: destination } = window; destination.assign('/keys')",
    "const { assign: go } = location; go('/keys')",
    "const go = location.assign; go('/keys')",
    "const go = location.assign.bind(location); go('/keys')",
    "location.assign.call(location, '/keys')",
    "window['loc' + 'ation'].reload()",
    "history.pushState({}, '', '/keys')",
    "const { replaceState: go } = window.history; go({}, '', '/keys')",
    'window.history.back()',
    "window.addEventListener('popstate', () => {})",
    "const listen = addEventListener; listen('hashchange', () => {})",
    'window.onpopstate = () => {}',
    "window.location.hash = '#keys'",
    'const path = location.pathname',
    "window.open('/projects', '_self')",
  ])('rejects native navigation and aliases: %s', (source) => {
    expect(script(source).some((error) => error.includes('router-no-native-navigation'))).toBe(true)
  })

  it.each([
    "import { createApp as start } from 'vue'; start(App)",
    "import * as Vue from 'vue'; Vue['createApp'](App)",
    "import { createRouter } from 'vue-router'; createRouter({})",
    "import { createPinia as makeStore } from 'pinia'; makeStore()",
  ])('rejects alternate initialization: %s', (source) => {
    expect(script(source).some((error) => error.includes('require-router-pinia-bootstrap'))).toBe(
      true,
    )
  })

  it.each([
    "import { useRouter, useRoute } from 'vue-router'; const router = useRouter(); router.push('/keys'); const path = useRoute().path",
    "function test(location: { assign: (s: string) => void }) { location.assign('value') }",
    'const history = { pushState() {} }; history.pushState()',
    'const comment = \'location.assign("/keys")\'; // history.pushState()',
  ])('allows Router and unrelated shadowed names: %s', (source) =>
    expect(script(source)).toEqual([]),
  )

  it('requires a mounted, ready shared application rather than an unused import', () => {
    const entry = { filename: 'web/ui/src/main.ts', entry: true }
    const imports =
      "import { createPageApplication as start } from '@oxeu/center-common/ui/application.ts';"
    expect(checkArchitectureScript(imports, entry)).toContainEqual(
      expect.stringContaining('require-router-pinia-bootstrap'),
    )
    expect(checkArchitectureScript(imports + 'const unused = start({})', entry)).toContainEqual(
      expect.stringContaining('require-router-pinia-bootstrap'),
    )
    expect(
      checkArchitectureScript(
        imports +
          'const { app: view, router: navigation } = start({}); void navigation.isReady().then(() => view.mount("#app"))',
        entry,
      ),
    ).toEqual([])
    expect(
      checkArchitectureScript(
        imports +
          'const runtime = start({}); await runtime.router.isReady(); runtime.app.mount("#app")',
        entry,
      ),
    ).toEqual([])
  })

  it('requires an exact declared document handoff and rejects unused exemptions', () => {
    const prefix =
      "import { navigateDocument as leave } from '@oxeu/center-common/ui/navigation.ts';"
    const policy = {
      filename: 'web/ui/src/Header.vue',
      setup: true,
      exits: [{ reason: 'sign-out', target: '/login' }],
    }
    expect(checkArchitectureScript(prefix + "leave('/login', 'sign-out')", policy)).toEqual([])
    expect(
      checkArchitectureScript(prefix + "leave('/projects', 'sign-out')", policy),
    ).toContainEqual(expect.stringContaining('document-navigation-policy'))
    expect(checkArchitectureScript(prefix + "leave('/login', 'unknown')", policy)).toContainEqual(
      expect.stringContaining('document-navigation-policy'),
    )
    expect(checkArchitectureScript(prefix, policy)).toContainEqual(
      expect.stringContaining('unused handoff'),
    )
    expect(
      checkArchitectureScript(prefix + "leave(result.redirect, 'oauth')", {
        ...policy,
        exits: [{ reason: 'oauth', serverRedirect: true }],
      }),
    ).toEqual([])
    expect(
      checkArchitectureScript(prefix + "leave(userInput, 'oauth')", {
        ...policy,
        exits: [{ reason: 'oauth', serverRedirect: true }],
      }),
    ).toContainEqual(expect.stringContaining('document-navigation-policy'))
  })

  it.each([
    "import { navigateDocument } from '@oxeu/center-common/ui/navigation.ts'; export const leave = navigateDocument",
    "export { navigateDocument as leave } from '@oxeu/center-common/ui/navigation.ts'",
    "import { navigateDocument } from '../../../.tmp/common/ui/navigation.ts'; navigateDocument('/projects', 'skip')",
  ])('does not allow helper imports or re-exports to escape the handoff policy: %s', (source) => {
    expect(script(source)).toContainEqual(expect.stringContaining('document-navigation-policy'))
  })

  it.each([
    '<a href="/projects">Projects</a>',
    '<a :href="target">Open</a>',
    '<a v-bind="attributes">Open</a>',
    '<form @submit="save"></form>',
    '<form v-bind="attrs" @submit.prevent="save"></form>',
    '<component :is="kind" :href="target">Open</component>',
    '<component is="a" href="/projects">Open</component>',
    '<component :is="\'a\'" href="/projects">Open</component>',
    '<form action="/projects"></form>',
    '<button :formaction="target">Open</button>',
    '<meta http-equiv="refresh" content="0; url=/projects" />',
  ])('rejects native template navigation: %s', (source) => {
    expect(checkArchitectureTemplate(source, 'web/ui/src/Page.vue').errors.length).toBeGreaterThan(
      0,
    )
  })

  it('accepts navigation components and protects the shared adapter exception', () => {
    expect(
      checkArchitectureTemplate(
        '<form @submit.prevent="save"></form><form method="dialog"></form>',
        'web/ui/src/Page.vue',
      ).errors,
    ).toEqual([])
    expect(
      checkArchitectureTemplate(
        '<NavigationLink href="/projects">Projects</NavigationLink><RouterLink to="/keys">Keys</RouterLink>',
        'web/ui/src/Page.vue',
      ).errors,
    ).toEqual([])
    expect(
      checkArchitectureTemplate('<a :href="href">Open</a>', 'ui/NavigationLink.vue', true).errors,
    ).toEqual([])
    expect(
      checkArchitectureTemplate('<a :href="href">Open</a>', 'web/ui/src/NavigationLink.vue').errors,
    ).toHaveLength(1)
  })

  it('reports malformed templates instead of crashing or skipping their rules', () => {
    expect(
      checkArchitectureTemplate('<a href="/one" href="/two">Open</a>', 'web/ui/src/Page.vue')
        .errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('architecture-template-syntax'),
        expect.stringContaining('router-links-only'),
      ]),
    )
  })
})

describe('Pinia enforcement', () => {
  it.each([
    "import { ref } from 'vue'; export const state = ref(0)",
    "import { shallowRef as makeState } from 'vue'; const hidden = makeState({})",
    "import * as Vue from 'vue'; export const state = Vue.reactive({})",
    'export let count = 0',
    'export const store = { value: 0 }',
    'export const store = new Map()',
    "import { reactive, provide } from 'vue'; function setup() { const state = reactive({}); provide('state', state) }",
    "import { ref } from 'vue'; const state = (() => ref(0))()",
  ])('rejects shared state outside Pinia: %s', (source) => {
    expect(script(source).some((error) => error.includes('pinia-shared-state'))).toBe(true)
  })

  it.each([
    "import { defineStore } from 'pinia'; import { ref } from 'vue'; export const useStore = defineStore('counter', () => { const count = ref(0); return { count } })",
    "import { defineStore } from 'pinia'; export const useStore = defineStore('counter', { state: () => ({ count: 0 }) })",
    "import { ref } from 'vue'; export function createForm() { return ref(false) }",
    "export const routes = ['/keys'] as const",
    "export const routes: readonly string[] = ['/keys']",
    "export const labels: Readonly<Record<string, string>> = { key: 'Keys' }",
  ])('allows Pinia, local factories and readonly configuration: %s', (source) =>
    expect(script(source)).toEqual([]),
  )

  it('allows setup-local refs and store-owned persistence', () => {
    expect(script("import { ref } from 'vue'; const open = ref(false)", true)).toEqual([])
    expect(script("localStorage.setItem('store', JSON.stringify({}))")).toContainEqual(
      expect.stringContaining('pinia-no-storage-state'),
    )
    expect(
      script(
        "import { defineStore } from 'pinia'; export const usePreferences = defineStore('preferences', () => { const value = localStorage.getItem('preference'); return { value } })",
      ),
    ).toEqual([])
  })

  it.each([
    "import { createStore } from 'vuex'",
    "export * from 'redux'",
    "const state = import('zustand')",
    "const state = require('mobx')",
  ])('rejects alternative store libraries: %s', (source) =>
    expect(script(source)).toContainEqual(expect.stringContaining('router-pinia-only')),
  )
})

describe('repository integration', () => {
  let root: string
  function write(name: string, content: string) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  function files() {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
  }
  beforeEach(() => {
    mkdirSync('.tmp', { recursive: true })
    root = mkdtempSync(resolve('.tmp/architecture-lint-'))
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    write('.gitignore', '.tmp/\nnode_modules/\n')
    writeReadmeFixture(root)
    write(
      'package.json',
      JSON.stringify({
        devDependencies: {
          '@oxeu/center-common': 'file:.tmp/common',
          'vue-router': '^4.6.5',
          pinia: '^4.1.0',
        },
      }),
    )
    write(
      'web/ui/src/main.ts',
      `import { createPageApplication } from '@oxeu/center-common/ui/application.ts'; const {app, router} = createPageApplication({}); void router.isReady().then(() => app.mount('#app'))`,
    )
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('checks new files, Vue setup scripts and template handler aliases through the consumer CLI', () => {
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-files.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    expect(run().status).toBe(0)
    write(
      'web/ui/src/Bad.vue',
      '<script setup lang="ts">const destination = window.location</script><template><button @click="destination.assign(\'/keys\')">Open</button></template>',
    )
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('router-no-native-navigation')
    write('web/ui/__tests__/allowed.test.ts', "location.assign('/fixture')")
    rmSync(join(root, 'web/ui/src/Bad.vue'))
    expect(run().status).toBe(0)
  })

  it('requires direct dependencies and the entry even after it is deleted', () => {
    write(
      'package.json',
      JSON.stringify({ devDependencies: { '@oxeu/center-common': 'file:.tmp/common' } }),
    )
    rmSync(join(root, 'web/ui/src/main.ts'))
    expect(checkArchitecture(root, files())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('declare vue-router directly'),
        expect.stringContaining('declare pinia directly'),
        expect.stringContaining('missing application entry'),
      ]),
    )
  })

  it('rejects wildcard or malformed exception policies instead of silently skipping checks', () => {
    write(
      'tools/navigation-policy.json',
      '{"documentNavigation":{"web/ui/src/*":[{"reason":"skip","serverRedirect":true}]}}',
    )
    expect(checkArchitecture(root, files())).toContainEqual(
      expect.stringContaining('invalid handoff file'),
    )
  })

  it('blocks a production build even when the standalone lint command is skipped', () => {
    write('web/ui/src/Bad.ts', 'export const navigate = location.assign')
    const vite = createRequire(import.meta.url).resolve('vite-plus')
    const guard = resolve('tools/lint-architecture.ts')
    const program = `import vite from ${JSON.stringify(vite)}; const { build } = vite; import { architectureGuard } from ${JSON.stringify(guard)};
      await build({ configFile: false, cacheDir: '.tmp/vite', logLevel: 'silent', plugins: [architectureGuard()], build: { outDir: '.tmp/output', rollupOptions: { input: 'web/ui/src/main.ts' } } });`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: join(root, '.tmp') },
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('router-no-native-navigation')
  })
})
