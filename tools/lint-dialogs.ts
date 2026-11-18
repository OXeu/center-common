import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { checkDialogScript } from './oxlint/dialog-script.ts'
import { checkDialogTemplate } from './oxlint/dialog-template.ts'

export function checkDialogs(root: string, files: string[]): string[] {
  const errors: string[] = []
  for (const filename of files) {
    if (
      !/^(?:web\/ui\/src|ui)\//u.test(filename) ||
      !/\.(?:vue|ts)$/u.test(filename) ||
      /\.(?:test|spec)\.ts$/u.test(filename) ||
      !existsSync(resolve(root, filename))
    )
      continue
    const source = readFileSync(resolve(root, filename), 'utf8')
    if (filename.endsWith('.ts')) errors.push(...checkDialogScript(source, filename))
    else {
      const { descriptor } = parse(source, { filename })
      errors.push(
        ...checkDialogTemplate(descriptor.template?.content ?? '').map(
          (error) => `${filename}: ${error}`,
        ),
      )
      for (const script of [descriptor.script, descriptor.scriptSetup])
        if (script) errors.push(...checkDialogScript(script.content, filename))
    }
  }
  return errors
}
