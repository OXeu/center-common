export const defaultStatusMessages: Readonly<Record<number, string>> = {
  400: 'error.badRequest',
  401: 'error.unauthorized',
  403: 'error.forbidden',
  404: 'error.notFound',
  409: 'error.conflict',
  429: 'error.rateLimit',
  500: 'error.500',
  502: 'error.502',
}

/** Extracts the human-readable message string from an unknown error value. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Extracts the numeric HTTP status code stored in `err.cause` (or 0 on network errors). */
export function codeOf(err: unknown): number {
  const code = err instanceof Error ? err.cause : undefined
  return typeof code === 'number' ? code : 0
}

export type ErrorDescriptorOptions = {
  knownCodes?: readonly string[]
  codePrefix?: string
  statusMessages?: Readonly<Record<number, string>>
}

/** Translates a failed request by error code or HTTP status while preserving server text on unknown codes. */
export function describeError(
  msg: (id: string) => string,
  err: unknown,
  options: ErrorDescriptorOptions = {},
): string {
  const message = messageOf(err)
  if (options.knownCodes?.includes(message)) {
    return msg(`${options.codePrefix ?? 'authError.'}${message}`)
  }
  const code = codeOf(err)
  const statusMap = options.statusMessages ?? defaultStatusMessages
  const key = code === 0 ? 'error.network' : statusMap[code]
  if (key === undefined) return message
  const known = msg(key)
  return known === key ? message : known
}
