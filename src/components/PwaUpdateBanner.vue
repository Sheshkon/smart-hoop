<template>
  <div v-if="needRefresh" class="pwa-update-banner" role="status">
    <p class="pwa-update-banner__text">Доступна новая версия приложения</p>
    <div class="pwa-update-banner__actions">
      <button type="button" class="btn btn-small btn-primary" @click="applyPwaUpdate">
        Обновить
      </button>
      <button type="button" class="btn btn-small btn-ghost" @click="dismiss">
        Позже
      </button>
    </div>
  </div>
</template>

<script setup>
import { needRefresh, applyPwaUpdate } from '../pwa/usePwaUpdate.js'

function dismiss() {
  needRefresh.value = false
}
</script>
