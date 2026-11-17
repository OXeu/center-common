import { readdirSync, readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vite-plus/test'
import { checkTemplate } from '../../../tools/oxlint/templates.ts'
import { checkDangerTemplate } from '../../../tools/oxlint/danger.ts'
import { checkDropdownStyles } from '../../../tools/oxlint/dropdown.ts'
import { checkIconLabels } from '../../../tools/oxlint/icon-labels.ts'

describe('shared components obey the consumer UI contracts', () => {
  for (const file of readdirSync('ui').filter((name) => name.endsWith('.vue'))) {
    it(file, () => {
      const source = readFileSync(`ui/${file}`, 'utf8')
      const { descriptor } = parse(source)
      const template = descriptor.template?.content ?? ''
      const filename = `web/ui/src/${file}`
      expect(checkTemplate(template, filename)).toEqual([])
      expect(checkDangerTemplate(template, filename, {})).toEqual([])
      expect(checkIconLabels(template, descriptor.scriptSetup?.content ?? '', {})).toEqual([])
      expect(descriptor.styles.flatMap((style) => checkDropdownStyles(style.content))).toEqual([])
      expect(source.split('\n').filter((line) => line.trim()).length).toBeLessThanOrEqual(400)
    })
  }
})
