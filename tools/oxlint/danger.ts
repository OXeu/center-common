import { parse } from '@vue/compiler-dom'

export function checkDangerTemplate(
  source: string,
  filename: string,
  dangerOperations: Record<string, string>,
  options: { button?: boolean; accountSignOut?: boolean } = {},
): string[] {
  const errors: string[] = []
  const trusted =
    filename ===
    (options.button ? 'web/ui/src/DangerActionButton.vue' : 'web/ui/src/DangerActions.vue')
  const dropdown = filename === 'web/ui/src/DropdownMenu.vue'
  const words =
    /删除|撤销|吊销|拒绝|批准|清空|销毁|退出登录|登出|注销|封禁|解封|\b(delete|remove|revoke|reject|approve|review|destroy|purge|ban|unban|(?:log|sign)[\s_-]*(?:out|off))\b|common\.delete|nav\.signOut|users\.(ban|unban|delete)|projects\.(revoke|approve|reject)/iu
  function walk(node: any, inDropdown = false) {
    if (node.type === 1) {
      const attrs = Object.fromEntries(
        node.props
          .filter((p: any) => p.type === 6)
          .map((p: any) => [p.name, p.value?.content ?? '']),
      )
      const bindings = node.props.filter((p: any) => p.type === 7)
      const marked =
        'data-danger-action' in attrs ||
        bindings.some((p: any) => p.arg?.content === 'data-danger-action')
      if (
        node.tag === 'DangerActions' &&
        !bindings.some(
          (p: any) => p.arg?.content === 'label' && p.exp?.content === "msg('common.more')",
        )
      )
        errors.push('danger-requires-more-trigger')
      const sharedButton = ['DangerActionButton', 'danger-action-button'].includes(node.tag)
      if (sharedButton && !inDropdown) errors.push('danger-requires-dropdown')
      const control =
        !sharedButton && (['button', 'a', 'input'].includes(node.tag) || /button$/iu.test(node.tag))
      const registered = Object.entries(dangerOperations).flat()
      const dangerous =
        marked ||
        (control &&
          (words.test(node.loc.source) ||
            registered.some((name) => node.loc.source.includes(name))))
      const accountSignOut =
        options.accountSignOut &&
        filename === 'web/ui/src/PageHeader.vue' &&
        ['button', 'Button'].includes(node.tag) &&
        attrs['data-danger-action'] === 'signOut'
      if (dangerous && !trusted && !accountSignOut) errors.push('danger-use-shared-actions')
      if (dangerous && (trusted || accountSignOut)) {
        if (!options.button && !inDropdown) errors.push('danger-requires-dropdown')
        if (attrs.variant !== 'danger' && !attrs.class?.split(/\s/u).includes('btn-danger'))
          errors.push('danger-requires-style')
        if (
          !bindings.some(
            (p: any) =>
              p.name === 'on' &&
              p.arg?.content === 'click' &&
              p.exp?.content === (accountSignOut ? 'accountAction.request()' : 'action.request()'),
          )
        )
          errors.push('danger-requires-confirmation')
      }
      if ('data-danger-action' in attrs && !(attrs['data-danger-action'] in dangerOperations))
        errors.push('unknown-danger-operation')
      if (
        !dropdown &&
        (['menu', 'details'].includes(node.tag) ||
          (/menu$/iu.test(node.tag) && node.tag !== 'DropdownMenu') ||
          ['menu', 'menubar'].includes(attrs.role) ||
          /\b(dropdown-content|submenu)\b/u.test(attrs.class ?? '') ||
          ('aria-haspopup' in attrs &&
            !(attrs.role === 'combobox' && attrs['aria-haspopup'] === 'listbox')))
      )
        errors.push('secondary-menu-requires-dropdown')
      inDropdown ||= node.tag === 'DropdownMenu'
    }
    for (const child of node.children ?? []) walk(child, inDropdown)
  }
  walk(parse(source))
  return errors
}
