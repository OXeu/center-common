import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function readmeFixture(chinese = false): string {
  return `<p align="center"><img src="docs/logo.svg" alt="Example logo" /></p>
<h3 align="center">Example</h3>
<p align="center">${chinese ? '用于测试的共享基础设施。' : 'Shared infrastructure for example applications.'}</p>
<p><a href="README.md">English</a> · <a href="README_zh.md">简体中文</a></p>
<p><a href="docs/guide.md">Documentation</a> · <a href="#quick-start">Deployment</a></p>
<p><a href="https://github.com/example/project/actions"><img src="https://img.shields.io/badge/build-passing-green" alt="Build status" /></a></p>

## Preview

![Product preview](docs/preview.svg)

## Features

- Shared controls and explicit configuration.

## Quick Start

Install dependencies and run the application.

\`\`\`sh
npm ci
npm start
\`\`\`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=example/project&type=Date)](https://star-history.com/#example/project&Date)

## LICENSE

Licensed under the [Apache License 2.0](LICENSE).
`
}

export function writeReadmeFixture(root: string): void {
  writeFileSync(join(root, 'LICENSE'), 'Apache License\nVersion 2.0, January 2004\n')
  mkdirSync(join(root, 'docs'), { recursive: true })
  for (const name of ['logo.svg', 'preview.svg']) {
    writeFileSync(join(root, 'docs', name), '<svg xmlns="http://www.w3.org/2000/svg" />')
  }
  writeFileSync(join(root, 'docs/guide.md'), '# Documentation\n')
  writeFileSync(join(root, 'README.md'), readmeFixture())
  writeFileSync(join(root, 'README_zh.md'), readmeFixture(true))
}
