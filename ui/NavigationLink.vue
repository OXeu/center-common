<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink, routerKey } from 'vue-router'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ href: string; disabled?: boolean }>()
const element = ref<HTMLAnchorElement | null>(null)
const routed = ref<{ $el: HTMLAnchorElement } | null>(null)
const linkAttributes = computed(() =>
  props.disabled
    ? { 'aria-disabled': true as const, tabindex: -1, role: 'link' }
    : { href: props.href },
)
defineExpose({ focus: () => (element.value ?? routed.value?.$el)?.focus() })
const router = inject(routerKey, undefined)
const internal = computed(
  () =>
    router &&
    props.href.startsWith('/') &&
    !props.href.startsWith('//') &&
    !router.currentRoute.value.meta.document &&
    router.resolve(props.href).matched.length > 0 &&
    !router.resolve(props.href).meta.document,
)
</script>

<template>
  <RouterLink v-if="internal && !disabled" ref="routed" v-bind="$attrs" :to="href"
    ><slot
  /></RouterLink>
  <a v-else ref="element" v-bind="{ ...$attrs, ...linkAttributes }"><slot /></a>
</template>
