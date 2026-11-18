import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { checkFiles } from '../../../tools/lint-files.ts'
import { writeReadmeFixture } from './readme-fixture.ts'

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
  root = mkdtempSync(resolve('.tmp/files-lint-'))
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
      expect(checkFiles(root)).toEqual([
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
    expect(checkFiles(root)).toEqual([])
  })

  it('rejects forbidden tracked files even when their directory is ignored', () => {
    write('.tmp/tracked.mjs')
    git('add', '--force', '.tmp/tracked.mjs')
    expect(checkFiles(root)).toEqual([expect.stringContaining('.tmp/tracked.mjs:')])
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
    expect(checkFiles(root)).toContainEqual(expect.stringContaining('scripts-use-typescript'))
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
    expect(checkFiles(root)).toEqual([])
  })

  it.each([
    ['scripts/legacy.mjs', 'scripts-use-typescript'],
    ['IMPLEMENTATION_SUMMARY.md', 'no-restricted-files'],
    ['web/ui/src/EXPLANATION.md', 'no-restricted-files'],
  ])('runs through the consumer common symlink and rejects %s', (filename, rule) => {
    writeReadmeFixture(root)
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-files.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    expect(run().status).toBe(0)
    write(filename)
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${filename}: ${rule}`)
  })
})

describe('no-restricted-files', () => {
  it.each([
    'md',
    'mdx',
    'markdown',
    'mdown',
    'mkd',
    'txt',
    'text',
    'rst',
    'adoc',
    'asciidoc',
    'MD',
  ])(
    'rejects tracked root documents and new source documents with the %s extension',
    (extension) => {
      const tracked = `IMPLEMENTATION_SUMMARY.${extension}`
      const untracked = `web/ui/src/实现说明.${extension}`
      write(tracked)
      git('add', tracked)
      write(untracked)
      expect(checkFiles(root)).toEqual([
        expect.stringContaining(`${untracked}: no-restricted-files:`),
        expect.stringContaining(`${tracked}: no-restricted-files:`),
      ])
    },
  )

  it.each([
    'ui/README.md',
    'oauth/AGENTS.md',
    'internal/server/NOTES.md',
    'sdk/configcenter/EXPLANATION.md',
    'tools/docs/implementation.md',
    'docs-old/summary.md',
    '.github-old/summary.md',
    '.notes/summary.md',
    'README_FIX.md',
    '.summary.md',
  ])('does not grant documentation exceptions to %s', (filename) => {
    write(filename)
    expect(checkFiles(root)).toEqual([expect.stringContaining(`${filename}: no-restricted-files:`)])
  })

  it('allows maintained documentation and ordinary source files', () => {
    for (const filename of [
      'README.md',
      'README_zh.md',
      'AGENTS.md',
      'docs/api.md',
      'docs/guide/setup.mdx',
      '.github/commits.md',
      '.github/ISSUE_TEMPLATE/bug_report.md',
      'ui/summary.ts',
      'oauth/client.go',
    ]) {
      write(filename)
    }
    expect(checkFiles(root)).toEqual([])
  })

  it('ignores local scratch documents, dependencies and deleted documents', () => {
    write('.tmp/summary.md')
    write('node_modules/example/README.md')
    write('removed.md')
    git('add', 'removed.md')
    rmSync(join(root, 'removed.md'))
    expect(checkFiles(root)).toEqual([])
  })

  it('rejects scratch documents forced into Git despite ignore rules', () => {
    write('.tmp/summary.md')
    git('add', '--force', '.tmp/summary.md')
    expect(checkFiles(root)).toEqual([
      expect.stringContaining('.tmp/summary.md: no-restricted-files:'),
    ])
  })
})

describe('Markdown paragraphs', () => {
  it('checks tracked and new Markdown documents with source locations', () => {
    write('docs/tracked.md', '# Guide\n\nSet the key. Register the callback. Replace the URL.')
    git('add', 'docs/tracked.md')
    write('.github/new.MD', `${Array.from({ length: 41 }, () => 'word').join(' ')}.`)
    expect(checkFiles(root)).toEqual([
      expect.stringContaining('.github/new.MD:1: paragraph-structure: sentence too long'),
      expect.stringContaining('docs/tracked.md:3: paragraph-steps-list:'),
    ])
  })

  it('fails the consumer lint command for prose steps and accepts the list correction', () => {
    writeReadmeFixture(root)
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-files.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    write('docs/setup.md', '# Setup\n\nSet the key. Register the callback. Replace the URL.')
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('docs/setup.md:3: paragraph-steps-list:')
    write(
      'docs/setup.md',
      '# Setup\n\n1. Set the key.\n2. Register the callback.\n3. Replace the URL.',
    )
    expect(run().status).toBe(0)
  })
})

describe('shared button enforcement', () => {
  it('rejects tracked and new button implementations from the repository command', () => {
    writeReadmeFixture(root)
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
    write('components/Action.vue', '<template><button>Save</button></template>')
    git('add', 'components/Action.vue')
    write('ui/custom.css', '.btn { padding: 0; }')
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-files.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('components/Action.vue:1: button-use-shared:')
    expect(result.stderr).toContain('ui/custom.css:1: button-no-custom-style:')
    write(
      'components/Action.vue',
      '<script setup lang="ts">import Button from "@oxeu/center-common/ui/Button.vue"</script><template><Button variant="secondary">Save</Button></template>',
    )
    rmSync(join(root, 'ui/custom.css'))
    expect(run().status).toBe(0)
  })
})

describe('single-dropdown dialog enforcement', () => {
  it('checks templates and dynamic fields through the consumer lint entry point', () => {
    writeReadmeFixture(root)
    mkdirSync(join(root, '.tmp'))
    symlinkSync(resolve('.'), join(root, '.tmp/common'), 'dir')
    write('web/ui/src/Environment.vue', '<template><dialog><DropdownSelect /></dialog></template>')
    write(
      'web/ui/src/workspace.ts',
      'const form = createForm(page); form.show(title, [{ options }], {}, submit)',
    )
    const run = () =>
      spawnSync(process.execPath, ['.tmp/common/tools/lint-files.ts'], {
        cwd: root,
        encoding: 'utf8',
      })
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('web/ui/src/Environment.vue: no-single-dropdown-dialog')
    expect(result.stderr).toContain('web/ui/src/workspace.ts:1: no-single-dropdown-dialog')
    write('web/ui/src/Environment.vue', '<template><DropdownMenu label="Environment" /></template>')
    write(
      'web/ui/src/workspace.ts',
      'const form = createForm(page); form.show(title, [{ key: "name" }, { options }], {}, submit)',
    )
    expect(run().status).toBe(0)
  })
})
