<template>
  <button
    type="button"
    class="detection-overlay__fullscreen-btn"
    :aria-label="isFullscreen ? 'Свернуть' : 'На весь экран'"
    :title="isFullscreen ? 'Свернуть' : 'На весь экран'"
    @click.stop="$emit('toggle')"
  >
    <svg
      v-if="isFullscreen"
      class="detection-overlay__fullscreen-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
    <svg
      v-else
      class="detection-overlay__fullscreen-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  </button>
</template>

<script setup>
defineProps({
  isFullscreen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle'])
</script>
