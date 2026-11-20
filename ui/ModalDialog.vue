<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from './Button.vue'
import { useToastHost } from './toast-host.ts'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    busy?: boolean
    closeLabel?: string
    maxWidthClass?: string
  }>(),
  {
    busy: false,
    closeLabel: 'Close',
    maxWidthClass: 'max-w-lg',
  },
)

const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const toastHost = useToastHost()
let detachToast: (() => void) | null = null

function releaseToastHost() {
  detachToast?.()
  detachToast = null
}

function syncDialog(isOpen: boolean) {
  const el = dialog.value
  if (!el) return
  if (isOpen) {
    if (!el.open) el.showModal()
    releaseToastHost()
    detachToast = toastHost.attach(el)
  } else {
    releaseToastHost()
    if (el.open) el.close()
  }
}

watch(
  () => props.open,
  (isOpen) => syncDialog(isOpen),
  { flush: 'post' },
)

onBeforeUnmount(() => {
  releaseToastHost()
})

function requestClose() {
  if (!props.busy) emit('close')
}

function onCancel(event: Event) {
  if (props.busy) {
    event.preventDefault()
    return
  }
  emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal-backdrop m-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-surface p-0 text-fg shadow-lg"
    :class="props.maxWidthClass"
    :aria-label="props.title"
    @cancel="onCancel"
    @close="requestClose"
  >
    <div class="p-5">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-base font-semibold">{{ props.title }}</h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          content="icon"
          :disabled="props.busy"
          :aria-label="props.closeLabel"
          @click="requestClose"
        >
          <template #icon><span class="i-lucide-x text-sm" aria-hidden="true" /></template>
        </Button>
      </div>
      <slot />
    </div>
  </dialog>
</template>
