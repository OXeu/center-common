# Markdown paragraphs / Markdown 段落

`npm run lint` checks tracked and new, unignored Markdown files through the shared `tools/lint-files.ts` command. This includes both READMEs, `AGENTS.md`, `docs/` and `.github/`. Errors include the filename, paragraph's starting line and rule name.

`npm run lint` 检查 Git 已跟踪及未被忽略的新增 Markdown 文件，覆盖中英文 README、`AGENTS.md`、`docs/` 和 `.github/`。报错包含文件名、段落起始行和规则名称。

## Paragraph limits / 段落长度

`paragraph-structure` follows the limits in [mdsmith MDS024](https://github.com/jeduden/mdsmith/blob/main/internal/rules/MDS024-paragraph-structure/README.md):

- At most **6 sentences per paragraph**.
- At most **40 whitespace-separated words per sentence**.
- Physical line wrapping does not start a new paragraph.
- List items retain these limits.

`paragraph-structure` 限制每段最多 **6 句**、每句最多 **40 个以空白分隔的词**。仅换行不会产生新段落，列表项仍受长度限制。中文也检查句数，但不进行中文词汇分词。

Sentence boundaries use [Punkt](https://github.com/noahcoolboy/punkt) with its bundled, pretrained English model. Abbreviations such as `Dr. Smith`, decimals such as `3.14`, and version numbers stay intact. Chinese `。！？` also end sentences. Lint runs offline after dependencies are installed.

分句使用带预训练英语模型的 Punkt，避免把 `Dr. Smith`、`3.14` 和版本号中的点误判为句末，并补充中文 `。！？` 边界。依赖安装完成后，lint 无需联网。

## Independent steps / 独立步骤

`paragraph-steps-list` requires a list when a paragraph has **at least 3 sentences** and either signal matches:

- At least two sentences begin with sequence markers, such as `first`, `next`, `then`, `finally`, `首先` or `然后`.
- At least two sentences contain imperative actions, with either one sequence marker or three action clauses overall.

Actions include `set`, `configure`, `register`, `replace`, `设置`, `配置`, `注册` and `替换`. The checker looks at clause boundaries to reduce matches against narrative subjects. This is a heuristic; it cannot identify every semantic sequence.

`paragraph-steps-list` 在段落达到 **3 句**时检查顺序词和并列操作。满足上述任一信号时，必须改成列表。动词按分句边界匹配，以减少对叙述句的误报；该启发式规则不能识别所有语义上的步骤。

For example, this paragraph fails:

```markdown
In that project, set the key and configure GitHub. Register the callback. Replace the URL.
```

Write the operations as a list:

```markdown
1. Set the key and configure GitHub.
2. Register the callback.
3. Replace the URL.
```

## Parsing and configuration / 解析与配置

- Markdown and HTML paragraphs are checked, including text inside `<p>` and `<div>`.
- Headings, code blocks, tables, blockquotes, comments and image metadata are excluded.
- Inline code and bare URL links count as one opaque word each; their punctuation does not create sentences.
- Ordinary link labels count as prose; link destinations do not.
- Existing Markdown and HTML lists skip the step heuristic, while retaining paragraph limits.
- Shared thresholds live in [`config/markdown.ts`](../config/markdown.ts); lower them there when stricter limits are needed.

标题、代码块、表格、引用、注释及图片元数据不参与检查。行内代码和纯 URL 链接各视为一个词，不按其中标点分句；普通链接只检查显示文字。已有列表跳过步骤检测，仍检查长度，阈值由公共配置统一维护。
