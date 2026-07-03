<template>
  <div class="page settings-page">
    <header class="page-header page-header--row">
      <router-link to="/" class="btn btn-ghost btn-small">← Назад</router-link>
      <h1 class="page-title">Настройки</h1>
    </header>

    <main class="page-content">
      <section class="settings-section">
        <h2 class="settings-section__title">Тема оформления</h2>
        <div class="theme-picker" role="radiogroup" aria-label="Тема оформления">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-picker__option"
            :class="{ 'theme-picker__option--active': themeSettings.preference === option.value }"
            role="radio"
            :aria-checked="themeSettings.preference === option.value"
            @click="setThemePreference(option.value)"
          >
            <span class="theme-picker__swatch" :class="`theme-picker__swatch--${option.value}`" aria-hidden="true" />
            {{ option.label }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { themeSettings, setThemePreference, THEME_OPTIONS } from '../stores/theme.js'

const themeOptions = [
  { value: THEME_OPTIONS.LIGHT, label: 'Светлая' },
  { value: THEME_OPTIONS.DARK, label: 'Тёмная' },
  { value: THEME_OPTIONS.SYSTEM, label: 'Как в системе' },
]
</script>
