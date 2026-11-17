import { parse } from '@vue/compiler-dom'
import ts from 'typescript'

const controls = ['button', 'a', 'NavigationLink', 'navigation-link', 'RouterLink', 'router-link']

function hidden(node: any): boolean {
  return (
    node.type === 1 &&
    node.props.some(
      (p: any) =>
        p.type === 6 &&
        ((p.name === 'class' && /\bsr-only\b/u.test(p.value?.content ?? '')) ||
          p.name === 'hidden'),
    )
  )
}
function icon(node: any): boolean {
  return (
    node.type === 1 &&
    (node.tag === 'i' ||
      /icon$/iu.test(node.tag) ||
      node.props.some((p: any) => p.name === 'class' && /\bri-/u.test(p.value?.content ?? '')))
  )
}

function hasIcon(node: any): boolean {
  return icon(node) || (node.children ?? []).some(hasIcon)
}

export function checkIconLabels(
  template: string,
  script: string,
  catalogs: Record<string, Record<string, string>>,
): string[] {
  const errors: string[] = []
  const variables = new Map<string, ts.Expression>()
  const file = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true)
  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      variables.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(file)
  function resolve(
    node: ts.Node,
    messages: Record<string, string>,
    seen = new Set<string>(),
  ): string[] | null {
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (ts.isParenthesizedExpression(node)) return resolve(node.expression, messages, seen)
    if (ts.isConditionalExpression(node)) {
      const yes = resolve(node.whenTrue, messages, seen)
      const no = resolve(node.whenFalse, messages, seen)
      return yes && no ? [...yes, ...no] : null
    }
    if (ts.isIdentifier(node)) {
      const value = variables.get(node.text)
      if (!value || seen.has(node.text)) return null
      return resolve(value, messages, new Set([...seen, node.text]))
    }
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body))
      return resolve(node.body, messages, seen)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'computed' && node.arguments[0])
        return resolve(node.arguments[0], messages, seen)
      if (node.expression.text === 'msg' && node.arguments.length === 1) {
        const ids = resolve(node.arguments[0], messages, seen)
        if (!ids || ids.some((id) => messages[id] === undefined || /\{\{/u.test(messages[id])))
          return null
        return ids.map((id) => messages[id])
      }
    }
    return null
  }
  function expression(source: string, messages: Record<string, string>): string[] | null {
    const parsed = ts.createSourceFile('label.ts', `(${source})`, ts.ScriptTarget.Latest, true)
    const statement = parsed.statements[0]
    return statement && ts.isExpressionStatement(statement)
      ? resolve(statement.expression, messages)
      : null
  }
  function texts(node: any, messages: Record<string, string>): string[] | null {
    if (hidden(node) || (icon(node) && !controls.includes(node.tag))) return ['']
    if (node.type === 2) return [node.content]
    if (node.type === 5) return expression(node.content.content, messages)
    let values = ['']
    for (const child of node.children ?? []) {
      const parts = texts(child, messages)
      if (!parts) return null
      values = values.flatMap((value) => parts.map((part) => value + part))
    }
    return values
  }
  function walk(node: any): void {
    if (node.type === 1) {
      const marked = node.props.some(
        (p: any) => p.name === 'data-icon-button' || p.name === 'icon' || p.arg?.content === 'icon',
      )
      const control = controls.includes(node.tag) || /button$/iu.test(node.tag)
      if ((control && hasIcon(node)) || marked || /^icon-?button$/iu.test(node.tag)) {
        for (const [lang, messages] of Object.entries(catalogs)) {
          const label =
            !controls.includes(node.tag) &&
            node.props.find((p: any) => p.name === 'label' || p.arg?.content === 'label')
          const values = label
            ? label.type === 6
              ? [label.value?.content ?? '']
              : expression(label.exp?.content ?? '', messages)
            : texts(node, messages)
          if (!values) errors.push(`icon-button-label-unresolved:${lang}`)
          else
            for (const value of values) {
              const text = value.replace(/\s+/gu, ' ').trim()
              const limit = /\p{Script=Han}/u.test(text) ? 4 : 10
              if ([...text].length > limit)
                errors.push(`icon-button-label-too-long:${lang}:${text}`)
            }
        }
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(parse(template))
  return [...new Set(errors)]
}
