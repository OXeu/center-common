import { describe, expect, it } from 'vite-plus/test'
import { paragraphRules } from '../../../config/markdown.ts'
import { checkParagraphs } from '../../../tools/oxlint/paragraphs.ts'
import { splitSentences } from '../../../tools/oxlint/sentences.ts'

const check = (source: string, overrides = {}) =>
  checkParagraphs(source, 'docs/guide.md', { ...paragraphRules, ...overrides })
const narrative =
  'Dogs bark. Cats meow. Birds sing. Fish swim. Frogs croak. Snakes hiss. Bees buzz. Ants march.'
const steps =
  'In that project, set the key and configure GitHub. Register the callback. Replace the URL.'
const longSentence = `${Array.from({ length: 41 }, () => 'word').join(' ')}.`

describe('Punkt sentence boundaries', () => {
  it.each([
    ['Dr. Smith met Mr. Jones at 3.14 p.m. on Jan. 5.', 1],
    ['Dr. Smith uses version 3.14. Then restart the service.', 2],
    ['Configure OAuth 2.0 with Node.js. Run v1.26.10. Read example.com.', 3],
    ['Mr. Smith arrived in the U.S. yesterday. He left.', 2],
    ['设置密钥。然后启动服务！最后检查状态？', 3],
    ['Dr. Smith 配置服务。Use version 3.14. 接着重启！', 3],
  ])('splits %s into %i sentences', (source, count) => {
    expect(splitSentences(source)).toHaveLength(count)
  })
})

describe('paragraph-structure', () => {
  it('reports exact sentence counts with the source line', () => {
    expect(check(`# Guide\n\n${narrative}`)).toEqual([
      'docs/guide.md:3: paragraph-structure: paragraph has too many sentences (8 > 6)',
    ])
  })

  it('checks words in each sentence instead of the paragraph total', () => {
    expect(check(longSentence)).toContainEqual(expect.stringContaining('(41 > 40 words)'))
    const short = `${Array.from({ length: 40 }, () => 'word').join(' ')}.`
    expect(check(`${short} ${short}`)).toEqual([])
  })

  it('supports explicit stricter thresholds', () => {
    expect(check('Birds sing. Fish swim. Cats meow.', { maxSentences: 2 })).toContainEqual(
      expect.stringContaining('(3 > 2)'),
    )
  })

  it('treats soft wraps and hard line breaks as the same paragraph', () => {
    expect(check(narrative.replaceAll('. ', '.\n'))).toContainEqual(
      expect.stringContaining('(8 > 6)'),
    )
    expect(check(narrative.replaceAll('. ', '.  \n'))).toContainEqual(
      expect.stringContaining('(8 > 6)'),
    )
  })

  it('allows separate paragraphs and does not count inline code, URLs or image metadata as prose sentences', () => {
    expect(check(narrative.replaceAll('. ', '.\n\n'))).toEqual([])
    expect(
      check(
        `Use \`${narrative}\` and [the guide](https://example.com/a.b).\n\n<https://example.com/v1.26.10>\n\n![${narrative}](preview.png)`,
      ),
    ).toEqual([])
  })

  it('skips headings, code, tables, blockquotes and comments', () => {
    for (const source of [
      `# ${narrative}`,
      `\`\`\`md\n${narrative}\n\`\`\``,
      `    ${narrative}`,
      `| Notes |\n| --- |\n| ${narrative} |`,
      `> ${narrative}`,
      `<!-- ${narrative} -->`,
      `<pre><code>${narrative}</code></pre>`,
      `<blockquote><p>${narrative}</p></blockquote>`,
      `<table><tr><td><p>${narrative}</p></td></tr></table>`,
    ])
      expect(check(source)).toEqual([])
  })

  it('checks HTML paragraphs and containers with original line numbers', () => {
    expect(check(`# Guide\n\n<div>\n<p>${narrative}</p>\n</div>`)).toContainEqual(
      expect.stringContaining('docs/guide.md:4: paragraph-structure'),
    )
    expect(check(`<div>${narrative}</div>`)).toContainEqual(expect.stringContaining('(8 > 6)'))
  })

  it('still limits the length of list items', () => {
    expect(check(`- ${longSentence}`)).toContainEqual(expect.stringContaining('(41 > 40 words)'))
  })

  it('rejects invalid rule settings', () => {
    expect(() => check('A sentence.', { maxSentences: 0 })).toThrow('positive integer')
  })
})

describe('paragraph-steps-list', () => {
  it.each([
    steps,
    'First, prepare the settings. Next, connect the client. Finally, inspect the result.',
    '在该项目中设置密钥，并配置服务。登记回调。将地址替换为本机地址。',
    '首先准备数据。然后检查配置。最后确认结果。',
    `<p>${steps}</p>`,
  ])('requires a list for independent operations: %s', (source) => {
    expect(check(source)).toContainEqual(expect.stringContaining('paragraph-steps-list'))
  })

  it.each([
    'The first request initializes the cache. The service then handles traffic. Finally available metrics describe the cache.',
    'The service stores configuration. It registers clients. It replaces expired credentials.',
    'Set the key. Restart the service.',
    'Set the key and configure the client, register its callback and replace the URL. The server uses SQLite. The settings are persistent.',
    '- Set the key. Register the callback. Replace the URL.',
    '1. Set the key.\n2. Register the callback.\n3. Replace the URL.',
    `<ol><li><p>${steps}</p></li></ol>`,
    `Use \`Set the key. Register the callback. Replace the URL.\` for this example. The code is illustrative. The server is unchanged.`,
  ])('does not flag narrative prose, short paragraphs or existing lists: %s', (source) => {
    expect(check(source).filter((error) => error.includes('paragraph-steps-list'))).toEqual([])
  })
})
