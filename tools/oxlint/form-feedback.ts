import { parse } from '@vue/compiler-dom'
import ts from 'typescript'

const feedbackWords = new Set([
  'error',
  'errors',
  'success',
  'failure',
  'feedback',
  'notice',
  'notification',
  'flash',
  'message',
  'messages',
  'submitted',
  'result',
])

const feedbackPattern =
  /^(?:error|errors|success|failure|feedback|message)$|^(?:form|submit|submission|save|request|response|server|api).*(?:error|success|failure|message|feedback|result)$|^(?:error|success|failure)(?:message|text)$/iu
const formStatePattern = /^(?:form|submission|submit|response|request)$/iu

function reference(node: ts.Node): string[] {
  if (ts.isIdentifier(node)) return [node.text]
  if (ts.isPropertyAccessExpression(node)) return [...reference(node.expression), node.name.text]
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return [...reference(node.expression), node.argumentExpression.text]
  return []
}

/** Creates an expression predicate for `checkTemplate` that detects inline form feedback bindings. */
export function formFeedback(script = '') {
  const variables = new Map<string, ts.Expression>()
  const file = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true)
  function collect(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      variables.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(file)
  function detects(node: ts.Node, field: boolean, seen = new Set<string>()): boolean {
    if (ts.isPropertyAssignment(node)) return detects(node.initializer, field, seen)
    const path = reference(node)
    if (path.length) {
      const name = path.at(-1)!.replaceAll('_', '')
      if (field && path[0] === 'field' && path.length === 2) return false
      if (
        feedbackPattern.test(name) &&
        !(path.length > 1 && ['event', 'row', 'log'].includes(path[0]))
      )
        return true
      if (path.some((part) => formStatePattern.test(part)) && /^(?:result|status)$/iu.test(name))
        return true
      const value = variables.get(path[0])
      if (value && !seen.has(path[0])) return detects(value, field, new Set([...seen, path[0]]))
      return false
    }
    if (ts.isCallExpression(node) && node.expression.getText() === 'msg')
      return node.arguments.some(
        (arg) =>
          ts.isStringLiteralLike(arg) &&
          /^(?:toast\.|error\.|form\.(?:success|error))/u.test(arg.text),
      )
    return ts.forEachChild(node, (child) => detects(child, field, seen) || undefined) ?? false
  }
  return (source: string, field: boolean): boolean => {
    const parsed = ts.createSourceFile('feedback.ts', `(${source})`, ts.ScriptTarget.Latest, true)
    return detects(parsed, field)
  }
}

function feedbackName(name: string, validation: boolean): boolean {
  const words = name
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/\W|_/u)
  if (validation && name === 'validationError') return false
  if (['failed', 'succeeded', 'saved'].includes(words.at(-1) ?? ''))
    return (
      words.length === 1 ||
      words.some((word) => /^(is|has|form|submit|submission|request|save)$/u.test(word))
    )
  if (['status', 'response'].includes(words.at(-1) ?? ''))
    return words.some((word) => /^(form|submit|submission|request|mutation)$/u.test(word))
  return words.some((word) => feedbackWords.has(word))
}

/** Checks a Vue template and setup script for inline form feedback instead of toast notifications. */
export function checkFormFeedback(template: string, script = ''): string[] {
  const variables = new Map<string, ts.Expression>()
  const file = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true)
  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      variables.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(file)
  function feedback(node: ts.Node, validation: boolean, seen = new Set<string>()): boolean {
    if (ts.isIdentifier(node)) {
      if (feedbackName(node.text, validation)) return true
      const value = variables.get(node.text)
      return Boolean(
        value && !seen.has(node.text) && feedback(value, validation, new Set([...seen, node.text])),
      )
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression
      if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
        if (name.text === 'value') return feedback(node.expression, validation, seen)
        if (validation && node.expression.getText() === 'field' && name.text === 'error')
          return false
        if (['ok', 'status', 'response'].includes(name.text))
          return /^(form|submit|submission|request|response|mutation)$/u.test(
            node.expression.getText(),
          )
        return feedbackName(name.text, validation)
      }
    }
    if (ts.isStringLiteralLike(node))
      return /^(toast\.|error\.|authError\.|login\.codeSent$)/u.test(node.text)
    if (ts.isPropertyAssignment(node)) return feedback(node.initializer, validation, seen)
    return Boolean(ts.forEachChild(node, (child) => feedback(child, validation, seen) || undefined))
  }
  function expression(source: string, validation: boolean): boolean {
    return feedback(
      ts.createSourceFile('expression.ts', `(${source})`, ts.ScriptTarget.Latest, true),
      validation,
    )
  }
  function walk(node: any, dialog = false, field = false, validation = false): boolean {
    if (node.type === 5 && expression(node.content.content, validation)) return true
    if (node.type === 1) {
      const attrs = Object.fromEntries(
        node.props
          .filter((prop: any) => prop.type === 6)
          .map((prop: any) => [prop.name, prop.value?.content ?? '']),
      )
      dialog ||= node.tag === 'dialog'
      field ||= (attrs.class ?? '').split(/\s+/u).includes('field')
      validation =
        dialog && field && ['p', 'span', 'small', 'div', 'label', 'template'].includes(node.tag)
      if (
        /\b(?:(?:form|submit|submission|request|response)-(?:result|status|feedback)|(?:success|error|failure)-message)\b/u.test(
          attrs.class ?? '',
        )
      )
        return true
      for (const prop of node.props) {
        if (prop.type !== 7 || !prop.exp) continue
        if (
          ['if', 'else-if', 'show', 'text', 'html', 'for'].includes(prop.name) ||
          (prop.name === 'bind' && !['key', 'ref', 'disabled'].includes(prop.arg?.content))
        ) {
          if (expression(prop.exp.content, validation)) return true
        }
      }
    }
    return (node.children ?? []).some((child: any) => walk(child, dialog, field, validation))
  }
  return walk(parse(template)) ? ['form-feedback-requires-toast'] : []
}
