import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'

export function checkScripts(root: string): string[] {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
  const errors: string[] = []
  for (const filename of files) {
    const path = resolve(root, filename)
    if (!lstatSync(path, { throwIfNoEntry: false })) continue
    const extension = extname(filename).toLowerCase()
    if (/^\.(?:[cm]?js|jsx|[cm]ts|tsx)$/u.test(extension)) {
      errors.push(`${filename}: scripts-use-typescript: use .ts instead of ${extension}`)
    } else if (extension === '.vue') {
      const { descriptor, errors: parseErrors } = parse(readFileSync(path, 'utf8'), {
        filename,
        ignoreEmpty: false,
      })
      for (const error of parseErrors) {
        errors.push(`${filename}: ${typeof error === 'string' ? error : error.message}`)
      }
      for (const script of [descriptor.script, descriptor.scriptSetup]) {
        if (!script) continue
        if (script.lang !== 'ts' || (script.src && extname(script.src) !== '.ts')) {
          errors.push(`${filename}: scripts-use-typescript: use <script lang="ts"> and .ts sources`)
        }
      }
    }
  }
  return errors
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkScripts(process.cwd())
  if (errors.length) {
    process.stderr.write(errors.join('\n') + '\n')
    process.exitCode = 1
  }
}
