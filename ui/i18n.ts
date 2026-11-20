export type Copy = {
  msg: (id: string, vars?: Record<string, string>) => string
  lang: string
}

export type FallbackCatalogs = Readonly<Record<string, Readonly<Record<string, string>>>>

/** Interpolates `{{var}}` and `{{.var}}` placeholders in a localized message template. */
export function interpolateMessage(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{\{\.?(\w+)\}\}/gu, (_, name: string) => vars[name] ?? '')
}

/** Creates a `createCopy` factory backed by the consumer's fallback locale catalogs. */
export function createCopyFactory(fallbackMessages: FallbackCatalogs) {
  return function createCopy(lang: string, serverMessages: Record<string, string> = {}): Copy {
    const table = { ...fallbackMessages.en, ...fallbackMessages[lang], ...serverMessages }
    const msg = (id: string, vars: Record<string, string> = {}): string =>
      interpolateMessage(table[id] ?? id, vars)
    return { msg, lang }
  }
}
