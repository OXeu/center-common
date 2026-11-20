import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { checkModuleSources, parseGoMod } from '../../../tools/lint-modules.ts'

let root = ''

const write = (path: string, content: string) => {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

beforeEach(() => {
  root = join(process.cwd(), '.tmp', `modules-lint-${Math.random().toString(36).slice(2)}`)
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('Go module parsing', () => {
  it('reads blocks, single lines and replace directives', () => {
    const parsed = parseGoMod(`module github.com/OXeu/app

go 1.26

require (
	github.com/OXeu/configcenter/sdk/configcenter v0.0.0-20260101000000-abcdef123456
	github.com/gin-gonic/gin v1.12.0 // indirect
)

require github.com/joho/godotenv v1.5.1

replace github.com/OXeu/center-common => ./.tmp/common
replace github.com/OXeu/configcenter/sdk/configcenter v0.0.0 => ./sdk/configcenter
`)
    expect(parsed.module).toBe('github.com/OXeu/app')
    expect(parsed.requires).toContainEqual({
      path: 'github.com/OXeu/configcenter/sdk/configcenter',
      version: 'v0.0.0-20260101000000-abcdef123456',
    })
    expect(parsed.requires).toContainEqual({ path: 'github.com/joho/godotenv', version: 'v1.5.1' })
    expect(parsed.replaces).toContainEqual({
      path: 'github.com/OXeu/center-common',
      target: './.tmp/common',
    })
    expect(parsed.replaces).toContainEqual({
      path: 'github.com/OXeu/configcenter/sdk/configcenter',
      target: './sdk/configcenter',
    })
  })
})

describe('Remote module enforcement', () => {
  it('rejects local replace directives for owned modules', () => {
    write(
      'go.mod',
      `module github.com/OXeu/app\n\nreplace github.com/OXeu/configcenter/sdk/configcenter => ./sdk/configcenter\n`,
    )
    const errors = checkModuleSources(root, ['go.mod'])
    expect(errors).toContainEqual(expect.stringContaining('require-remote-modules'))
    expect(errors).toContainEqual(expect.stringContaining('sdk/configcenter'))
  })

  it('accepts pinned remote requires and the bootstrapped common checkout', () => {
    write(
      'go.mod',
      `module github.com/OXeu/app\n\nrequire github.com/OXeu/configcenter/sdk/configcenter v0.0.0-20260101000000-abcdef123456\n\nreplace github.com/OXeu/center-common => ./.tmp/common\n`,
    )
    write('common.lock.json', '{}\n')
    expect(checkModuleSources(root, ['go.mod'])).toEqual([])
  })

  it('rejects a local common copy without the pinned bootstrap', () => {
    write(
      'go.mod',
      `module github.com/OXeu/app\n\nrequire github.com/OXeu/center-common v0.0.0\n\nreplace github.com/OXeu/center-common => ../center-common\n`,
    )
    expect(checkModuleSources(root, ['go.mod'])).toContainEqual(
      expect.stringContaining('require-remote-modules'),
    )
  })

  it('rejects a nested copy of an owned module', () => {
    write(
      'go.mod',
      `module github.com/OXeu/app\n\nrequire github.com/OXeu/configcenter/sdk/configcenter v0.0.0-20260101000000-abcdef123456\n`,
    )
    write('sdk/configcenter/go.mod', 'module github.com/OXeu/configcenter/sdk/configcenter\n')
    write('sdk/configcenter/client.go', 'package configcenter\n')
    const errors = checkModuleSources(root, ['go.mod', 'sdk/configcenter/go.mod'])
    expect(errors).toContainEqual(expect.stringContaining('remove this copy'))
  })

  it('allows the owning repository to contain its own module directory', () => {
    write('go.mod', 'module github.com/OXeu/configcenter/sdk/configcenter\n')
    write('client.go', 'package configcenter\n')
    expect(checkModuleSources(root, ['go.mod', 'client.go'])).toEqual([])
  })

  it('allows the publishing repository to keep and require its nested module', () => {
    write(
      'go.mod',
      `module github.com/OXeu/configcenter\n\nrequire github.com/OXeu/configcenter/sdk/configcenter v0.0.0\n\nreplace github.com/OXeu/configcenter/sdk/configcenter => ./sdk/configcenter\n`,
    )
    write('sdk/configcenter/go.mod', 'module github.com/OXeu/configcenter/sdk/configcenter\n')
    write('sdk/configcenter/client.go', 'package configcenter\n')
    write('internal/store/source.go', 'package store\n')
    expect(
      checkModuleSources(root, [
        'go.mod',
        'sdk/configcenter/go.mod',
        'sdk/configcenter/client.go',
        'internal/store/source.go',
      ]),
    ).toEqual([])
  })

  it('still rejects a hosted copy outside the publishing tree', () => {
    write('go.mod', 'module github.com/OXeu/app\n')
    write('internal/configcenter/client.go', 'package configcenter\n')
    expect(checkModuleSources(root, ['go.mod', 'internal/configcenter/client.go'])).toContainEqual(
      expect.stringContaining('require-remote-modules'),
    )
  })
})
