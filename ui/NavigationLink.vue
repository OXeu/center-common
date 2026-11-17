<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink, routerKey } from 'vue-router'

const props = defineProps<{ href: string }>()
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
  <RouterLink v-if="internal" :to="href"><slot /></RouterLink>
  <a v-else :href="href"><slot /></a>
</template>
