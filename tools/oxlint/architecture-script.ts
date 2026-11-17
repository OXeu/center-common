import ts from 'typescript'
import { literal, scriptModel, unwrap } from './architecture-ast.ts'

export type DocumentExit = { reason: string; target?: string; serverRedirect?: boolean }
export type ScriptPolicy = {
  filename: string
  setup?: boolean
  shared?: boolean
  exits?: DocumentExit[]
  entry?: boolean
}
export const alternatives = [
  'vuex',
  'redux',
  '@reduxjs/toolkit',
  'mobx',
  'zustand',
  'nanostores',
  '@nanostores/vue',
  'navigo',
  'page',
  'wouter',
  '@tanstack/vue-router',
]

export function checkArchitectureScript(text: string, policy: ScriptPolicy): string[] {
  const model = scriptModel(text, policy.filename)
  const errors: string[] = model.syntax.map(
    (error) =>
      `${policy.filename}: architecture-script-syntax: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`,
  )
  const factories = new Set<string>(),
    mounted = new Set<string>(),
    ready = new Set<string>()
  const usedExits = new Set<string>()
  const adapter =
    policy.shared && ['ui/navigation.ts', 'ui/application.ts'].includes(policy.filename)
  const themeStorage = policy.shared && policy.filename === 'ui/theme.ts'
  const bootstrap = policy.shared && policy.filename === 'ui/application.ts'
  function report(node: ts.Node, rule: string, message: string) {
    const { line, character } = model.source.getLineAndCharacterOfPosition(node.getStart())
    errors.push(`${policy.filename}:${line + 1}:${character + 1}: ${rule}: ${message}`)
  }
  function visit(node: ts.Node) {
    if (
      !policy.setup &&
      ts.isVariableDeclaration(node) &&
      model.moduleScope(node) &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer)
      if (ts.isCallExpression(initializer)) {
        const fn = unwrap(initializer.expression)
        if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
          const inspect = (child: ts.Node) => {
            if (child !== fn && ts.isFunctionLike(child)) return
            if (ts.isCallExpression(child) && model.origin(child)?.[0] === 'reactive')
              report(
                node,
                'pinia-shared-state',
                'an immediately invoked factory still creates module-level state',
              )
            ts.forEachChild(child, inspect)
          }
          inspect(fn)
        }
      }
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const name = literal(node.moduleSpecifier)
      const documentHelper = '@oxeu/center-common/ui/navigation.ts'
      if (
        name === documentHelper &&
        !adapter &&
        (ts.isExportDeclaration(node) || !policy.exits?.length)
      )
        report(
          node,
          'document-navigation-policy',
          'import the document handoff only at its declared call site; do not re-export it',
        )
      if (
        ts.isImportDeclaration(node) &&
        name !== documentHelper &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.some(
          (item) => (item.propertyName?.text ?? item.name.text) === 'navigateDocument',
        )
      )
        report(
          node,
          'document-navigation-policy',
          'import navigateDocument directly from the shared navigation module',
        )
      if (name && alternatives.some((pkg) => name === pkg || name.startsWith(pkg + '/')))
        report(
          node,
          'router-pinia-only',
          'use Vue Router and Pinia instead of another routing or state library',
        )
    }
    const ref = model.origin(node)
    if (ts.isCallExpression(node)) {
      const callee = model.origin(node.expression)
      const name = callee?.join('#')
      if (
        !bootstrap &&
        [
          'vue#createApp',
          'vue#createSSRApp',
          'pinia#createPinia',
          'vue-router#createRouter',
          'vue-router#createWebHistory',
          'vue-router#createWebHashHistory',
          'vue-router#createMemoryHistory',
        ].includes(name ?? '')
      )
        report(
          node,
          'require-router-pinia-bootstrap',
          'initialize applications through createPageApplication',
        )
      if (ref?.[0] === 'application' && model.moduleScope(node)) factories.add(ref[1])
      if (callee?.[0] === 'application') {
        if (callee.slice(2).join('.') === 'app.mount') mounted.add(callee[1])
        if (callee.slice(2).join('.') === 'router.isReady') ready.add(callee[1])
      }
      if (
        ['vue#h', 'vue#createVNode', 'vue#createElementVNode'].includes(name ?? '') &&
        literal(node.arguments[0]) === 'a'
      )
        report(
          node,
          'router-links-only',
          'render NavigationLink or RouterLink instead of an anchor',
        )
      if (name === '@oxeu/center-common/ui/navigation.ts#navigateDocument') {
        const reason = literal(node.arguments[1])
        const exit = policy.exits?.find((item) => item.reason === reason)
        const target = node.arguments[0] && unwrap(node.arguments[0])
        const serverRedirect =
          target &&
          ((ts.isPropertyAccessExpression(target) && target.name.text === 'redirect') ||
            (ts.isElementAccessExpression(target) &&
              literal(target.argumentExpression) === 'redirect'))
        if (
          !exit ||
          (exit.target !== undefined ? literal(target) !== exit.target : !serverRedirect)
        )
          report(
            node,
            'document-navigation-policy',
            'declare this exact authentication handoff in tools/navigation-policy.json; internal navigation uses Router',
          )
        else usedExits.add(exit.reason)
      }
      if (callee?.[0] === 'browser' && !adapter) {
        const navigation =
          callee.at(-1) === 'addEventListener' &&
          ['popstate', 'hashchange'].includes(literal(node.arguments[0]) ?? '')
        if (navigation)
          report(
            node,
            'router-no-native-navigation',
            'use Router navigation or an explicitly declared document handoff',
          )
      }
      if (name === 'vue#provide' && model.origin(node.arguments[1])?.[0] === 'reactive')
        report(node, 'pinia-shared-state', 'share reactive application state through a Pinia store')
      if (ref?.[0] === 'reactive' && !policy.setup && model.moduleScope(node))
        report(node, 'pinia-shared-state', 'module-level reactive state belongs in defineStore')
      if (
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        alternatives.some(
          (pkg) =>
            literal(node.arguments[0]) === pkg || literal(node.arguments[0])?.startsWith(pkg + '/'),
        )
      )
        report(node, 'router-pinia-only', 'use Vue Router and Pinia')
    }
    if (!adapter && ref?.[0] === 'browser') {
      if (
        (['history', 'open'].includes(ref[1]) ||
          (ref[1] === 'location' && ['assign', 'replace', 'reload', '*'].includes(ref[2]))) &&
        (!node.parent || model.origin(node.parent)?.[0] !== 'browser')
      )
        report(node, 'router-no-native-navigation', 'do not capture or call native navigation APIs')
      if (
        !themeStorage &&
        ['localStorage', 'sessionStorage'].includes(ref[1]) &&
        !model.insideStore(node) &&
        (!node.parent || model.origin(node.parent)?.[0] !== 'browser')
      )
        report(
          node,
          'pinia-no-storage-state',
          'manage persisted application state inside a Pinia store',
        )
      if (ref[1] === 'location' && ['pathname', 'search', 'hash'].includes(ref[2]))
        report(node, 'router-no-native-navigation', 'read route state through useRoute')
    }
    if (
      !adapter &&
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const target = model.origin(node.left)
      if (
        target?.[0] === 'browser' &&
        (['location', 'onpopstate', 'onhashchange'].includes(target[1]) || target[1] === '*')
      )
        report(
          node,
          'router-no-native-navigation',
          'do not assign browser navigation or history handlers',
        )
    }
    if (
      !policy.setup &&
      ts.isVariableStatement(node) &&
      model.moduleScope(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (
          model.origin(declaration.initializer)?.join('#') ===
          '@oxeu/center-common/ui/navigation.ts#navigateDocument'
        )
          report(
            declaration,
            'document-navigation-policy',
            'do not export a document handoff alias',
          )
        const initializer = declaration.initializer && unwrap(declaration.initializer)
        const mutable =
          initializer &&
          (ts.isObjectLiteralExpression(initializer) ||
            ts.isArrayLiteralExpression(initializer) ||
            ts.isNewExpression(initializer))
        const readonly =
          declaration.type?.getText().includes('readonly') ||
          declaration.type?.getText().includes('Readonly') ||
          (declaration.initializer &&
            ts.isAsExpression(declaration.initializer) &&
            declaration.initializer.type.getText() === 'const')
        if (!(node.declarationList.flags & ts.NodeFlags.Const) || (mutable && !readonly))
          report(
            declaration,
            'pinia-shared-state',
            'export Pinia stores or explicitly readonly configuration, not mutable module state',
          )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(model.source)
  if (policy.entry && ![...factories].some((id) => mounted.has(id) && ready.has(id)))
    errors.push(
      `${policy.filename}: require-router-pinia-bootstrap: create, await readiness and mount the same shared application`,
    )
  for (const exit of policy.exits ?? [])
    if (!usedExits.has(exit.reason))
      errors.push(`${policy.filename}: document-navigation-policy: unused handoff ${exit.reason}`)
  return [...new Set(errors)]
}
