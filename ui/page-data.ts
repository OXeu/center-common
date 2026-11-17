/** A page response that must be handled by a full document navigation. */
export class DocumentNavigation extends Error {}

/** Loads an authenticated page payload through its existing server route. */
export async function loadPageData(path: string, signal: AbortSignal) {
  const response = await fetch(path, {
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'X-Center-Navigation': '1' },
  })
  if (
    response.redirected ||
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    throw new DocumentNavigation(`Cannot navigate to ${path}: HTTP ${response.status}`)
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== 'object' ||
    !('data' in result) ||
    !('title' in result) ||
    typeof result.title !== 'string'
  )
    throw new Error('Invalid page response')
  return { data: result.data, title: result.title }
}
