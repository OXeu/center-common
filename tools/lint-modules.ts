import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// ownedModules lists the Go modules this organization maintains. Consumers
// depend on their published versions instead of keeping a copy in the tree.
const ownedModules = [
  'github.com/OXeu/center-common',
  'github.com/OXeu/configcenter/sdk/configcenter',
] as const

export type GoMod = {
  module: string
  requires: { path: string; version: string }[]
  replaces: { path: string; target: string }[]
}

const localTarget = /^(?:\.{1,2}\/|\/|file:)/u
const moduleLine = /^module\s+(\S+)/mu
const requireLine = /^require\s+(?:\(\s*)?(\S+)\s+(\S+)/mu
const replaceLine = /^replace\s+(\S+)(?:\s+v\S+)?\s+=>\s+(\S+)/mu

export function parseGoMod(text: string): GoMod {
  const result: GoMod = { module: moduleLine.exec(text)?.[1] ?? '', requires: [], replaces: [] }
  let block: 'require' | 'replace' | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/u, '').trim()
    if (!line) continue
    if (line === 'require (' || line === 'replace (') {
      block = line.startsWith('require') ? 'require' : 'replace'
      continue
    }
    if (line === ')') {
      block = null
      continue
    }
    if (block === 'require') {
      const [path, version] = line.split(/\s+/u)
      if (path && version) result.requires.push({ path, version })
      continue
    }
    if (block === 'replace') {
      const match = /^(\S+)(?:\s+v\S+)?\s+=>\s+(\S+)/u.exec(line)
      if (match?.[1] && match[2]) result.replaces.push({ path: match[1], target: match[2] })
      continue
    }
    const required = requireLine.exec(line)
    if (required?.[1] && required[2]) {
      result.requires.push({ path: required[1], version: required[2] })
      continue
    }
    const replaced = replaceLine.exec(line)
    if (replaced?.[1] && replaced[2]) {
      result.replaces.push({ path: replaced[1], target: replaced[2] })
    }
  }
  return result
}

const leaf = (path: string) => path.split('/').at(-1) ?? ''

// checkModuleSources rejects copies of owned modules: local replace
// directives, nested go.mod files that redeclare one, and directories that
// shadow its package name. Every consumer must depend on the published module
// so all repositories share one reviewed implementation.
export function checkModuleSources(root: string, files: string[]): string[] {
  const errors: string[] = []
  const modPath = resolve(root, 'go.mod')
  if (!existsSync(modPath)) return errors
  const module = parseGoMod(readFileSync(modPath, 'utf8'))
  // The repository that publishes an owned module keeps it in tree by design.
  const hosted = ownedModules.filter(
    (owned) => owned === module.module || owned.startsWith(`${module.module}/`),
  )
  const isHosted = (target: string) => hosted.some((owned) => owned === target)
  const hostedDirs = hosted.map((owned) => owned.slice(module.module.length + 1)).filter(Boolean)

  const bootstrapped = existsSync(resolve(root, 'common.lock.json'))
  for (const replacement of module.replaces) {
    if (!(ownedModules as readonly string[]).includes(replacement.path)) continue
    if (!localTarget.test(replacement.target)) continue
    if (isHosted(replacement.path)) continue
    const normalized = replacement.target.replace(/^\.\//u, '')
    if (bootstrapped && normalized === '.tmp/common') continue
    errors.push(
      `go.mod: require-remote-modules: replace ${replacement.path} => ${replacement.target} binds a local copy; require the published module version instead`,
    )
  }

  for (const file of files) {
    if (!file.endsWith('go.mod') || file === 'go.mod') continue
    const path = resolve(root, file)
    if (!existsSync(path)) continue
    const nested = parseGoMod(readFileSync(path, 'utf8')).module
    if (!(ownedModules as readonly string[]).includes(nested)) continue
    if (isHosted(nested)) continue
    errors.push(
      `${file}: require-remote-modules: remove this copy of ${nested} and require the published module`,
    )
  }

  for (const file of files) {
    if (!/\.go$/u.test(file) || !existsSync(resolve(root, file))) continue
    const parts = dirname(file).split('/')
    if (hostedDirs.some((dir) => dirname(file) === dir || dirname(file).startsWith(`${dir}/`))) {
      continue
    }
    for (const name of parts) {
      if (name === '.' || name === module.module) continue
      if (parts.at(-1) === 'cmd' && name === file.split('/')[1]) continue
      if (!ownedModules.some((owned) => leaf(owned) === name)) continue
      if (module.module.includes(`/${name}`) || module.module.endsWith(`/${name}`)) continue
      errors.push(
        `${file}: require-remote-modules: directory ${name} shadows an owned module; import the published package instead of copying it`,
      )
      break
    }
  }
  return errors
}
