const confirmedAction = Symbol('confirmedAction')

export type DangerAction<Op extends string = string> = {
  [confirmedAction]: true
  id: Op
  label: string
  request: () => void
}

export type DangerFormTarget = {
  danger: boolean
  description?: string
  show(
    title: string,
    fields: any[],
    values: Record<string, string>,
    action: () => Promise<void>,
  ): void
}

export type DangerActionOptions = {
  fields?: any[]
  values?: Record<string, string>
  description?: string
}

/** Creates a confirmed destructive action bound to the consumer dialog form. */
export function createDangerAction<Op extends string>(
  form: DangerFormTarget,
  id: Op,
  label: string,
  target: string,
  execute: () => Promise<void>,
  options: DangerActionOptions = {},
): DangerAction<Op> {
  return {
    [confirmedAction]: true,
    id,
    label,
    request() {
      form.show(`${label}: ${target}`, options.fields ?? [], options.values ?? {}, execute)
      if ('description' in form) form.description = options.description ?? ''
      form.danger = true
    },
  }
}
