import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import {
  alternatives,
  checkArchitectureScript,
  type DocumentExit,
} from './oxlint/architecture-script.ts'
import { checkArchitectureTemplate } from './oxlint/architecture-template.ts'
import { execFileSync } from 'node:child_process'

export function architectureGuard() {
  function check() {
    const files = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean)
    const errors = checkArchitecture(process.cwd(), files)
    if (errors.length) throw new Error(errors.join('\n'))
  }
  return { name: 'center-architecture', buildStart: check, handleHotUpdate: check }
}

export function checkArchitecture(root: string, files: string[]): string[] {
  const errors: string[] = []
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
  const manifest = existsSync(resolve(root, 'package.json')) ? JSON.parse(read('package.json')) : {}
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies }
  const consumer =
    existsSync(resolve(root, 'common.lock.json')) ||
    dependencies['@oxeu/center-common'] !== undefined
  const shared = !consumer && manifest.name === '@oxeu/center-common'
  const sources = files.filter(
    (file) =>
      (file.startsWith('web/ui/src/') || (shared && file.startsWith('ui/'))) &&
      /\.(ts|vue)$/u.test(file) &&
      existsSync(resolve(root, file)),
  )
  if (consumer) {
    for (const name of ['vue-router', 'pinia'])
      if (typeof dependencies[name] !== 'string' || !dependencies[name].trim())
        errors.push(`package.json: require-router-pinia: declare ${name} directly`)
    if (!sources.includes('web/ui/src/main.ts'))
      errors.push('web/ui/src/main.ts: require-router-pinia-bootstrap: missing application entry')
  }
  for (const name of alternatives)
    if (dependencies[name]) errors.push(`package.json: router-pinia-only: remove ${name}`)
  let exits: Record<string, DocumentExit[]> = {}
  if (existsSync(resolve(root, 'tools/navigation-policy.json'))) {
    try {
      const parsed: unknown = JSON.parse(read('tools/navigation-policy.json'))
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('documentNavigation' in parsed) ||
        !parsed.documentNavigation ||
        typeof parsed.documentNavigation !== 'object' ||
        Array.isArray(parsed.documentNavigation) ||
        Object.keys(parsed).some((key) => key !== 'documentNavigation')
      )
        throw new Error('expected documentNavigation map')
      for (const [file, rules] of Object.entries(parsed.documentNavigation)) {
        if (!sources.includes(file) || !Array.isArray(rules) || !rules.length)
          throw new Error(`invalid handoff file ${file}`)
        const reasons = new Set<string>()
        for (const rule of rules) {
          if (
            !rule ||
            typeof rule.reason !== 'string' ||
            !rule.reason.trim() ||
            Object.keys(rule).some(
              (key) => !['reason', 'target', 'serverRedirect'].includes(key),
            ) ||
            (typeof rule.target === 'string' && !rule.target.trim()) ||
            reasons.has(rule.reason) ||
            (typeof rule.target === 'string') === (rule.serverRedirect === true)
          )
            throw new Error(`invalid handoff for ${file}`)
          reasons.add(rule.reason)
        }
      }
      exits = parsed.documentNavigation as Record<string, DocumentExit[]>
    } catch (error) {
      errors.push(`tools/navigation-policy.json: document-navigation-policy: ${String(error)}`)
    }
  }
  for (const filename of sources) {
    const policy = {
      filename,
      shared,
      exits: exits[filename],
      entry: consumer && filename === 'web/ui/src/main.ts',
    }
    if (filename.endsWith('.ts')) errors.push(...checkArchitectureScript(read(filename), policy))
    else {
      const { descriptor } = parse(read(filename), { filename })
      const template = checkArchitectureTemplate(
        descriptor.template?.content ?? '',
        filename,
        shared,
      )
      errors.push(...template.errors)
      if (descriptor.script)
        errors.push(
          ...checkArchitectureScript(descriptor.script.content, { ...policy, exits: undefined }),
        )
      const content =
        (descriptor.script?.content ?? '') +
        '\n' +
        (descriptor.scriptSetup?.content ?? '') +
        '\n' +
        template.expressions.join('\n')
      errors.push(...checkArchitectureScript(content, { ...policy, setup: true }))
    }
  }
  return errors
}
