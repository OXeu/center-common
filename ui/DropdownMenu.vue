<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import Button from './Button.vue'
import { useDropdownPosition } from './dropdown.ts'
const props = defineProps<{ label: string; disabled?: boolean; compact?: boolean }>()
const open = ref(false)
const button = ref<InstanceType<typeof Button> | null>(null)
const trigger = computed(() => button.value?.element ?? null)
const panel = ref<HTMLElement | null>(null)
const position = useDropdownPosition(trigger, panel, open)
const id = useId()
defineExpose({ focus: () => trigger.value?.focus() })
function select(event: MouseEvent) {
  if (!(event.target instanceof Element)) return
  const action = event.target.closest('a[href], button')
  if (!action || action.matches(':disabled, [aria-disabled="true"]')) return
  close()
  trigger.value?.focus()
}
function close() {
  open.value = false
}
async function escape() {
  close()
  await nextTick()
  trigger.value?.focus()
}
function blur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) close()
}
</script>
<template>
  <div class="dropdown" @click.stop @keydown.esc.stop="escape" @focusout="blur">
    <Button
      ref="button"
      type="button"
      variant="ghost"
      :content="props.compact ? 'icon' : 'text'"
      :aria-label="props.label"
      :disabled="props.disabled"
      :aria-expanded="open"
      :aria-controls="id"
      @click="open = !open"
    >
      <template #icon><slot name="trigger" /></template>
      {{ props.label }}
    </Button>
    <div
      v-if="open"
      :id="id"
      ref="panel"
      class="dropdown-panel dropdown-content"
      :style="position"
      tabindex="-1"
      @click="select"
    >
      <slot />
    </div>
  </div>
</template>
