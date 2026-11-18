import { parse, type ElementNode, type RootNode, type TemplateChildNode } from '@vue/compiler-dom'

export const singleDropdownDialog = 'no-single-dropdown-dialog'

function isDialog(node: ElementNode): boolean {
  return (
    ['dialog', 'DialogPanel', 'dialog-panel'].includes(node.tag) ||
    node.props.some(
      (prop) =>
        prop.type === 6 &&
        ((prop.name === 'role' && ['dialog', 'alertdialog'].includes(prop.value?.content ?? '')) ||
          (prop.name === 'aria-modal' && prop.value?.content === 'true')),
    )
  )
}

function controls(node: TemplateChildNode): string[] {
  if (node.type !== 1) return []
  const tag = node.tag.replaceAll('-', '').toLowerCase()
  if (isDialog(node) || node.props.some((prop) => prop.type === 7 && prop.name === 'for'))
    return ['unknown']
  if (['dropdownselect', 'dropdownmenu', 'select'].includes(tag)) return ['dropdown']
  if (
    tag === 'input' &&
    node.props.some(
      (prop) => prop.type === 6 && prop.name === 'type' && prop.value?.content === 'hidden',
    )
  )
    return []
  if (['input', 'textarea', 'checkboxfield'].includes(tag)) return ['field']
  if (['button', 'Button', 'a'].includes(node.tag)) return []
  if (node.tagType === 1) return ['unknown']
  return node.children.flatMap(controls)
}

export function checkDialogTemplate(source: string): string[] {
  const errors: string[] = []
  function walk(node: RootNode | TemplateChildNode) {
    if (node.type === 1 && isDialog(node)) {
      const fields = node.children.flatMap(controls)
      if (fields.length === 1 && fields[0] === 'dropdown') errors.push(singleDropdownDialog)
    }
    if (node.type === 0 || node.type === 1) node.children.forEach(walk)
  }
  walk(parse(source))
  return errors
}
