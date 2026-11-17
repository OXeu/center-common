import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { checkScripts } from '../../../tools/lint-scripts.ts'

let root: string

function write(filename: string, source = '') {
  const path = join(root, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, source)
}

function git(...args: string[]) {
  execFileSync('git', args, { cwd: root })
}

beforeEach(() => {
  mkdirSync('.tmp', { recursive: true })
  root = mkdtempSync(resolve('.tmp/scripts-lint-'))
  git('init', '--quiet')
  write('.gitignore', 'node_modules/\n.tmp/\n')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('repository script rules', () => {
  it.each(['js', 'jsx', 'cjs', 'mjs', 'mts', 'cts', 'tsx', 'MJS'])(
    'rejects tracked and new %s files throughout the repository',
    (extension) => {
      write(`.github/tracked.${extension}`)
      git('add', '.github')
      write(`nested/new script.${extension}`)
      expect(checkScripts(root)).toEqual([
        expect.stringContaining(`nested/new script.${extension}: scripts-use-typescript`),
        expect.stringContaining(`.github/tracked.${extension}: scripts-use-typescript`),
      ])
    },
  )

  it('allows TypeScript and ignores dependencies, generated files and deleted files', () => {
    write('tools/script.ts', 'const value: string = "ok"')
    write('node_modules/dependency/index.mjs')
    write('.tmp/output.mjs')
    write('deleted.mjs')
    git('add', 'deleted.mjs')
    rmSync(join(root, 'deleted.mjs'))
    expect(checkScripts(root)).toEqual([])
  })

  it('rejects forbidden tracked files even when their directory is ignored', () => {
    write('.tmp/tracked.mjs')
    git('add', '--force', '.tmp/tracked.mjs')
    expect(checkScripts(root)).toEqual([expect.stringContaining('.tmp/tracked.mjs:')])
  })

  it.each([
    '<script>export default {}</script>',
    '<script setup>const value = 1</script>',
    '<script setup></script>',
    '<script lang="js">export default {}</script>',
    '<script lang="tsx">export default {}</script>',
    '<script lang="ts" src="./external.mjs"></script>',
    '<script>export default {}</script><script setup lang="ts">const value = 1</script>',
  ])('rejects non-TypeScript Vue scripts: %s', (source) => {
    write('Component.vue', source + '<template><div /></template>')
    expect(checkScripts(root)).toContainEqual(expect.stringContaining('scripts-use-typescript'))
  })

  it.each([
    '',
    '<script lang="ts">export default {}</script>',
    '<script setup lang="ts">const value: number = 1</script>',
    '<script setup lang="ts"></script>',
    '<script lang="ts" src="./external.ts"></script>',
    '<!-- <script lang="js">export default {}</script> -->',
  ])('allows TypeScript Vue scripts and template-only components: %s', (source) => {
    write('Component.vue', source + '<template><div /></template>')
    expect(checkScripts(root)).toEqual([])
  })

  it('runs through the consumer common symlink and reports the offending path', () => {
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-scripts.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    expect(run().status).toBe(0)
    write('scripts/legacy.mjs')
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('scripts/legacy.mjs: scripts-use-typescript')
  })
})
