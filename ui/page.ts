export type PageContext = {
  msg: (id: string, vars?: Record<string, string>) => string
  csrf: string
  describe: (err: unknown) => string
  report: (err: unknown) => void
}

export type PageContextFactoryOptions = {
  createCopy: (
    lang: string,
    messages?: Record<string, string>,
  ) => { msg: (id: string, vars?: Record<string, string>) => string }
  describeError: (msg: (id: string) => string, err: unknown) => string
  notifyError: (title: string, description: string) => void
}

/** Creates a consumer `createPage` helper that binds copy, CSRF and toast error reporting. */
export function createPageFactory<
  T extends { lang: string; csrf: string; messages?: Record<string, string> },
>(options: PageContextFactoryOptions) {
  return function createPage(data: T): PageContext {
    const { msg } = options.createCopy(data.lang, data.messages)
    const describe = (err: unknown) => options.describeError(msg, err)
    return {
      msg,
      csrf: data.csrf,
      describe,
      report: (err: unknown) => options.notifyError(msg('error.title'), describe(err)),
    }
  }
}
