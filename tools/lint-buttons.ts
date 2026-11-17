import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { inspectButtonScript } from './oxlint/button-script.ts'
import { checkButtonTemplate } from './oxlint/button-template.ts'
import { checkButtonStyles } from './oxlint/button-styles.ts'

export function checkButtons(root: string, files: string[]): string[] {
  const errors: string[] = []
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
  const manifest = existsSync(resolve(root, 'package.json')) ? JSON.parse(read('package.json')) : {}
  const shared =
    manifest.name === '@oxeu/center-common' && !existsSync(resolve(root, 'common.lock.json'))
  for (const filename of files) {
    if (
      /^(?:tools|config|docs|\.github)\//u.test(filename) ||
      /(?:^|\/)(?:__tests__|fixtures)\/|\.(?:test|spec)\.ts$/u.test(filename) ||
      !existsSync(resolve(root, filename))
    )
      continue
    if (filename.endsWith('.css'))
      errors.push(...checkButtonStyles(read(filename), filename, shared))
    else if (/\.(?:vue|ts)$/u.test(filename)) {
      const descriptor = filename.endsWith('.vue')
        ? parse(read(filename), { filename }).descriptor
        : undefined
      const script = descriptor
        ? (descriptor.script?.content ?? '') + '\n' + (descriptor.scriptSetup?.content ?? '')
        : read(filename)
      const inspection = inspectButtonScript(script, filename, shared)
      errors.push(...inspection.errors)
      for (const source of [descriptor?.template?.content ?? '', ...inspection.templates])
        errors.push(...checkButtonTemplate(source, filename, shared, inspection.buttons))
      for (const style of descriptor?.styles ?? [])
        errors.push(...checkButtonStyles(style.content, filename, shared))
    }
  }
  return errors
}
