<script setup lang="ts">
import Button from './Button.vue'
import type { DangerAction } from './danger.ts'
defineProps<{ action: DangerAction; disabled: boolean }>()
</script>
<template>
  <Button
    type="button"
    :disabled="disabled"
    :data-danger-action="action.id"
    @click="action.request()"
    variant="danger"
    block
    align="start"
  >
    {{ action.label }}
  </Button>
</template>
