<script setup lang="ts">
import DropdownMenu from './DropdownMenu.vue'
import DangerActionButton from './DangerActionButton.vue'
import type { DangerAction } from './danger.ts'
defineProps<{ actions: DangerAction[]; disabled: boolean; label: string }>()
</script>
<template>
  <DropdownMenu v-if="actions.length" :label="label" :disabled="disabled" compact>
    <template #trigger>
      <span class="i-lucide-ellipsis-vertical text-sm" aria-hidden="true" />
    </template>
    <DangerActionButton
      v-for="action in actions"
      :key="action.id"
      :action="action"
      :disabled="disabled"
    />
  </DropdownMenu>
</template>
