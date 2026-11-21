<script setup lang="ts">
import { computed } from 'vue'
import Button from './Button.vue'

export type ConsentDetail = {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    description: string
    logoSrc?: string
    icon?: string
    scopes?: string[]
    details?: ConsentDetail[]
    allowLabel: string
    denyLabel: string
    busy?: boolean
    denyFirst?: boolean
  }>(),
  {
    subtitle: '',
    logoSrc: '',
    icon: 'ri-shield-user-line',
    scopes: () => [],
    details: () => [],
    busy: false,
    denyFirst: false,
  },
)

const emit = defineEmits<{
  allow: []
  deny: []
}>()

const hasScopes = computed(() => props.scopes.length > 0)
const hasDetails = computed(() => props.details.length > 0)
</script>
<template>
  <div class="auth-stage">
    <section class="card auth-card consent-card" :aria-label="title">
      <div class="auth-header">
        <img
          v-if="logoSrc"
          :src="logoSrc"
          alt=""
          width="48"
          height="48"
          class="consent-logo"
        />
        <div v-else class="auth-emblem" aria-hidden="true">
          <i :class="icon" aria-hidden="true"></i>
        </div>
        <div class="auth-heading">
          <h2 class="auth-title">{{ title }}</h2>
          <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="auth-body">
        <p class="consent-description">{{ description }}</p>
        <ul v-if="hasScopes" class="consent-scope-list">
          <li v-for="scope in scopes" :key="scope" class="consent-scope-item">
            <i class="ri-shield-check-line consent-scope-icon" aria-hidden="true"></i>
            <span>{{ scope }}</span>
          </li>
        </ul>
        <dl v-if="hasDetails" class="consent-meta">
          <div v-for="item in details" :key="item.label" class="consent-meta-row">
            <dt class="consent-meta-label">{{ item.label }}</dt>
            <dd class="consent-meta-value">{{ item.value }}</dd>
          </div>
        </dl>
      </div>
      <div class="auth-actions">
        <template v-if="denyFirst">
          <Button type="button" :disabled="busy" @click="emit('deny')" variant="secondary">
            {{ denyLabel }}
          </Button>
          <Button type="button" :disabled="busy" @click="emit('allow')" variant="primary">
            {{ allowLabel }}
          </Button>
        </template>
        <template v-else>
          <Button type="button" :disabled="busy" @click="emit('allow')" variant="primary">
            {{ allowLabel }}
          </Button>
          <Button type="button" :disabled="busy" @click="emit('deny')" variant="secondary">
            {{ denyLabel }}
          </Button>
        </template>
      </div>
      <slot />
    </section>
  </div>
</template>
