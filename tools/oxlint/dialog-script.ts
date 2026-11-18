import ts from 'typescript'
import { member, scriptModel, unwrap } from './architecture-ast.ts'
import { singleDropdownDialog } from './dialog-template.ts'

export function checkDialogScript(text: string, filename: string): string[] {
  const { source, checker } = scriptModel(text, filename)
  const errors: string[] = []
  const assignments = new Map<ts.Symbol, ts.BinaryExpression[]>()

  function collect(node: ts.Node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const symbol = checker.getSymbolAtLocation(node.left)
      if (symbol) assignments.set(symbol, [...(assignments.get(symbol) ?? []), node])
    }
    ts.forEachChild(node, collect)
  }
  collect(source)

  function resolve(node: ts.Node, before: number, seen = new Set<ts.Node>()): ts.Node[] {
    node = unwrap(node)
    if (seen.has(node)) return []
    seen = new Set([...seen, node])
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node)
      const declarations = symbol?.declarations ?? []
      const values = declarations.flatMap<ts.Node>((declaration) =>
        ts.isVariableDeclaration(declaration) && declaration.initializer
          ? [declaration.initializer]
          : ts.isFunctionDeclaration(declaration)
            ? [declaration]
            : [],
      )
      for (const assignment of symbol ? (assignments.get(symbol) ?? []) : [])
        if (assignment.pos < before) values.push(assignment.right)
      return values.flatMap((value) => resolve(value, before, seen))
    }
    if (ts.isConditionalExpression(node))
      return [node.whenTrue, node.whenFalse].flatMap((value) => resolve(value, before, seen))
    if (ts.isCallExpression(node) && !node.arguments.length) {
      const values = resolve(node.expression, before, seen).flatMap((callee) => {
        if (
          !(
            ts.isArrowFunction(callee) ||
            ts.isFunctionExpression(callee) ||
            ts.isFunctionDeclaration(callee)
          ) ||
          !callee.body ||
          callee.parameters.length
        )
          return []
        if (!ts.isBlock(callee.body)) return resolve(callee.body, before, seen)
        return callee.body.statements.flatMap((statement) =>
          ts.isReturnStatement(statement) && statement.expression
            ? resolve(statement.expression, before, seen)
            : [],
        )
      })
      if (values.length) return values
    }
    return [node]
  }

  function dropdown(node: ts.Node, before: number, seen = new Set<ts.Node>()): boolean {
    if (seen.has(node)) return false
    seen = new Set([...seen, node])
    return resolve(node, before).some(
      (value) =>
        ts.isObjectLiteralExpression(value) &&
        value.properties.some((property) => {
          if (ts.isSpreadAssignment(property)) return dropdown(property.expression, before, seen)
          const name = property.name
          return (
            name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'options'
          )
        }),
    )
  }

  function singleField(node: ts.Node, before: number, seen = new Set<ts.Node>()): boolean {
    if (seen.has(node)) return false
    seen = new Set([...seen, node])
    return resolve(node, before).some((value) => {
      if (!ts.isArrayLiteralExpression(value) || value.elements.length !== 1) return false
      const field = value.elements[0]
      return ts.isSpreadElement(field)
        ? singleField(field.expression, before, seen)
        : dropdown(field, before)
    })
  }

  function form(node: ts.Node): boolean {
    return resolve(node, node.pos).some((value) => {
      if (!ts.isCallExpression(value) || !ts.isIdentifier(value.expression)) return false
      const name = value.expression
      if (name.text === 'createForm') return true
      return (
        checker
          .getSymbolAtLocation(name)
          ?.declarations?.some(
            (declaration) =>
              ts.isImportSpecifier(declaration) && declaration.propertyName?.text === 'createForm',
          ) ?? false
      )
    })
  }

  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments.length >= 2) {
      const callee = unwrap(node.expression)
      if (
        (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
        member(callee) === 'show' &&
        form(callee.expression) &&
        singleField(node.arguments[1], node.pos)
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        errors.push(`${filename}:${line + 1}: ${singleDropdownDialog}: open a dropdown directly`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return errors
}
