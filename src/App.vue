<template>
  <div class="app">
    <PwaUpdateBanner />
    <router-view />
  </div>
</template>

<script setup>
import PwaUpdateBanner from './components/PwaUpdateBanner.vue'
</script>
