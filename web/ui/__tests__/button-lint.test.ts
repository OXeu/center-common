import { describe, expect, it } from 'vite-plus/test'
import { checkButtonTemplate } from '../../../tools/oxlint/button-template.ts'
import { checkButtonStyles } from '../../../tools/oxlint/button-styles.ts'
import { inspectButtonScript } from '../../../tools/oxlint/button-script.ts'
import { checkTemplate } from '../../../tools/oxlint/templates.ts'

const filename = 'web/ui/src/Example.vue'
const check = (source: string, name = filename, shared = false) =>
  checkButtonTemplate(source, name, shared, new Set(['Button']))

describe('button-use-shared', () => {
  it.each([
    '<button>Save</button>',
    '<input type="submit" />',
    '<input :type="\'button\'" />',
    '<component is="button">Save</component>',
    '<component :is="tag">Save</component>',
    '<div role="button">Save</div>',
    '<span @click="save">Save</span>',
    '<NavigationLink class="rounded-md bg-primary px-3" href="/">Home</NavigationLink>',
  ])('rejects reimplementations: %s', (source) =>
    expect(check(source).join('\n')).toContain('button-use-shared'),
  )

  it('checks import identity, including aliases and local clones', () => {
    const original = "import Action from '@oxeu/center-common/ui/Button.vue'"
    const model = inspectButtonScript(original, filename, false)
    expect(checkButtonTemplate('<Action>Save</Action>', filename, false, model.buttons)).toEqual([])
    expect(checkButtonTemplate('<action>Save</action>', filename, false, model.buttons)).toEqual([])
    expect(
      checkButtonTemplate('<Button>Save</Button>', filename, false, new Set()).join('\n'),
    ).toContain('button-use-shared')
    expect(
      inspectButtonScript("import { Button } from 'another-ui'", filename, false).errors.join('\n'),
    ).toContain('button-use-shared')
    expect(check('<button>Save</button>', 'ui/Button.vue', false).join('\n')).toContain(
      'button-use-shared',
    )
    expect(check('<button>Save</button>', 'ui/Button.vue', true)).toEqual([])
  })

  it.each([
    "import { h } from 'vue'; h('button', {}, 'Save')",
    "import { h as render } from 'vue'; const tag = 'but' + 'ton'; render(tag)",
    "import * as Vue from 'vue'; Vue.createVNode('button')",
    "import { h } from 'vue'; h('div', { onClick: save }, 'Save')",
    "import { h } from 'vue'; h('input', { type: 'submit' })",
    "document.createElement('button')",
    "const element = document.createElement; element('button')",
  ])('rejects script render and DOM bypasses: %s', (source) =>
    expect(inspectButtonScript(source, filename, false).errors.join('\n')).toContain(
      'button-use-shared',
    ),
  )

  it('limits native exceptions to shared semantic controls', () => {
    for (const name of ['ui/CheckboxField.vue', 'ui/DropdownSelect.vue']) {
      expect(check('<button role="checkbox">Check</button>', name, true)).toEqual([])
      expect(check('<button role="checkbox">Check</button>', name, false).join('\n')).toContain(
        'button-use-shared',
      )
    }
    expect(check('<input type="text" />')).toEqual([])
    expect(check('<NavigationLink href="/">Home</NavigationLink>')).toEqual([])
    expect(check('<Button href="/" variant="ghost">Home</Button>')).toEqual([])
  })
})

describe('button contract', () => {
  it.each(['size="huge"', 'variant="outline"', 'content="image"', ':size="\'large\'"'])(
    'rejects invalid props: %s',
    (attrs) =>
      expect(check(`<Button ${attrs}>Save</Button>`).join('\n')).toContain('button-invalid-prop'),
  )
  it.each([
    'class="btn"',
    'class="px-8"',
    'class="sm:h-20"',
    ':class="styles"',
    'style="height:10px"',
    ':style="styles"',
    'v-bind="props"',
  ])('rejects visual overrides: %s', (attrs) =>
    expect(check(`<Button ${attrs}>Save</Button>`).join('\n')).toContain('button-no-custom-style'),
  )
  it('requires icon content and accessible names', () => {
    const labelled = '<Button content="icon" icon="ri-add-line" aria-labelledby="create-label" />'
    expect(check(labelled)).toEqual([])
    expect(checkTemplate(labelled)).toEqual([])
    expect(
      check('<Button content="icon" icon="ri-add-line" aria-label="" />').join('\n'),
    ).toContain('button-icon-name')
    expect(check('<Button content="icon-text" icon="ri-add-line" />').join('\n')).toContain(
      'button-content',
    )
    expect(
      check('<Button content="icon" icon="ri-add-line" aria-label="Create">Create</Button>').join(
        '\n',
      ),
    ).toContain('button-content')
    expect(check('<Button icon="ri-add-line">Create</Button>').join('\n')).toContain(
      'button-content',
    )
    expect(check('<Button content="icon" icon="ri-add-line" />').join('\n')).toContain(
      'button-icon-name',
    )
    expect(check('<Button content="icon" aria-label="Create" />').join('\n')).toContain(
      'button-content',
    )
    expect(check('<Button><i class="ri-add-line" />Create</Button>').join('\n')).toContain(
      'button-content',
    )
    expect(check('<Button content="icon" icon="ri-add-line" aria-label="Create" />')).toEqual([])
    expect(
      check(
        '<Button content="icon-text" icon="ri-add-line" class="ml-auto" size="lg" variant="secondary">Create</Button>',
      ),
    ).toEqual([])
    expect(
      check(
        '<Button content="icon" aria-label="Account"><template #icon><img src="avatar.png" alt="" /></template></Button>',
      ),
    ).toEqual([])
  })
  it.each([
    '.btn { height: 10px; }',
    '.wrapper :deep(.btn-danger) { color: blue; }',
    'button { border-radius: 0; }',
    '[role="button"] { color: red; }',
    '.custom { @apply btn-ghost; }',
    ':root { --button-height: 5rem; }',
    '@media (min-width: 20rem) { .btn { padding: 1px; } }',
  ])('rejects CSS reimplementations: %s', (source) =>
    expect(checkButtonStyles(source, 'web/ui/theme.css', false).join('\n')).toContain(
      'button-no-custom-style',
    ),
  )
  it('only permits shared styles in the actual shared repository', () => {
    expect(checkButtonStyles('.btn { padding: 1rem; }', 'ui/theme.css', false)).not.toEqual([])
    expect(checkButtonStyles('.btn { padding: 1rem; }', 'ui/theme.css', true)).toEqual([])
    expect(checkButtonStyles('.card { padding: 1rem; }', 'web/ui/theme.css', false)).toEqual([])
  })
})
