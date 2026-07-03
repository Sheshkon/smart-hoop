<template>
  <div class="session-tags">
    <span v-if="label" class="form-field__label">{{ label }}</span>

    <div class="session-tags__chips">
      <button
        v-for="tag in DEFAULT_SESSION_TAGS"
        :key="tag"
        type="button"
        class="session-tags__chip"
        :class="{ 'session-tags__chip--active': hasTag(tag) }"
        :disabled="!hasTag(tag) && isFull"
        @click="toggleTag(tag)"
      >
        {{ formatTagLabel(tag) }}
      </button>

      <span
        v-for="tag in customSelectedTags"
        :key="tag"
        class="session-tags__chip session-tags__chip--active session-tags__chip--custom"
      >
        {{ formatTagLabel(tag) }}
        <button
          type="button"
          class="session-tags__remove"
          :aria-label="`Удалить тег ${tag}`"
          @click="removeTag(tag)"
        >
          ×
        </button>
      </span>
    </div>

    <div class="session-tags__add">
      <input
        v-model="customInput"
        type="text"
        class="form-field__input session-tags__input"
        placeholder="# свой тег"
        :maxlength="MAX_TAG_LENGTH"
        autocomplete="off"
        @keydown.enter.prevent="addCustomTag"
      >
      <button
        type="button"
        class="btn btn-secondary btn-small session-tags__add-btn"
        :disabled="!canAddCustom"
        @click="addCustomTag"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  DEFAULT_SESSION_TAGS,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_SESSION,
  normalizeTag,
  normalizeTags,
  formatTagLabel,
} from '../utils/sessionTags.js'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  label: {
    type: String,
    default: 'Теги',
  },
})

const emit = defineEmits(['update:modelValue'])

const customInput = ref('')

const selectedTags = computed(() => normalizeTags(props.modelValue))

const isFull = computed(() => selectedTags.value.length >= MAX_TAGS_PER_SESSION)

const customSelectedTags = computed(() =>
  selectedTags.value.filter(
    (tag) => !DEFAULT_SESSION_TAGS.some((defaultTag) => defaultTag.toLowerCase() === tag.toLowerCase()),
  ),
)

const canAddCustom = computed(() => {
  const tag = normalizeTag(customInput.value)
  return Boolean(tag) && !isFull.value && !hasTag(tag)
})

function hasTag(tag) {
  const normalized = normalizeTag(tag).toLowerCase()
  return selectedTags.value.some((item) => item.toLowerCase() === normalized)
}

function updateTags(tags) {
  emit('update:modelValue', normalizeTags(tags))
}

function toggleTag(tag) {
  if (hasTag(tag)) {
    updateTags(selectedTags.value.filter((item) => item.toLowerCase() !== tag.toLowerCase()))
    return
  }

  if (isFull.value) return
  updateTags([...selectedTags.value, tag])
}

function removeTag(tag) {
  updateTags(selectedTags.value.filter((item) => item.toLowerCase() !== tag.toLowerCase()))
}

function addCustomTag() {
  const tag = normalizeTag(customInput.value)
  if (!tag || isFull.value || hasTag(tag)) return

  updateTags([...selectedTags.value, tag])
  customInput.value = ''
}
</script>
