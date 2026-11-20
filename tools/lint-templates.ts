import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { checkTemplate } from './oxlint/templates.ts'
import { checkDangerTemplate } from './oxlint/danger.ts'
import { checkIconLabels } from './oxlint/icon-labels.ts'
import { checkDropdownStyles } from './oxlint/dropdown.ts'

export type ConsumerTemplateLintOptions = {
  rootDir?: string
  uiDir?: string
  localesDir?: string
  dangerOperations?: Record<string, string>
  dangerOptions?: { button?: boolean; accountSignOut?: boolean }
}

/** Validates consumer Vue templates, icon labels, danger actions and dropdown styles. */
export function lintConsumerTemplates(options: ConsumerTemplateLintOptions = {}): string[] {
  const root = options.rootDir ?? process.cwd()
  const dir = resolve(root, options.uiDir ?? 'web/ui/src')
  const localeDir = resolve(root, options.localesDir ?? 'internal/i18n/locales')
  const catalogs = Object.fromEntries(
    readdirSync(localeDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file.replace(/\.json$/u, ''),
        JSON.parse(readFileSync(resolve(localeDir, file), 'utf8')) as Record<string, string>,
      ]),
  )
  const errors: string[] = []
  for (const file of readdirSync(dir)) {
    const path = `${options.uiDir ?? 'web/ui/src'}/${file}`
    const full = resolve(dir, file)
    if (file.endsWith('.css')) {
      for (const err of checkDropdownStyles(readFileSync(full, 'utf8'), file === 'style.css')) {
        errors.push(`${path}: ${err}`)
      }
    }
    if (!file.endsWith('.vue')) continue
    const { descriptor } = parse(readFileSync(full, 'utf8'), { filename: path })
    const source = descriptor.template?.content ?? ''
    const script = [descriptor.script?.content, descriptor.scriptSetup?.content]
      .filter(Boolean)
      .join('\n')
    for (const err of [
      ...checkTemplate(source, path),
      ...checkDangerTemplate(
        source,
        path,
        options.dangerOperations ?? {},
        options.dangerOptions ?? {},
      ),
      ...checkIconLabels(source, script, catalogs),
    ]) {
      errors.push(`${path}: ${err}`)
    }
    for (const block of descriptor.styles) {
      for (const err of checkDropdownStyles(block.content)) {
        errors.push(`${path}: ${err}`)
      }
    }
  }
  return errors
}
