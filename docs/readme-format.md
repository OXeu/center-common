# README format / README 格式

Every repository must contain English `README.md` and Simplified Chinese `README_zh.md`. `npm run lint` runs the shared `readme-layout` check through `tools/lint-files.ts`. The checker parses Markdown and HTML; headings or examples inside comments, hidden containers and code fences do not satisfy the layout.

每个仓库必须同时提供英文 `README.md` 和简体中文 `README_zh.md`。两份文档均遵循下列顺序，源码或注释中的格式示例不算实际内容。

The [Markdown paragraph rules](markdown-style.md) also apply to both READMEs. 中英文 README 同时遵循[段落长度与步骤列表规则](markdown-style.md)。

1. A centered logo, a centered **h3** project title, then one centered introductory sentence. Use `align="center"` on the individual blocks or a surrounding `div`; use descriptive image alt text. 标题必须为三级标题，介绍为一个段落中的一句话。
2. Language links to **both** `README.md` and `README_zh.md`. 两份文档都必须包含两个语言链接。
3. At least two main navigation links, such as documentation, deployment and configuration. 至少两个主要文档或部署导航链接。
4. A list of linked badge images with alt text. 带链接及替代文本的徽章列表。
5. `## Preview` / `## Gallery` / `## 预览` / `## 画廊`, containing a real product screenshot or architecture diagram. 预览不能只有占位文字，也不能重复使用顶部 logo。
6. Optional `## Features` / `## Why` / `## 功能` / `## 特性` / `## 为什么`. 可省略此栏目；保留时必须有内容。
7. `## Install` / `## Installation` / `## Quick Start` / `## 安装` / `## 快速开始`, with a nonempty fenced shell command block and the prerequisites needed to run it. 必须给出最小运行命令，依赖和凭据准备应明确说明。
8. `## Star History` / `## StarHistory` / `## 星标历史`, with a linked graph from `https://api.star-history.com/svg` or `/image`, including a valid `repos=owner/repository` parameter. Use the repository's actual owner and name; external availability is not checked during lint. See the [official embedding guide](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme).
9. Final `## LICENSE` / `## 许可证`, linking to the repository's `LICENSE` file. All four Center repositories use Apache License 2.0. 四个仓库统一采用 Apache 2.0，两份 README 均须链接仓库内的 `LICENSE` 正文。

Section names are case-insensitive. Only the optional features section may be omitted. Keep additional topics under third-level headings in Quick Start or in linked `docs/` pages. Local file and image destinations must exist; links to headings in the same README must resolve. The rule checks structure and destinations, not translation quality or the correctness of deployment credentials.

栏目名称不区分大小写。其他细节放在快速开始的三级标题下，或通过导航链接进入 `docs/`。本地图片和文件链接必须存在；当前 README 内的锚点必须对应实际标题。临时总结、实施计划和排查报告仍应放入 `.tmp/`。
