<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import NavigationLink from './NavigationLink.vue'
import type { ButtonContent, ButtonSize, ButtonVariant } from './button.ts'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    size?: ButtonSize
    variant?: ButtonVariant
    content?: ButtonContent
    icon?: string
    href?: string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    block?: boolean
    align?: 'center' | 'start'
  }>(),
  { size: 'normal', variant: 'primary', content: 'text', type: 'button', align: 'center' },
)
const element = ref<HTMLButtonElement | null>(null)
const link = ref<InstanceType<typeof NavigationLink> | null>(null)
const blocked = computed(() => props.disabled || props.variant === 'forbidden')
const attrs = useAttrs()
function forwardedAttributes() {
  return blocked.value
    ? Object.fromEntries(
        Object.entries(attrs).filter(
          ([key]) => !/^on(?:Click|Dblclick|Auxclick|Key|Pointer|Mouse|Touch)/u.test(key),
        ),
      )
    : attrs
}
const showIcon = computed(() => props.content !== 'text')
const showText = computed(() => props.content !== 'icon')
const classes = computed(() => [
  'btn',
  `btn-${props.size}`,
  `btn-${props.variant}`,
  `btn-${props.content}`,
  { 'btn-block': props.block, 'btn-start': props.align === 'start' },
])
function guard(event: Event) {
  if (!blocked.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
}
defineExpose({ element, focus: () => (element.value ?? link.value)?.focus() })
</script>

<template>
  <NavigationLink
    v-if="props.href !== undefined"
    ref="link"
    v-bind="forwardedAttributes()"
    :href="props.href"
    :disabled="blocked"
    :class="classes"
    @click.capture="guard"
  >
    <span v-if="showIcon" class="btn-symbol" aria-hidden="true">
      <slot name="icon"><i :class="props.icon" aria-hidden="true"></i></slot>
    </span>
    <span v-if="showText" class="btn-label"><slot /></span>
  </NavigationLink>
  <button
    v-else
    ref="element"
    v-bind="forwardedAttributes()"
    :type="props.type"
    :disabled="blocked"
    :aria-disabled="blocked || undefined"
    :class="classes"
    @click.capture="guard"
  >
    <span v-if="showIcon" class="btn-symbol" aria-hidden="true">
      <slot name="icon"><i :class="props.icon" aria-hidden="true"></i></slot>
    </span>
    <span v-if="showText" class="btn-label"><slot /></span>
  </button>
</template>
