<script setup lang="ts">
import Button from './Button.vue'
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { bindToast, onToastKey, toast } from '@yusufceng1z/ding'
import type { ToastItem } from '@yusufceng1z/ding'
import { useToastHost } from './toast-host.ts'

const toastHost = useToastHost()
const state = shallowRef(toast.getState())
const bindings = new Map<string, () => void>()
const icons = {
  success: 'ri-check-line',
  error: 'ri-close-line',
  warning: 'ri-alert-line',
  info: 'ri-information-line',
  loading: 'ri-loader-4-line animate-spin',
}
const unsubscribe = toast.subscribe(() => {
  state.value = toast.getState()
})

function bind(element: Element | ComponentPublicInstance | null, id: string) {
  if (element instanceof HTMLElement) {
    if (!bindings.has(id)) bindings.set(id, bindToast(element, id))
  } else {
    bindings.get(id)?.()
    bindings.delete(id)
  }
}

function slotStyle(index: number) {
  return { '--tst-i': state.value.toasts.length - 1 - index }
}

function dismissible(item: ToastItem) {
  return item.duration === 0 && item.type !== 'loading'
}

onMounted(() => window.addEventListener('keydown', onToastKey))
onBeforeUnmount(() => {
  unsubscribe()
  window.removeEventListener('keydown', onToastKey)
  for (const unbind of bindings.values()) unbind()
  bindings.clear()
})
</script>
<template>
  <Teleport :to="toastHost.target">
    <div
      class="tst-viewport"
      role="region"
      :aria-label="state.labels.region"
      :data-position="state.position"
      :data-theme="state.theme"
      @pointerenter="toast.pause()"
      @pointerleave="toast.resume()"
      @focusin="toast.pause()"
      @focusout="toast.resume()"
      @keydown.esc.stop.prevent="toast.dismiss()"
    >
      <div class="tst-sr" role="status">{{ state.status }}</div>
      <div class="tst-sr" role="alert">{{ state.alert }}</div>
      <div
        v-for="(item, index) in state.toasts"
        :key="item.id"
        :ref="(element) => bind(element, item.id)"
        class="tst-slot"
        :style="slotStyle(index)"
        tabindex="-1"
      >
        <div
          class="tst"
          :data-type="item.type"
          :data-phase="item.phase"
          :style="{ '--tst-life': `${item.duration}ms` }"
        >
          <div class="tst-icon">
            <div class="tst-badge">
              <i class="text-[22px]" :class="icons[item.type]" aria-hidden="true"></i>
            </div>
          </div>
          <div class="tst-body">
            <div class="tst-copy">
              <div class="tst-title">
                {{ item.title
                }}<span v-if="item.count > 1" class="tst-count">×{{ item.count }}</span>
              </div>
              <div v-if="item.description" class="tst-desc">{{ item.description }}</div>
            </div>
            <Button
              v-if="dismissible(item)"
              type="button"
              :aria-label="state.labels.dismiss"
              :tabindex="item.phase === 'open' ? 0 : -1"
              @click="toast.dismiss(item.id)"
              variant="ghost"
              size="sm"
              data-toast-dismiss
              content="icon"
              icon="ri-close-line"
            >
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
