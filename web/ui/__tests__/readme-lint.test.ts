import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { checkReadme, checkReadmes } from '../../../tools/oxlint/readme.ts'
import { readmeFixture, writeReadmeFixture } from './readme-fixture.ts'

let root: string
beforeEach(() => {
  mkdirSync('.tmp', { recursive: true })
  root = mkdtempSync(resolve('.tmp/readme-lint-'))
  writeReadmeFixture(root)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const check = (source: string) => checkReadme(source, 'README.md', root)

describe('README layout', () => {
  it('accepts English and Chinese documents in the required order', () => {
    expect(checkReadmes(root)).toEqual([])
  })

  it('requires both language files even when one was deleted', () => {
    rmSync(join(root, 'README_zh.md'))
    expect(checkReadmes(root)).toContainEqual(
      expect.stringContaining('README_zh.md: readme-layout: both'),
    )
  })

  it('allows a centered wrapper, reference images and the optional features section to be omitted', () => {
    const source = readmeFixture()
      .replaceAll(' align="center"', '')
      .replace('<p><img', '<div align="center">\n<p><img')
      .replace('<p><a href="README.md">', '</div>\n\n<p><a href="README.md">')
      .replace(
        '![Product preview](docs/preview.svg)',
        '![Product preview][preview]\n\n[preview]: docs/preview.svg',
      )
      .replace('## Features\n\n- Shared controls and explicit configuration.\n\n', '')
    expect(check(source)).toEqual([])
  })

  it('accepts translated section headings and the Gallery/Install/Why alternatives', () => {
    const chinese = readmeFixture(true)
      .replace('## Preview', '## 预览')
      .replace('## Features', '## 功能')
      .replace('## Quick Start', '## 快速开始')
      .replace('#quick-start', '#快速开始')
    expect(checkReadme(chinese, 'README_zh.md', root)).toEqual([])
    expect(
      check(
        readmeFixture()
          .replace('## Preview', '## Gallery')
          .replace('## Features', '## Why')
          .replace('## Quick Start', '## Install')
          .replace('#quick-start', '#install'),
      ),
    ).toEqual([])
  })

  it.each([
    ['logo missing', 'docs/logo.svg', '', 'destination'],
    ['logo uncentered', '<p align="center"><img', '<p><img', 'centered logo'],
    [
      'wrong title level',
      '<h3 align="center">Example</h3>',
      '<h1 align="center">Example</h1>',
      'h3 title',
    ],
    ['uncentered title', '<h3 align="center">', '<h3>', 'h3 title'],
    [
      'two introductory sentences',
      'Shared infrastructure for example applications.',
      'First sentence. Second sentence.',
      'one centered sentence',
    ],
    [
      'two sentences without final punctuation',
      'Shared infrastructure for example applications.',
      'First sentence. Second sentence',
      'one centered sentence',
    ],
    [
      'language link missing',
      'href="README_zh.md"',
      'href="README.md"',
      'links to README.md and README_zh.md',
    ],
    ['navigation missing', '<a href="docs/guide.md">Documentation</a>', '', 'navigation links'],
    ['duplicated navigation', 'href="docs/guide.md"', 'href="#quick-start"', 'navigation links'],
    [
      'badges missing',
      '<img src="https://img.shields.io/badge/build-passing-green" alt="Build status" />',
      '',
      'badge list',
    ],
    [
      'preview missing',
      '![Product preview](docs/preview.svg)',
      'A preview will be added later.',
      'product screenshot or diagram',
    ],
    [
      'empty features',
      '- Shared controls and explicit configuration.',
      '',
      'section must not be empty',
    ],
    [
      'deployment commands missing',
      '```sh\nnpm ci\nnpm start\n```',
      'Install the application.',
      'fenced shell command block',
    ],
    ['wrong code language', '```sh', '```json', 'fenced shell command block'],
    [
      'star graph missing',
      'https://api.star-history.com/svg?repos=example/project&type=Date',
      'docs/preview.svg',
      'Star History must embed',
    ],
    ['star repository missing', 'repos=example/project', 'repos=', 'Star History must embed'],
    [
      'empty license',
      'Licensed under the [Apache License 2.0](LICENSE).',
      '',
      'section must not be empty',
    ],
    ['broken asset', 'docs/preview.svg', 'docs/missing.svg', 'local destination does not exist'],
    ['logo used as preview', 'docs/preview.svg', 'docs/logo.svg', 'product screenshot or diagram'],
    ['broken anchor', '#quick-start', '#missing', 'heading anchor does not exist'],
    ['empty alt', 'alt="Example logo"', 'alt=""', 'descriptive alt'],
    [
      'license link missing',
      '[Apache License 2.0](LICENSE)',
      'Apache License 2.0',
      'LICENSE must link',
    ],
  ])('rejects %s', (_name, original, replacement, error) => {
    expect(check(readmeFixture().replace(original, replacement))).toContainEqual(
      expect.stringContaining(error),
    )
  })

  it.each(['Preview', 'Quick Start', 'Star History', 'LICENSE'])(
    'requires the %s section',
    (heading) => {
      expect(check(readmeFixture().replace(`## ${heading}`, `### ${heading}`))).toContainEqual(
        expect.stringContaining('use h2 sections in order'),
      )
    },
  )

  it('rejects reordered sections and extra top-level sections', () => {
    expect(
      check(
        readmeFixture()
          .replace('## Preview', '## Star History')
          .replace('## Star History\n\n[', '## Preview\n\n['),
      ),
    ).toContainEqual(expect.stringContaining('use h2 sections in order'))
    expect(check(readmeFixture() + '\n## Notes\n\nExtra notes.\n')).toContainEqual(
      expect.stringContaining('use h2 sections in order'),
    )
  })

  it('rejects layouts hidden in comments, fenced examples or hidden containers', () => {
    const source = readmeFixture()
    for (const wrapped of [
      `<!--\n${source}\n-->`,
      `\`\`\`markdown\n${source}\n\`\`\``,
      `<div hidden>\n${source}\n</div>`,
    ]) {
      expect(check(wrapped)).toContainEqual(expect.stringContaining('use h2 sections in order'))
    }
  })

  it('requires a Chinese introduction in the Chinese README', () => {
    writeFileSync(join(root, 'README_zh.md'), readmeFixture())
    expect(checkReadmes(root)).toContainEqual(
      expect.stringContaining('Chinese introduction in Chinese'),
    )
  })

  it('rejects a LICENSE link whose target is missing', () => {
    rmSync(join(root, 'LICENSE'))
    expect(checkReadmes(root)).toContainEqual(
      expect.stringContaining('destination does not exist in the repository: LICENSE'),
    )
  })
})
