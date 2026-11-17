export type DevPagesOptions = { backend: string; home: string; routes: RegExp }

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {(error?: unknown) => void} next */
async function serve(
  options: DevPagesOptions,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  next: (error?: unknown) => void,
) {
  if (req.url === '/') {
    res.statusCode = 302
    res.setHeader('Location', options.home)
    res.end()
    return
  }
  if (req.method !== 'GET' || !options.routes.test(req.url ?? '')) return next()
  try {
    const response = await fetch(`${options.backend}${req.url}`, {
      redirect: 'manual',
      headers: {
        cookie: req.headers.cookie ?? '',
        'accept-language': req.headers['accept-language'] ?? '',
        ...(req.headers.accept ? { accept: req.headers.accept } : {}),
        ...(req.headers['x-center-navigation'] === '1' ? { 'x-center-navigation': '1' } : {}),
      },
    })
    res.statusCode = response.status
    for (const [key, value] of response.headers) {
      if (
        ![
          'content-length',
          'content-encoding',
          'transfer-encoding',
          'content-security-policy',
        ].includes(key)
      )
        res.setHeader(key, value)
    }
    if (!response.headers.get('content-type')?.includes('text/html')) {
      res.end(await response.text())
      return
    }
    const html = await response.text()
    res.end(
      html
        .replace(/<link rel="stylesheet" href="\/static\/app\/[^"]+\.css"\s*\/?>/gu, '')
        .replace(/\/static\/app\/[^"]+\.js/gu, '/web/ui/src/main.ts')
        .replace('</head>', '<script type="module" src="/@vite/client"></script></head>'),
    )
  } catch (error) {
    next(error)
  }
}

/** @returns {import('vite-plus').Plugin} */
export function devPages(options: DevPagesOptions) {
  return {
    name: 'center-pages',
    configureServer(server: import('vite-plus').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void serve(options, req, res, next)
      })
    },
  }
}
