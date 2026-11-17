import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Plugin } from 'vite-plus'

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

export function iconSprite(): Plugin {
  const moduleID = 'virtual:remixicon.css'
  const resolvedID = `\0${moduleID}`
  let sprite = ''
  let fileName = ''
  return {
    name: 'remixicon-sprite',
    resolveId(id) {
      if (id === moduleID) return resolvedID
    },
    load(id) {
      if (id !== resolvedID) return
      const sources = ['web/ui/src', '.tmp/common/ui']
        .flatMap(files)
        .filter((path) => /\.(vue|ts)$/u.test(path))
      const names = new Set<string>()
      for (const path of sources) {
        this.addWatchFile(path)
        for (const match of readFileSync(path, 'utf8').matchAll(
          /\bri-([a-z0-9]+(?:-[a-z0-9]+)*-(?:line|fill))\b/gu,
        )) {
          names.add(match[1]!)
        }
      }
      const icons = new Map(
        files('node_modules/remixicon/icons').map((path) => [basename(path, '.svg'), path]),
      )
      const views: string[] = []
      const rules: string[] = []
      for (const [index, name] of [...names].sort().entries()) {
        const path = icons.get(name)
        if (!path) throw new Error(`Unknown Remix Icon: ${name}`)
        const source = readFileSync(path, 'utf8')
        const body = source
          .replace(/^[\s\S]*?<svg[^>]*>/u, '')
          .replace(/<\/svg>\s*$/u, '')
          .trim()
        views.push(`<g transform="translate(0 ${index * 24})">${body}</g>`)
        const position = names.size > 1 ? (index * 100) / (names.size - 1) : 0
        rules.push(`.ri-${name}{mask-position:0 ${position}%}`)
      }
      sprite = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="${names.size * 24}" viewBox="0 0 24 ${names.size * 24}">${views.join('')}</svg>`
      const hash = createHash('sha256').update(sprite).digest('hex').slice(0, 16)
      fileName = `remixicon-${hash}.svg`
      return `[class^="ri-"],[class*=" ri-"]{display:inline-block;width:1em;height:1em;background-color:currentColor;mask-image:url("/static/app/${fileName}");mask-repeat:no-repeat;mask-size:100% ${names.size * 100}%;vertical-align:-.125em}${rules.join('')}`
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: sprite })
    },
    configureServer(server) {
      server.middlewares.use('/static/app/', (request, response, next) => {
        if (!fileName || request.url?.split('?')[0] !== `/${fileName}`) return next()
        response.setHeader('Content-Type', 'image/svg+xml')
        response.end(sprite)
      })
    },
  }
}
