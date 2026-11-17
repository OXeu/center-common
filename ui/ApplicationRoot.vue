<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterView } from 'vue-router'

const props = defineProps<{
  page: { snapshot: { data: object; key: string }; pending: boolean }
}>()
const content = ref<HTMLElement | null>(null)
watch(
  () => props.page.snapshot.key,
  async () => {
    await nextTick()
    content.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <div ref="content" tabindex="-1" class="application-root" :aria-busy="page.pending">
    <div v-if="page.pending" class="navigation-progress" aria-hidden="true"></div>
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="page.snapshot.key" :data="page.snapshot.data" />
    </RouterView>
  </div>
</template>

<style scoped>
.application-root {
  outline: none;
}
.navigation-progress {
  position: fixed;
  inset: 0 0 auto;
  height: 2px;
  background: var(--color-primary);
  z-index: 100;
}
</style>
