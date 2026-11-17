import { posix } from 'node:path'
import ts from 'typescript'

export function inspectButtonScript(source: string, filename: string, shared: boolean) {
  const file = ts.createSourceFile(filename + '.ts', source, ts.ScriptTarget.Latest, true)
  const imports = new Map<string, string[]>()
  const variables = new Map<string, ts.Expression>()
  const errors: string[] = []
  const templates: string[] = []
  function collect(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text
      const clause = node.importClause
      if (clause?.name) imports.set(clause.name.text, [module, 'default'])
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, [module])
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          imports.set(item.name.text, [module, item.propertyName?.text ?? item.name.text])
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      variables.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(file)
  function value(node: ts.Node | undefined, seen = new Set<string>()): string | undefined {
    if (!node) return undefined
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
      return value(node.expression, seen)
    if (ts.isIdentifier(node) && !seen.has(node.text))
      return value(variables.get(node.text), new Set([...seen, node.text]))
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = value(node.left, seen),
        right = value(node.right, seen)
      if (left !== undefined && right !== undefined) return left + right
    }
    return undefined
  }
  function origin(node: ts.Node, seen = new Set<string>()): string[] {
    if (ts.isIdentifier(node)) {
      if (imports.has(node.text)) return imports.get(node.text)!
      if (!seen.has(node.text) && variables.has(node.text))
        return origin(variables.get(node.text)!, new Set([...seen, node.text]))
      return [node.text]
    }
    if (ts.isPropertyAccessExpression(node))
      return [...origin(node.expression, seen), node.name.text]
    if (ts.isElementAccessExpression(node))
      return [...origin(node.expression, seen), value(node.argumentExpression) ?? '']
    return []
  }
  const buttons = new Set<string>()
  for (const [name, [module]] of imports) {
    if (
      module === '@oxeu/center-common/ui/Button.vue' ||
      (shared &&
        module.startsWith('.') &&
        posix.normalize(posix.join(posix.dirname(filename), module)) === 'ui/Button.vue')
    )
      buttons.add(name)
    else if (!module.startsWith('.') && /button/iu.test(name + module))
      errors.push(
        `${filename}: button-use-shared: import Button from @oxeu/center-common/ui/Button.vue`,
      )
  }
  function report(node: ts.Node) {
    const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
    errors.push(
      `${filename}:${line}: button-use-shared: do not construct buttons in render functions or DOM code`,
    )
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = origin(node.expression)
      const render =
        callee[0] === 'vue' &&
        [
          'h',
          'createVNode',
          'createElementVNode',
          'createElementBlock',
          'createBlock',
          'resolveDynamicComponent',
        ].includes(callee.at(-1) ?? '')
      const dom = ['createElement', 'createElementNS'].includes(callee.at(-1) ?? '')
      if (render || dom) {
        const tag = value(
          node.arguments[callee.at(-1) === 'createElementNS' ? 1 : 0],
        )?.toLowerCase()
        const props = node.arguments[1]
        const action =
          props &&
          ts.isObjectLiteralExpression(props) &&
          props.properties.some((property) => {
            if (!ts.isPropertyAssignment(property)) return false
            const name = ts.isIdentifier(property.name) ? property.name.text : value(property.name)
            return (
              (name === 'role' && value(property.initializer) === 'button') ||
              /^on(?:Click|Keydown|Keyup)$/u.test(name ?? '')
            )
          })
        if (
          tag === 'button' ||
          (tag === 'input' && action) ||
          (tag && action && /^[a-z]+$/u.test(tag))
        )
          report(node)
        if (
          tag === 'input' &&
          props &&
          ts.isObjectLiteralExpression(props) &&
          props.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(file).replace(/['"]/gu, '') === 'type' &&
              ['button', 'submit', 'reset', 'image'].includes(value(property.initializer) ?? ''),
          )
        )
          report(node)
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file).replace(/['"]/gu, '') === 'template'
    ) {
      const template = value(node.initializer)
      if (template) templates.push(template)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return { buttons, errors, templates }
}
