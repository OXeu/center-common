import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as { devDependencies: Record<string, string> }
const common = read('.tmp/common/package.json')
const consumer = read('package.json')
for (const [name, version] of Object.entries(common.devDependencies)) {
  const requested = consumer.devDependencies[name]
  if (requested !== undefined && requested !== version)
    throw new Error(`${name}: use the common toolchain version ${version}, found ${requested}`)
}
for (const name of [
  'vue',
  'vue-router',
  'pinia',
  'vite-plus',
  'tailwindcss',
  'typescript',
  'vue-tsc',
]) {
  const version = (root: string) =>
    (
      JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as {
        version: string
      }
    ).version
  if (version('.') !== version('.tmp/common'))
    throw new Error(`${name}: consumer and common lockfiles must resolve the same version`)
}
