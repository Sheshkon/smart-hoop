<template>
  <div class="page home-page">
    <header class="page-header">
      <h1 class="app-title">Smart Hoop</h1>
      <p class="app-subtitle">Тренировка бросков</p>
    </header>

    <nav class="home-nav">
      <router-link to="/session" class="btn btn-primary btn-large">
        Новая сессия
      </router-link>
      <router-link to="/stats" class="btn btn-secondary btn-large">
        Статистика
      </router-link>
      <router-link to="/settings" class="btn btn-secondary btn-large">
        Настройки
      </router-link>
    </nav>
  </div>
</template>

<script setup>
</script>
