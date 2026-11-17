import { parse } from 'postcss'

export function checkButtonStyles(source: string, filename: string, shared: boolean): string[] {
  if (shared && filename === 'ui/theme.css') return []
  const errors: string[] = []
  const report = (line?: number) =>
    errors.push(
      `${filename}:${line ?? 1}: button-no-custom-style: button styles and tokens belong to center-common/ui/theme.css`,
    )
  const root = parse(source)
  root.walkRules((rule) => {
    if (
      /(?:^|[^\w-])button(?:$|[^\w-])|\.btn(?:[-\w]*)|\.tabs-trigger|\[role\s*[~|^$*]?=\s*['"]?button|\[class[^\]]*btn/iu.test(
        rule.selector,
      )
    )
      report(rule.source?.start?.line)
  })
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--button-')) report(declaration.source?.start?.line)
  })
  root.walkAtRules('apply', (rule) => {
    if (/\b(?:btn(?:-[\w-]+)?|tabs-trigger)\b/u.test(rule.params)) report(rule.source?.start?.line)
  })
  return [...new Set(errors)]
}
