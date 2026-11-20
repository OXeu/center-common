export type ApiInit = {
  method?: string
  body?: unknown
  csrf?: string
  headers?: Record<string, string>
}

/** Creates a JSON API client that attaches optional service headers and CSRF tokens. */
export function createApi(defaultHeaders: Readonly<Record<string, string>> = {}) {
  return async function api<T = any>(path: string, init: ApiInit = {}): Promise<T> {
    const method = init.method ?? 'GET'
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...defaultHeaders,
      ...init.headers,
      'X-CSRF-Token': init.csrf ?? '',
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const resp = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    if (resp.status === 204) return null as T
    const data: any = await resp.json().catch(() => ({}))
    if (!resp.ok)
      throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${resp.status}`, {
        cause: resp.status,
      })
    return data as T
  }
}

/** Calls the JSON API and turns `{ error }` failures into an Error with the HTTP status as `cause`. */
export async function api<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  return createApi()(path, init)
}

/** Formats a non-zero ISO timestamp using the current locale. */
export function timeOnly(iso: string | null | undefined): string {
  if (!iso || iso.startsWith('0001-')) return ''
  return new Date(iso).toLocaleString()
}
