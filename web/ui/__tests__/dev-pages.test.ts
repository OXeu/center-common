import { afterEach, expect, it, vi } from 'vite-plus/test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite-plus'
import { devPages } from '../../../tools/dev-pages.ts'

afterEach(() => vi.unstubAllGlobals())

it('forwards navigation headers and returns page JSON without HTML transformations', async () => {
  let handler!: Connect.NextHandleFunction
  devPages({ backend: 'http://backend.test', home: '/home', routes: /^\/home/u }).configureServer({
    middlewares: {
      use: (fn: Connect.NextHandleFunction) => {
        handler = fn
      },
    },
  } as ViteDevServer)
  const payload = '{"title":"Home","data":{"page":"home"}}'
  const fetch = vi.fn().mockResolvedValue(
    new Response(payload, {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  const headers = new Map()
  const body = await new Promise((resolve, reject) =>
    handler(
      {
        method: 'GET',
        url: '/home?view=all',
        headers: {
          cookie: 'session=example',
          'accept-language': 'en',
          accept: 'application/json',
          'x-center-navigation': '1',
        },
      } as unknown as IncomingMessage,
      {
        setHeader: (key: string, value: string) => headers.set(key, value),
        end: resolve,
      } as unknown as ServerResponse,
      reject,
    ),
  )
  expect(fetch).toHaveBeenCalledWith(
    'http://backend.test/home?view=all',
    expect.objectContaining({
      headers: {
        cookie: 'session=example',
        'accept-language': 'en',
        accept: 'application/json',
        'x-center-navigation': '1',
      },
    }),
  )
  expect(body).toBe(payload)
  expect(headers.get('cache-control')).toBe('no-store')
})
