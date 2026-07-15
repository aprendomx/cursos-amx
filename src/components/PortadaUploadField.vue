<script setup>
// Campo reutilizable de portada (curso y módulo): preview, subida con
// progreso y eliminación con confirmación.
import { ref } from 'vue'
import { uploadPortada, deletePortada } from '@/services/portadas.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  confirmMessage: { type: String, default: '¿Quitar la imagen de portada?' },
})

const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const uploading = ref(false)
const progress = ref(0)
const error = ref('')

async function onFile(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  error.value = ''
  uploading.value = true
  progress.value = 0
  try {
    const { publicUrl } = await uploadPortada(file, (p) => {
      progress.value = p
    })
    emit('update:modelValue', publicUrl)
  } catch (err) {
    error.value = String(err?.message || err)
  } finally {
    uploading.value = false
    if (inputRef.value) inputRef.value.value = ''
  }
}

function onRemove() {
  if (!props.modelValue) return
  if (!confirm(props.confirmMessage)) return
  const previous = props.modelValue
  emit('update:modelValue', '')
  deletePortada(previous).catch(() => {})
}
</script>

<template>
  <div class="portada-upload">
    <div
      class="portada-preview"
      :class="{ 'is-empty': !modelValue, 'is-uploading': uploading }"
      :style="modelValue ? { backgroundImage: `url(${modelValue})` } : null"
    >
      <span v-if="!modelValue && !uploading" class="portada-preview-empty"> Sin portada </span>
      <div v-if="uploading" class="portada-progress">
        <div class="portada-progress-bar" :style="{ width: Math.round(progress * 100) + '%' }" />
        <span>{{ Math.round(progress * 100) }}%</span>
      </div>
    </div>
    <div class="portada-actions">
      <label class="portada-btn">
        <input
          ref="inputRef"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="uploading"
          @change="onFile"
        />
        <span>{{ modelValue ? 'Reemplazar' : 'Subir imagen' }}</span>
      </label>
      <button
        v-if="modelValue"
        type="button"
        class="portada-btn portada-btn-danger"
        :disabled="uploading"
        @click="onRemove"
      >
        Quitar
      </button>
    </div>
    <p v-if="error" class="portada-err">
      {{ error }}
    </p>
    <p class="portada-hint">PNG, JPEG o WebP · máx 10 MB · recomendado 1600×900.</p>
  </div>
</template>
