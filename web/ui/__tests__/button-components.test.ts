import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import Button from '../../../ui/Button.vue'
import DropdownMenu from '../../../ui/DropdownMenu.vue'
import { buttonContents, buttonSizes, buttonVariants } from '../../../ui/button.ts'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
function button(options: Parameters<typeof mount<typeof Button>>[1] = {}) {
  const wrapper = mount(Button, options)
  wrappers.push(wrapper)
  return wrapper
}

describe('shared buttons', () => {
  it('uses safe native defaults and forwards labels, events and form attributes', async () => {
    const click = vi.fn()
    const wrapper = button({
      attrs: { name: 'operation', value: 'save', onClick: click },
      slots: { default: 'Save' },
    })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['btn', 'btn-normal', 'btn-primary', 'btn-text']),
    )
    expect(wrapper.text()).toBe('Save')
    expect(wrapper.attributes('name')).toBe('operation')
    expect(wrapper.attributes('value')).toBe('save')
    await wrapper.trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('keeps native form submission opt-in', () => {
    const submit = vi.fn((event: Event) => event.preventDefault())
    const Harness = defineComponent({
      components: { Button },
      template:
        '<form @submit="submit"><Button>Cancel</Button><Button type="submit">Save</Button></form>',
      setup: () => ({ submit }),
    })
    const wrapper = mount(Harness, { attachTo: document.body })
    wrappers.push(wrapper)
    wrapper.findAll('button')[0].element.click()
    expect(submit).not.toHaveBeenCalled()
    wrapper.findAll('button')[1].element.click()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('combines all four sizes, five variants and three content modes', () => {
    for (const size of buttonSizes)
      for (const variant of buttonVariants)
        for (const content of buttonContents) {
          const wrapper = button({
            props: { size, variant, content, icon: 'ri-add-line' },
            attrs: { 'aria-label': 'Create a project' },
            slots: { default: 'Create' },
          })
          expect(wrapper.classes()).toEqual(
            expect.arrayContaining([`btn-${size}`, `btn-${variant}`, `btn-${content}`]),
          )
          expect(wrapper.find('.btn-symbol').exists()).toBe(content !== 'text')
          expect(wrapper.find('.btn-label').exists()).toBe(content !== 'icon')
          expect(wrapper.attributes('disabled') !== undefined).toBe(variant === 'forbidden')
          expect(wrapper.attributes('aria-label')).toBe('Create a project')
        }
  })

  it.each([{ disabled: true }, { variant: 'forbidden' as const, disabled: false }])(
    'blocks disabled actions even for dispatched clicks: %j',
    (props) => {
      const click = vi.fn()
      const wrapper = button({
        props,
        attrs: { onClick: click, onClickCapture: click },
        slots: { default: 'Save' },
      })
      expect(wrapper.attributes('disabled')).toBeDefined()
      expect(wrapper.attributes('aria-disabled')).toBe('true')
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      wrapper.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(click).not.toHaveBeenCalled()
    },
  )

  it('supports named icon slots without exposing decorative text', () => {
    const wrapper = button({
      props: { content: 'icon', variant: 'ghost' },
      attrs: { 'aria-label': 'Account' },
      slots: { icon: '<span>JS</span>' },
    })
    expect(wrapper.get('.btn-symbol').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.btn-label').exists()).toBe(false)
    expect(wrapper.attributes('aria-label')).toBe('Account')
  })

  it('restores dropdown trigger focus when an action or Escape closes it', async () => {
    const wrapper = mount(DropdownMenu, {
      props: { label: 'More' },
      slots: {
        default: defineComponent({
          components: { Button },
          template: '<Button variant="secondary">Edit</Button>',
        }),
      },
      attachTo: document.body,
    })
    wrappers.push(wrapper)
    const trigger = wrapper.get('button[aria-controls]')
    await trigger.trigger('click')
    const action = wrapper.get<HTMLButtonElement>('.dropdown-panel button')
    action.element.focus()
    await action.trigger('click')
    expect(wrapper.find('.dropdown-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click')
    await wrapper.get('.dropdown-panel button').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(trigger.element)
  })
})

describe('link buttons', () => {
  it('preserves Router navigation and modified clicks', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/projects', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const wrapper = button({
      props: { href: '/projects', variant: 'secondary' },
      slots: { default: 'Projects' },
      global: { plugins: [router] },
    })
    expect(wrapper.element.tagName).toBe('A')
    wrapper.element.addEventListener('click', (event: Event) => event.preventDefault(), {
      once: true,
    })
    await wrapper.trigger('click', { ctrlKey: true })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    await wrapper.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects')
  })

  it.each(['https://example.test/docs', '/projects'])(
    'removes navigation and focus from forbidden links: %s',
    async (href) => {
      const click = vi.fn()
      const wrapper = button({
        props: { href, variant: 'forbidden' },
        attrs: { onClick: click, tabindex: 0 },
        slots: { default: 'Projects' },
      })
      expect(wrapper.element.tagName).toBe('A')
      expect(wrapper.attributes('href')).toBeUndefined()
      expect(wrapper.attributes('aria-disabled')).toBe('true')
      expect(wrapper.attributes('tabindex')).toBe('-1')
      await wrapper.trigger('click')
      expect(click).not.toHaveBeenCalled()
      await wrapper.setProps({ variant: 'primary' })
      expect(wrapper.attributes('href')).toBe(href)
      expect(wrapper.attributes('aria-disabled')).toBeUndefined()
      expect(wrapper.attributes('tabindex')).toBe('0')
    },
  )
})
