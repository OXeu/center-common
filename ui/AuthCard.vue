<script setup lang="ts">
import { computed } from 'vue'
import Button from './Button.vue'

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    description?: string
    icon?: string
    oauthHref?: string
    oauthLabel?: string
    footerText?: string
  }>(),
  {
    subtitle: '',
    description: '',
    icon: 'ri-shield-keyhole-line',
    oauthHref: '',
    oauthLabel: '',
    footerText: '',
  },
)

const hasOAuth = computed(() => Boolean(props.oauthHref && props.oauthLabel))
const lead = computed(() => props.description || props.subtitle)
</script>
<template>
  <div class="auth-stage">
    <section class="auth-card" :aria-label="title">
      <header class="auth-head">
        <div v-if="icon" class="auth-emblem" aria-hidden="true">
          <i :class="icon" aria-hidden="true"></i>
        </div>
        <h2 class="auth-title">{{ title }}</h2>
        <p v-if="lead" class="auth-subtitle">{{ lead }}</p>
      </header>
      <div v-if="hasOAuth || $slots.default" class="auth-actions">
        <Button v-if="hasOAuth" :href="oauthHref" block size="lg">{{ oauthLabel }}</Button>
        <slot />
      </div>
      <slot name="footer" />
      <footer v-if="footerText" class="auth-foot">
        <p class="auth-foot-text">{{ footerText }}</p>
      </footer>
    </section>
  </div>
</template>
