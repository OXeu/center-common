import MarkdownIt from 'markdown-it'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
const markdown = new MarkdownIt({ html: true })
const filenames = ['README.md', 'README_zh.md'] as const
const sections = new Map([
  ['preview', 'preview'],
  ['gallery', 'preview'],
  ['预览', 'preview'],
  ['画廊', 'preview'],
  ['features', 'features'],
  ['why', 'features'],
  ['功能', 'features'],
  ['特性', 'features'],
  ['为什么', 'features'],
  ['install', 'install'],
  ['installation', 'install'],
  ['quick start', 'install'],
  ['安装', 'install'],
  ['快速开始', 'install'],
  ['star history', 'stars'],
  ['starhistory', 'stars'],
  ['星标历史', 'stars'],
  ['license', 'license'],
  ['许可证', 'license'],
])

function element(node: Node | null | undefined): node is Element {
  return Boolean(node && 'tagName' in node)
}

function attribute(node: Node | undefined, name: string): string {
  return element(node) ? (node.attrs.find((attr) => attr.name === name)?.value ?? '') : ''
}

function visible(node: Node): boolean {
  return (
    node.nodeName !== '#comment' &&
    (!element(node) ||
      (!['script', 'style', 'template'].includes(node.tagName) &&
        !node.attrs.some((attr) => attr.name === 'hidden') &&
        !/display\s*:\s*none|visibility\s*:\s*hidden/iu.test(attribute(node, 'style'))))
  )
}

function children(node: Node | undefined): Node[] {
  return node && 'childNodes' in node ? node.childNodes.filter(visible) : []
}

function text(node: Node | undefined): string {
  if (node?.nodeName === '#text' && 'value' in node) return node.value
  return children(node).map(text).join('')
}

function find(node: Node | undefined, tag: string): Element[] {
  if (element(node) && ['pre', 'code'].includes(node.tagName) && tag !== 'code') return []
  return [
    ...(element(node) && node.tagName === tag ? [node] : []),
    ...children(node).flatMap((child) => find(child, tag)),
  ]
}

function blocks(node: Node): Node[] {
  return children(node).flatMap((child) => {
    if (element(child) && child.tagName === 'div') return blocks(child)
    return element(child) || text(child).trim() ? [child] : []
  })
}

function centered(node: Node | undefined): boolean {
  if (!element(node)) return false
  if (attribute(node, 'align').toLowerCase() === 'center') return true
  return node.parentNode !== null && centered(node.parentNode)
}

function linkedImage(node: Element): boolean {
  let parent = node.parentNode
  while (element(parent)) {
    if (parent.tagName === 'a') return Boolean(attribute(parent, 'href'))
    parent = parent.parentNode
  }
  return false
}

function starChart(node: Element): boolean {
  try {
    const url = new URL(attribute(node, 'src'))
    return (
      url.protocol === 'https:' &&
      url.hostname === 'api.star-history.com' &&
      ['/svg', '/image'].includes(url.pathname) &&
      (url.searchParams.get('repos') ?? '')
        .split(',')
        .every((repo) => /^[\w.-]+\/[\w.-]+$/u.test(repo)) &&
      linkedImage(node)
    )
  } catch {
    return false
  }
}

function checkLinks(document: Node, root: string, filename: string): string[] {
  const errors: string[] = []
  const anchors = new Set<string>()
  const counts = new Map<string, number>()
  for (const heading of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].flatMap((tag) =>
    find(document, tag),
  )) {
    const slug = text(heading)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\s-]/gu, '')
      .replace(/\s/gu, '-')
    const count = counts.get(slug) ?? 0
    anchors.add(count ? `${slug}-${count}` : slug)
    counts.set(slug, count + 1)
    if (attribute(heading, 'id')) anchors.add(attribute(heading, 'id'))
  }
  for (const node of [...find(document, 'a'), ...find(document, 'img')]) {
    const target = attribute(node, node.tagName === 'a' ? 'href' : 'src')
    if (!target.trim()) {
      errors.push('links and images must have a nonempty destination')
      continue
    }
    if (/^https?:\/\//iu.test(target) || /^mailto:/iu.test(target)) continue
    try {
      const [path, fragment] = target.split('#')
      const file = path
        ? resolve(root, dirname(filename), decodeURIComponent(path))
        : resolve(root, filename)
      if (relative(root, file).startsWith('..') || !existsSync(file)) {
        errors.push(`local destination does not exist in the repository: ${target}`)
      } else if (
        file === resolve(root, filename) &&
        fragment &&
        !anchors.has(decodeURIComponent(fragment))
      ) {
        errors.push(`heading anchor does not exist: ${target}`)
      }
    } catch {
      errors.push(`invalid destination: ${target}`)
    }
  }
  return errors
}

export function checkReadme(source: string, filename: string, root: string): string[] {
  const document = parseFragment(markdown.render(source))
  const content = blocks(document)
  const errors: string[] = []
  const [logo, title, introduction, languages, navigation, badges] = content
  if (!centered(logo) || find(logo, 'img').length !== 1 || text(logo).trim()) {
    errors.push('start with one centered logo image')
  }
  if (!element(title) || title.tagName !== 'h3' || !centered(title) || !text(title).trim()) {
    errors.push('follow the logo with a centered h3 title')
  }
  const summary = text(introduction).trim()
  const sentences = summary.split(/[.!?]+(?:\s+|$)|[。！？]+/gu).filter((part) => part.trim())
  if (
    !element(introduction) ||
    introduction.tagName !== 'p' ||
    !centered(introduction) ||
    !summary ||
    sentences.length !== 1 ||
    find(introduction, 'br').length
  ) {
    errors.push('follow the title with one centered sentence in a paragraph')
  }
  if (filename === 'README_zh.md' && !/\p{Script=Han}/u.test(summary)) {
    errors.push('write the Chinese introduction in Chinese')
  }
  if (filename === 'README.md' && (!/[a-z]/iu.test(summary) || /\p{Script=Han}/u.test(summary))) {
    errors.push('write the default introduction in English')
  }
  const languageLinks = find(languages, 'a')
    .filter((link) => text(link).trim())
    .map((link) => attribute(link, 'href').replace(/^\.\//u, ''))
  if (!filenames.every((name) => languageLinks.includes(name)) || find(languages, 'img').length) {
    errors.push('place links to README.md and README_zh.md immediately after the introduction')
  }
  const navLinks = find(navigation, 'a').filter(
    (link) =>
      text(link).trim() &&
      !filenames.some((name) => attribute(link, 'href').replace(/^\.\//u, '') === name),
  )
  if (
    new Set(navLinks.map((link) => attribute(link, 'href'))).size < 2 ||
    find(navigation, 'img').length
  ) {
    errors.push(
      'place at least two documentation or deployment navigation links after the languages',
    )
  }
  const badgeImages = find(badges, 'img')
  const headerImages = new Set(
    [...find(logo, 'img'), ...badgeImages].map((img) => attribute(img, 'src')),
  )
  if (!badgeImages.length || !badgeImages.every(linkedImage) || text(badges).trim()) {
    errors.push('place a linked badge list after the documentation navigation')
  }
  for (const img of find(document, 'img')) {
    if (!attribute(img, 'alt').trim()) errors.push('give every image descriptive alt text')
  }
  const headings = content.flatMap((node, index) =>
    element(node) && node.tagName === 'h2'
      ? [{ node, index, kind: sections.get(text(node).trim().toLowerCase()) }]
      : [],
  )
  const order = headings.map((heading) => heading.kind).join(',')
  if (
    !['preview,install,stars,license', 'preview,features,install,stars,license'].includes(order) ||
    headings[0]?.index !== 6
  ) {
    errors.push(
      'use h2 sections in order: Preview/Gallery, optional Features/Why, Install/Quick Start, Star History, LICENSE',
    )
  }
  for (const [index, heading] of headings.entries()) {
    const body = content.slice(heading.index + 1, headings[index + 1]?.index ?? content.length)
    const images = body.flatMap((node) => find(node, 'img'))
    if (!body.some((node) => text(node).trim() || find(node, 'img').length)) {
      errors.push(`section must not be empty: ${text(heading.node)}`)
    }
    if (
      heading.kind === 'preview' &&
      !images.some((img) => !headerImages.has(attribute(img, 'src')) && !starChart(img))
    ) {
      errors.push('Preview/Gallery must contain a product screenshot or diagram')
    }
    if (
      heading.kind === 'install' &&
      !body
        .flatMap((node) => find(node, 'code'))
        .some(
          (node) =>
            /^language-(?:sh|bash|shell|console|powershell)$/u.test(attribute(node, 'class')) &&
            element(node.parentNode ?? undefined) &&
            node.parentNode?.nodeName === 'pre' &&
            text(node).trim(),
        )
    ) {
      errors.push('Install/Quick Start must include a nonempty fenced shell command block')
    }
    if (heading.kind === 'stars' && !images.some(starChart)) {
      errors.push(
        'Star History must embed a linked api.star-history.com graph with a repos parameter',
      )
    }
    if (
      heading.kind === 'license' &&
      !body
        .flatMap((node) => find(node, 'a'))
        .some(
          (link) =>
            attribute(link, 'href').replace(/^\.\//u, '') === 'LICENSE' && text(link).trim(),
        )
    ) {
      errors.push('LICENSE must link to the repository LICENSE file')
    }
  }
  errors.push(...checkLinks(document, root, filename))
  return [...new Set(errors)].map((error) => `${filename}: readme-layout: ${error}`)
}

export function checkReadmes(root: string): string[] {
  return filenames.flatMap((filename) => {
    const path = resolve(root, filename)
    if (!existsSync(path))
      return [`${filename}: readme-layout: both README.md and README_zh.md are required`]
    return checkReadme(readFileSync(path, 'utf8'), filename, root)
  })
}
