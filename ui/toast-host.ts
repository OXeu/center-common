import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Keeps modal toast ownership within the current application. */
export const useToastHost = defineStore('center-toast-host', () => {
  const target = shallowRef<HTMLElement | string>('body')
  function attach(dialog: HTMLDialogElement): () => void {
    target.value = dialog
    return () => {
      if (target.value === dialog) target.value = 'body'
    }
  }
  return { target, attach }
})
