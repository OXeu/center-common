import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

const RAW_DOM = 'Vue owns the DOM; read page data from the mounts, not from document or DOM sinks.'
const INLINE_ICON =
  'Icons come from Remix Icon classes (ri-*); <svg> markup and emoji are not templates.'
const NON_TOAST_MESSAGE =
  'Messages are toasts: call notify() from the script, never a resolve helper in a template.'
const EMOJI = /\p{Extended_Pictographic}|[\u{FE0F}\u{20E3}]|[\u{2600}-\u{27BF}]/u

/** @param {any} node @returns {string} */
function literalTitle(node: any): string {
  const title = node.property ?? node.key
  if (title?.type === 'Identifier') return title.name
  if (title?.type === 'Literal' || title?.type === 'StringLiteral') return String(title.value)
  return ''
}

const noPageDomAccess = defineRule({
  meta: {
    messages: { rawDom: RAW_DOM, nonToast: NON_TOAST_MESSAGE },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const names = ['innerHTML', 'outerHTML', 'insertAdjacentHTML']
        if (names.includes(literalTitle(node))) {
          context.report({ node, messageId: 'rawDom' })
          return
        }
        const object = node.object
        if (node.computed && object?.type === 'Identifier' && object.name === 'document') {
          context.report({ node, messageId: 'rawDom' })
        }
      },
      CallExpression(node) {
        const callee = node.callee
        if (callee?.type !== 'MemberExpression') return
        if (
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'document' &&
          !(
            context.filename.endsWith('/web/ui/src/main.ts') &&
            literalTitle(callee) === 'querySelector'
          )
        ) {
          context.report({ node, messageId: 'rawDom' })
          return
        }
        const arg = node.arguments?.[0]
        const source = arg?.type === 'Literal' ? String(arg.value) : ''
        if (literalTitle(callee) === 'resolve' && /^\s*notify\(/u.test(source)) {
          context.report({ node, messageId: 'nonToast' })
        }
      },
    }
  },
})

/**
 * @param {any} node
 * @returns {string}
 */
function textOf(node: any): string {
  if (node.type === 'TemplateElement') return node.value?.cooked ?? node.value?.raw ?? ''
  return typeof node.value === 'string' ? node.value : ''
}

const noInlineIcons = defineRule({
  meta: {
    messages: { svg: INLINE_ICON, emoji: INLINE_ICON },
  },
  create(context) {
    return {
      JSXElement(node) {
        if (
          node.openingElement.name.type === 'JSXIdentifier' &&
          node.openingElement.name.name.toLowerCase() === 'svg'
        ) {
          context.report({ node, messageId: 'svg' })
        }
      },
      JSXText(node) {
        if (EMOJI.test(node.value ?? '')) context.report({ node, messageId: 'emoji' })
      },
      Literal(node) {
        if (typeof node.value === 'string' && EMOJI.test(node.value))
          context.report({ node, messageId: 'emoji' })
      },
      TemplateElement(node) {
        if (EMOJI.test(textOf(node))) context.report({ node, messageId: 'emoji' })
      },
    }
  },
})

export default definePlugin({
  meta: { name: 'center' },
  rules: {
    'no-page-dom-access': noPageDomAccess,
    'no-inline-icons': noInlineIcons,
  },
})
