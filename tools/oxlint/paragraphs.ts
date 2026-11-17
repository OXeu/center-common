import MarkdownIt from 'markdown-it'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { splitSentences } from './sentences.ts'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
type Paragraph = { text: string; line: number; inList: boolean }

export type ParagraphRules = {
  maxSentences: number
  maxWordsPerSentence: number
  minStepSentences: number
}

const markdown = new MarkdownIt({ html: true })
const excluded = new Set([
  'pre',
  'script',
  'style',
  'template',
  'table',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
])
const containers = new Set(['p', 'div', 'section', 'article', 'li', 'ol', 'ul'])
const englishActions =
  'add|build|clone|configure|copy|create|delete|deploy|enable|ensure|export|fetch|fill|generate|initialize|install|open|register|remove|replace|restart|run|select|set|start|stop|store|update|use|verify|write'
const chineseActions =
  '安装|配置|创建|设置|填写|登记|注册|替换|运行|启动|重启|打开|选择|添加|保存|部署|更新|检查|复制|下载|导出|启用|停止|写入'
const action = new RegExp(
  `(?:^|[,;:]\\s*|\\b(?:and|then)\\s+)(?:(?:please|first|next|then|finally)[,\\s]+)*(?:${englishActions})\\b`,
  'giu',
)
const chineseAction = new RegExp(
  `(?:^|[，；：]\\s*|(?:首先|然后|接着|最后|同时|并且|并|再))\\s*(?:请|先)?(?:在[^，。！？]{1,30}?(?:中|内|后)[，、]?)?(?:将[^，。！？]{1,30}?)?(?:${chineseActions})`,
  'gu',
)
const sequence =
  /^(?:first|next|then|finally|after that|subsequently)(?:\s|,|:)|^(?:首先|然后|接着|最后|第一步|第二步|第三步)/iu

function isElement(node: Node): node is Element {
  return 'tagName' in node
}

function children(node: Node): Node[] {
  return 'childNodes' in node ? node.childNodes : []
}

function prose(node: Node): string {
  if ('value' in node && node.nodeName === '#text') return node.value
  if (isElement(node)) {
    if (excluded.has(node.tagName) || node.tagName === 'img') return ''
    if (node.tagName === 'code') return ' code '
    if (node.tagName === 'br') return ' '
    if (node.tagName === 'a') {
      const label = children(node).map(prose).join('')
      return /^(?:https?:\/\/|mailto:)\S+$/u.test(label.trim()) ? ' link ' : label
    }
  }
  return children(node).map(prose).join('')
}

function htmlParagraphs(source: string, firstLine: number, inList: boolean): Paragraph[] {
  const result: Paragraph[] = []
  function walk(node: Node, list: boolean): void {
    if (isElement(node)) {
      if (excluded.has(node.tagName)) return
      list ||= node.tagName === 'li'
      if (
        containers.has(node.tagName) &&
        !children(node).some((child) => isElement(child) && containers.has(child.tagName))
      ) {
        result.push({
          text: prose(node),
          line: firstLine + (node.sourceCodeLocation?.startLine ?? 1),
          inList: list,
        })
        return
      }
    }
    for (const child of children(node)) walk(child, list)
  }
  walk(parseFragment(source, { sourceCodeLocationInfo: true }), inList)
  return result
}

function paragraphs(source: string): Paragraph[] {
  const result: Paragraph[] = []
  const tokens = markdown.parse(source, {})
  let lists = 0
  let quotes = 0
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'list_item_open') lists++
    if (token.type === 'list_item_close') lists--
    if (token.type === 'blockquote_open') quotes++
    if (token.type === 'blockquote_close') quotes--
    if (quotes) continue
    if (token.type === 'paragraph_open') {
      const inline = tokens[index + 1]
      if (inline?.type === 'inline') {
        const rendered = markdown.renderer.renderInline(inline.children ?? [], markdown.options, {})
        result.push({
          text: prose(parseFragment(rendered)),
          line: (token.map?.[0] ?? 0) + 1,
          inList: lists > 0,
        })
      }
    } else if (token.type === 'html_block') {
      result.push(...htmlParagraphs(token.content, token.map?.[0] ?? 0, lists > 0))
    }
  }
  return result.map((paragraph) => ({
    ...paragraph,
    text: paragraph.text.replace(/\s+/gu, ' ').trim(),
  }))
}

function independentSteps(sentences: string[]): boolean {
  const actions = sentences.map(
    (sentence) => [...sentence.matchAll(action), ...sentence.matchAll(chineseAction)].length,
  )
  const ordered = sentences.filter((sentence) => sequence.test(sentence)).length
  const activeSentences = actions.filter((count) => count > 0).length
  return (
    ordered >= 2 ||
    (activeSentences >= 2 && (ordered > 0 || actions.reduce((sum, count) => sum + count, 0) >= 3))
  )
}

export function checkParagraphs(source: string, filename: string, rules: ParagraphRules): string[] {
  for (const [name, value] of Object.entries(rules)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`)
  }
  const errors: string[] = []
  for (const paragraph of paragraphs(source)) {
    const sentences = splitSentences(paragraph.text)
    const location = `${filename}:${paragraph.line}`
    if (sentences.length > rules.maxSentences) {
      errors.push(
        `${location}: paragraph-structure: paragraph has too many sentences (${sentences.length} > ${rules.maxSentences})`,
      )
    }
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/u).length
      if (words > rules.maxWordsPerSentence) {
        errors.push(
          `${location}: paragraph-structure: sentence too long (${words} > ${rules.maxWordsPerSentence} words): ${sentence.slice(0, 100)}`,
        )
      }
    }
    if (
      !paragraph.inList &&
      sentences.length >= rules.minStepSentences &&
      independentSteps(sentences)
    ) {
      errors.push(
        `${location}: paragraph-steps-list: paragraph contains multiple independent steps; rewrite it as a list`,
      )
    }
  }
  return errors
}
