<script setup lang="ts">
import { computed } from 'vue'
import Button from './Button.vue'

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    oauthHref?: string
    oauthLabel?: string
  }>(),
  {
    subtitle: '',
    icon: 'ri-shield-keyhole-line',
    oauthHref: '',
    oauthLabel: '',
  },
)

const hasOAuth = computed(() => Boolean(props.oauthHref && props.oauthLabel))
</script>
<template>
  <div class="auth-stage">
    <section class="card auth-card" :aria-label="title">
      <div class="auth-header">
        <div class="auth-emblem" aria-hidden="true">
          <i :class="icon" aria-hidden="true"></i>
        </div>
        <div class="auth-heading">
          <h2 class="auth-title">{{ title }}</h2>
          <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="auth-actions">
        <Button v-if="hasOAuth" :href="oauthHref" variant="primary">
          {{ oauthLabel }}
        </Button>
        <slot />
      </div>
      <slot name="footer" />
    </section>
  </div>
</template>
