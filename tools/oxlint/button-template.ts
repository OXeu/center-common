import { parse } from '@vue/compiler-dom'
import { buttonContents, buttonSizes, buttonVariants } from '../../ui/button.ts'

export function buttonLayoutClasses(source: string): boolean {
  return source
    .split(/\s+/u)
    .filter(Boolean)
    .every((name) =>
      /^(?:(?:sm|md|lg|xl|2xl):)*(?:-?m[trblxyse]?-(?:auto|\d+(?:\.\d+)?)|(?:col|row)-(?:span|start|end)-\d+|(?:self|justify-self)-(?:start|end|center)|flex-1|grow|shrink-0|min-w-0|hidden|sr-only)$/u.test(
        name,
      ),
    )
}

export function checkButtonTemplate(
  source: string,
  filename: string,
  shared: boolean,
  buttons: Set<string>,
): string[] {
  const errors: string[] = []
  const implementation = shared && filename === 'ui/Button.vue'
  const native =
    shared && ['ui/Button.vue', 'ui/CheckboxField.vue', 'ui/DropdownSelect.vue'].includes(filename)
  const dropdown = shared && ['ui/DropdownMenu.vue', 'ui/DropdownSelect.vue'].includes(filename)
  const names = new Set(
    [...buttons].flatMap((name) => [
      name,
      name.replace(/[A-Z]/gu, (letter) => '-' + letter.toLowerCase()).replace(/^-/, ''),
    ]),
  )
  function report(node: any, rule: string, detail: string) {
    errors.push(`${filename}:${node.loc.start.line}: ${rule}: ${detail}`)
  }
  function walk(node: any) {
    if (node.type === 1) {
      const attrs = Object.fromEntries(
        node.props
          .filter((p: any) => p.type === 6)
          .map((p: any) => [p.name, p.value?.content ?? '']),
      )
      const binds = node.props.filter((p: any) => p.type === 7 && p.name === 'bind')
      const bound = (key: string) => binds.find((p: any) => p.arg?.content === key)
      const literal = (key: string) =>
        attrs[key] ?? bound(key)?.exp?.content.match(/^(['"])(.*?)\1$/u)?.[2]
      const has = (key: string) => key in attrs || Boolean(bound(key))
      const tag = node.tag.toLowerCase()
      const is = literal('is')
      const click = node.props.some(
        (p: any) =>
          p.type === 7 &&
          p.name === 'on' &&
          (p.arg?.content === 'click' ||
            (['keydown', 'keyup'].includes(p.arg?.content) &&
              p.modifiers?.some((modifier: any) =>
                ['enter', 'space'].includes(modifier.content),
              ))) &&
          p.exp,
      )
      const fake =
        ['div', 'span', 'p', 'li', 'label', 'a'].includes(tag) &&
        click &&
        !(tag === 'a' && has('href'))
      const input =
        tag === 'input' &&
        ['button', 'submit', 'reset', 'image'].includes(literal('type')?.toLowerCase())
      const dynamic =
        tag === 'component' &&
        !(shared && filename === 'ui/ApplicationRoot.vue') &&
        !names.has(bound('is')?.exp?.content)
      const button =
        node.tag !== 'button' && (names.has(node.tag) || names.has(bound('is')?.exp?.content))
      if (
        (!native &&
          ((tag === 'button' && !button) ||
            is === 'button' ||
            literal('role') === 'button' ||
            input ||
            dynamic)) ||
        (!dropdown && !implementation && fake)
      )
        report(node, 'button-use-shared', 'use the shared Button component for actions')
      if (['Button', 'button-component'].includes(node.tag) && !button)
        report(
          node,
          'button-use-shared',
          'Button must be imported from @oxeu/center-common/ui/Button.vue',
        )
      if (
        !implementation &&
        /(?:^|\s)(?:btn(?:-[\w-]+)?|tabs-trigger)(?=\s|$)/u.test(attrs.class ?? '')
      )
        report(node, 'button-no-custom-style', 'button classes belong to the shared implementation')
      if (
        !implementation &&
        bound('class')?.exp?.content.match(/\b(?:btn(?:-[\w-]+)?|tabs-trigger)\b/u)
      )
        report(
          node,
          'button-no-custom-style',
          'select size, variant and content with component props',
        )
      const styledLink =
        ['a', 'navigationlink', 'navigation-link', 'routerlink', 'router-link'].includes(tag) &&
        /(?:rounded|bg-|border|shadow|px-|py-)/u.test(attrs.class ?? '')
      if (!implementation && styledLink)
        report(node, 'button-use-shared', 'use Button with href for a styled navigation action')
      if (button && !implementation) {
        if (
          has('style') ||
          binds.some((p: any) => !p.arg) ||
          (has('class') && (!buttonLayoutClasses(attrs.class ?? '') || bound('class')))
        )
          report(
            node,
            'button-no-custom-style',
            'only static layout margins are allowed; use size, variant, block and align',
          )
        for (const [key, choices] of Object.entries({
          size: buttonSizes,
          variant: buttonVariants,
          content: buttonContents,
          align: ['center', 'start'],
        })) {
          const value = literal(key)
          if (value !== undefined && !(choices as readonly string[]).includes(value))
            report(node, 'button-invalid-prop', `${key} must be one of ${choices.join(', ')}`)
        }
        const content = literal('content') ?? (bound('content') ? undefined : 'text')
        const iconSlot = node.children.some(
          (child: any) =>
            child.type === 1 &&
            child.props.some((p: any) => p.name === 'slot' && p.arg?.content === 'icon'),
        )
        const named = ['aria-label', 'aria-labelledby'].some((key) =>
          literal(key) !== undefined
            ? Boolean(literal(key).trim())
            : Boolean(bound(key)?.exp?.content.trim()),
        )
        const text = node.children.some(
          (child: any) =>
            child.type === 5 ||
            (child.type === 2 && child.content.trim()) ||
            (child.type === 1 &&
              !child.props.some((p: any) => p.name === 'slot' && p.arg?.content !== 'default')),
        )
        if (content === 'icon' && !named)
          report(
            node,
            'button-icon-name',
            'icon-only buttons require aria-label or aria-labelledby',
          )
        if ((content === 'icon' && text) || (content && content !== 'icon' && !text))
          report(node, 'button-content', 'visible text must match the selected content mode')
        if (content === 'text' && (has('icon') || iconSlot))
          report(node, 'button-content', 'select icon-text or icon when supplying an icon')
        if ((content === 'icon' || content === 'icon-text') && !has('icon') && !iconSlot)
          report(node, 'button-content', 'provide an icon prop or named icon slot')
        if (
          node.children.some(
            (child: any) => child.type === 1 && ['i', 'img', 'svg'].includes(child.tag),
          )
        )
          report(node, 'button-content', 'put icons in the icon prop or named icon slot')
        if (
          node.children.some(
            (child: any) =>
              child.type === 1 &&
              child.tag !== 'template' &&
              child.props.some(
                (p: any) =>
                  p.name === 'style' ||
                  p.name === 'class' ||
                  ['class', 'style'].includes(p.arg?.content),
              ),
          )
        )
          report(
            node,
            'button-no-custom-style',
            'button content typography belongs to the shared component',
          )
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(parse(source))
  return errors
}
