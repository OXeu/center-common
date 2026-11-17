import { parse } from '@vue/compiler-dom'

export function checkArchitectureTemplate(source: string, filename: string, shared = false) {
  const errors: string[] = []
  const expressions: string[] = []
  function walk(node: any) {
    if (node.type === 1) {
      const tag = node.tag.toLowerCase()
      const adapter = shared && filename === 'ui/NavigationLink.vue'
      const is = node.props.find((prop: any) => prop.name === 'is' || prop.arg?.content === 'is')
      const anchor =
        tag === 'a' || is?.value?.content === 'a' || /^['"]a['"]$/u.test(is?.exp?.content ?? '')
      const spread = node.props.some(
        (prop: any) => prop.type === 7 && prop.name === 'bind' && !prop.arg,
      )
      const boundHref = node.props.some(
        (prop: any) => prop.name === 'href' || prop.arg?.content === 'href',
      )
      if ((anchor || (tag === 'component' && boundHref)) && !adapter)
        errors.push(
          `${filename}: router-links-only: use NavigationLink or RouterLink instead of an anchor`,
        )
      if (
        node.props.some(
          (prop: any) =>
            (tag === 'form' && (prop.name === 'action' || prop.arg?.content === 'action')) ||
            (['button', 'input'].includes(tag) &&
              (prop.name === 'formaction' || prop.arg?.content === 'formaction')),
        )
      )
        errors.push(
          `${filename}: router-no-native-navigation: submit forms through application actions instead of document navigation`,
        )
      if (
        tag === 'meta' &&
        node.props.some(
          (prop: any) =>
            prop.name === 'http-equiv' && prop.value?.content.toLowerCase() === 'refresh',
        )
      )
        errors.push(`${filename}: router-no-native-navigation: meta refresh bypasses Router`)
      if (tag === 'form') {
        const dialog = node.props.some(
          (prop: any) => prop.name === 'method' && prop.value?.content === 'dialog',
        )
        const prevented = node.props.some(
          (prop: any) =>
            prop.name === 'on' &&
            prop.arg?.content === 'submit' &&
            prop.modifiers?.some((modifier: any) => (modifier.content ?? modifier) === 'prevent'),
        )
        if (spread || (!dialog && !prevented))
          errors.push(
            `${filename}: router-no-native-navigation: forms must use @submit.prevent or method="dialog"`,
          )
      }
      for (const prop of node.props) {
        if (prop.type === 7 && prop.exp?.content && !['for', 'slot'].includes(prop.name))
          expressions.push(
            `function __template${expressions.length}(){ ${prop.name === 'on' ? prop.exp.content : 'void (' + prop.exp.content + ')'} }`,
          )
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(
    parse(source, {
      onError: (error) =>
        errors.push(`${filename}: architecture-template-syntax: ${error.message}`),
    }),
  )
  return { errors, expressions }
}
