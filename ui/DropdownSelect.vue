<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useDropdownPosition } from './dropdown.ts'

const props = defineProps<{
  id: string
  label: string
  options: { value: string; label: string }[]
  disabled?: boolean
  required?: boolean
}>()
const model = defineModel<string>({ required: true })
const listId = useId()
const open = ref(false)
const active = ref(0)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const position = useDropdownPosition(trigger, panel, open, true)
const optionRefs = ref<HTMLElement[]>([])
const selected = computed(() => props.options.find((option) => option.value === model.value))
const activeId = computed(() => (open.value ? `${listId}-${active.value}` : undefined))
let search = ''
let searchedAt = 0

function close() {
  open.value = false
}
watch(() => props.disabled, close)
watch(() => props.options, close)

async function reveal(index: number) {
  if (props.disabled || !props.options.length) return
  active.value = (index + props.options.length) % props.options.length
  open.value = true
  await nextTick()
  optionRefs.value[active.value]?.scrollIntoView?.({ block: 'nearest' })
}
function toggle() {
  if (open.value) close()
  else
    void reveal(
      Math.max(
        0,
        props.options.findIndex((option) => option.value === model.value),
      ),
    )
}
function choose(index: number) {
  if (props.disabled) return
  const option = props.options[index]
  if (option) model.value = option.value
  close()
  trigger.value?.focus()
}
function keydown(event: KeyboardEvent) {
  if (props.disabled) return
  const key = event.key
  if (key === 'Tab') {
    close()
    return
  }
  if (key === 'Escape') {
    if (!open.value) return
    event.preventDefault()
    event.stopPropagation()
    close()
    trigger.value?.focus()
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
    event.preventDefault()
    if (key === 'Enter' || key === ' ') {
      if (open.value) choose(active.value)
      else toggle()
    } else if (key === 'Home' || key === 'End') {
      void reveal(key === 'Home' ? 0 : props.options.length - 1)
    } else if (!open.value) toggle()
    else void reveal(active.value + (key === 'ArrowDown' ? 1 : -1))
    return
  }
  if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  const now = Date.now()
  search = (now - searchedAt > 700 ? '' : search) + key.toLocaleLowerCase()
  searchedAt = now
  const index = props.options.findIndex((option) =>
    option.label.toLocaleLowerCase().startsWith(search),
  )
  if (index >= 0) void reveal(index)
}
</script>

<template>
  <div class="dropdown-select">
    <button
      :id="props.id"
      ref="trigger"
      type="button"
      class="input h-auto min-h-9 break-words py-2 text-left"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="props.label"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="activeId"
      :aria-required="props.required"
      :disabled="props.disabled"
      @click="toggle"
      @keydown="keydown"
      @blur="close"
    >
      {{ selected?.label ?? props.label }}
    </button>
    <div
      v-if="open"
      :id="listId"
      ref="panel"
      role="listbox"
      :aria-label="props.label"
      class="dropdown-panel dropdown-options"
      :style="position"
    >
      <div
        v-for="(option, index) in props.options"
        :id="`${listId}-${index}`"
        :key="option.value"
        ref="optionRefs"
        role="option"
        class="dropdown-option"
        :aria-selected="option.value === model"
        :data-active="index === active"
        @pointerdown.prevent
        @click="choose(index)"
      >
        {{ option.label }}
      </div>
    </div>
  </div>
</template>
