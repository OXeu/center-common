import { parse } from 'postcss'

export function overridesDropdownPosition(classes: string): boolean {
  return classes
    .split(/\s+/u)
    .some((name) =>
      /(?:^|[:!])(?:static|relative|absolute|sticky|contents)(?:[!\]]|$)|\[(?:position|all):/u.test(
        name,
      ),
    )
}

export function checkDropdownStyles(source: string, requireBase = false): string[] {
  const errors: string[] = []
  let fixed = false
  parse(source).walkRules((rule) => {
    if (!/\.dropdown-(?:panel|content|options)(?![\w-])/u.test(rule.selector)) return
    if (rule.selector.includes(':has(')) errors.push('dropdown-no-layout-toggle')
    let unconditional = true
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name !== 'layer') unconditional = false
    }
    rule.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase()
      const value = declaration.value.toLowerCase()
      if (property === 'position') {
        if (value !== 'fixed') errors.push('dropdown-no-position-override')
        if (
          rule.selector === '.dropdown-panel' &&
          value === 'fixed' &&
          declaration.parent === rule &&
          unconditional
        )
          fixed = true
      }
      if (property === 'all' || (property === 'display' && value === 'contents'))
        errors.push('dropdown-no-position-override')
    })
    rule.walkAtRules('apply', (apply) => {
      if (overridesDropdownPosition(apply.params)) errors.push('dropdown-no-position-override')
    })
  })
  if (requireBase && !fixed) errors.push('dropdown-requires-fixed-style')
  return [...new Set(errors)]
}
