<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ id?: string; label: string; value?: string; disabled?: boolean }>()
const model = defineModel<boolean | string[]>({ required: true })
const fallbackId = useId()
const controlId = computed(() => props.id ?? fallbackId)
const checked = computed(() =>
  Array.isArray(model.value) ? model.value.includes(props.value ?? '') : model.value,
)
function toggle() {
  if (props.disabled) return
  if (Array.isArray(model.value)) {
    if (props.value === undefined) return
    model.value = checked.value
      ? model.value.filter((value) => value !== props.value)
      : [...model.value, props.value]
  } else model.value = !model.value
}
</script>

<template>
  <div class="checkbox-field">
    <button
      :id="controlId"
      type="button"
      role="checkbox"
      class="checkbox"
      :value="props.value"
      :aria-label="props.label"
      :aria-checked="checked"
      :disabled="props.disabled"
      @click="toggle"
    >
      <i v-if="checked" class="ri-check-line" aria-hidden="true"></i>
    </button>
    <label :for="controlId">{{ props.label }}</label>
  </div>
</template>
