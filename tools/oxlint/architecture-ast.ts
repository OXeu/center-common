import ts from 'typescript'

export function unwrap(node: ts.Node): ts.Node {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAwaitExpression(node)
  )
    node = node.expression
  return node
}

export function literal(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined
  node = unwrap(node)
  if (ts.isStringLiteralLike(node) || (ts.isIdentifier(node) && node.text === 'undefined'))
    return node.text
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literal(node.left),
      right = literal(node.right)
    if (left !== undefined && right !== undefined) return left + right
  }
  return undefined
}

export function member(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression) ?? '*'
  return undefined
}

export function scriptModel(text: string, filename: string) {
  const virtual = filename.endsWith('.ts') ? filename : filename + '.ts'
  const source = ts.createSourceFile(virtual, text, ts.ScriptTarget.Latest, true)
  const host = ts.createCompilerHost({ noLib: true, noResolve: true })
  host.getSourceFile = (name) => (name === virtual ? source : undefined)
  host.fileExists = (name) => name === virtual
  host.readFile = (name) => (name === virtual ? text : undefined)
  const program = ts.createProgram([virtual], { noLib: true, noResolve: true }, host)
  const checker = program.getTypeChecker()
  const syntax = program.getSyntacticDiagnostics(source)

  function origin(node: ts.Node | undefined, seen = new Set<ts.Node>()): string[] | undefined {
    if (!node) return undefined
    node = unwrap(node)
    if (seen.has(node)) return undefined
    seen.add(node)
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if (
        (ts.isPropertyAccessExpression(parent) ||
          ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isPropertySignature(parent)) &&
        parent.name === node
      )
        return undefined
      if (ts.isBindingElement(parent) && parent.propertyName === node && parent.name !== node)
        return undefined
      const declarations = checker.getSymbolAtLocation(node)?.declarations
      const declaration = declarations?.[0]
      if (declaration) {
        if (ts.isImportSpecifier(declaration)) {
          const imported = declaration.parent.parent.parent
          return [
            literal(imported.moduleSpecifier) ?? '',
            declaration.propertyName?.text ?? declaration.name.text,
          ]
        }
        if (ts.isNamespaceImport(declaration))
          return [literal(declaration.parent.parent.moduleSpecifier) ?? '']
        if (ts.isImportClause(declaration))
          return [literal(declaration.parent.moduleSpecifier) ?? '']
        if (ts.isVariableDeclaration(declaration)) return origin(declaration.initializer, seen)
        if (ts.isBindingElement(declaration)) {
          const base = ts.isVariableDeclaration(declaration.parent.parent)
            ? origin(declaration.parent.parent.initializer, seen)
            : origin(declaration.parent.parent, seen)
          const property = declaration.propertyName ?? declaration.name
          return (
            base && [
              ...base,
              ts.isIdentifier(property) ? property.text : (literal(property) ?? '*'),
            ]
          )
        }
        return undefined
      }
      if (node.text === 'document') return ['document']
      if (['window', 'globalThis', 'self', 'top', 'parent'].includes(node.text)) return ['browser']
      if (
        [
          'location',
          'history',
          'localStorage',
          'sessionStorage',
          'open',
          'addEventListener',
        ].includes(node.text)
      )
        return ['browser', node.text]
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const base = origin(node.expression, seen)
      const property = member(node)!
      if (base?.length === 1 && base[0] === 'document') {
        if (property === 'location') return ['browser', 'location']
        if (property === 'defaultView') return ['browser']
      }
      if (base?.length === 1 && base[0] === 'browser' && property === 'document')
        return ['document']
      if (
        base?.length === 1 &&
        base[0] === 'browser' &&
        ['window', 'self', 'globalThis', 'top', 'parent'].includes(property)
      )
        return base
      return base && [...base, property]
    }
    if (ts.isCallExpression(node)) {
      const callee = origin(node.expression, seen)
      if (callee?.at(-1) === 'bind') return callee.slice(0, -1)
      if (callee?.join('#') === '@oxeu/center-common/ui/application.ts#createPageApplication')
        return ['application', String(node.pos)]
      if (
        callee?.[0] === 'vue' &&
        [
          'ref',
          'reactive',
          'shallowRef',
          'shallowReactive',
          'computed',
          'readonly',
          'customRef',
          'toRef',
          'toRefs',
          'shallowReadonly',
          'observable',
        ].includes(callee[1])
      )
        return ['reactive']
    }
    return undefined
  }

  function moduleScope(node: ts.Node): boolean {
    for (let parent = node.parent; parent; parent = parent.parent)
      if (ts.isFunctionLike(parent)) return false
    return true
  }
  function insideStore(node: ts.Node): boolean {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (
        ts.isCallExpression(parent) &&
        origin(parent.expression)?.join('#') === 'pinia#defineStore'
      )
        return true
    }
    return false
  }
  return { source, syntax, origin, moduleScope, insideStore }
}
