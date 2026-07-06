<script setup>
import { ref, computed } from 'vue'
import { uploadDocumento, deleteDocumento } from '@/services/documentos.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const leccionEsPersistida = computed(() => UUID_RE.test(props.leccionId || ''))

const props = defineProps({
  leccionId: { type: String, required: true },
  documentoPath: { type: String, default: null },
  documentoTipo: { type: String, default: null },
})
const emit = defineEmits(['documento-updated'])

const uploading = ref(false)
const progress = ref(0)
const localErr = ref('')

const filename = computed(() => {
  if (!props.documentoPath) return ''
  return props.documentoPath.split('/').pop()
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  localErr.value = ''
  uploading.value = true
  progress.value = 0
  try {
    const result = await uploadDocumento(props.leccionId, file, {
      onProgress: (p) => {
        progress.value = p
      },
    })
    emit('documento-updated', result)
  } catch (err) {
    localErr.value = String(err.message || err)
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

async function onRemove() {
  if (!confirm('¿Eliminar el documento?')) return
  await deleteDocumento(props.leccionId)
  emit('documento-updated', null)
}
</script>

<template>
  <div class="duf">
    <div class="duf-row">
      <strong>Documento</strong>
      <span
        v-if="documentoPath"
        class="duf-status"
      >{{ documentoTipo }}</span>
    </div>

    <div
      v-if="!leccionEsPersistida"
      class="duf-info"
    >
      Guarda el curso primero para poder subir el documento de esta lección.
    </div>

    <template v-else>
      <div
        v-if="uploading"
        class="duf-progress"
      >
        <div class="duf-bar">
          <div
            class="duf-fill"
            :style="{ width: Math.round(progress * 100) + '%' }"
          />
        </div>
        <span>Subiendo… {{ Math.round(progress * 100) }}%</span>
      </div>

      <div
        v-else-if="documentoPath"
        class="duf-ok"
      >
        ✓ {{ filename }}
        <button
          type="button"
          @click="onRemove"
        >
          Eliminar
        </button>
      </div>

      <label
        v-if="!uploading"
        class="duf-upload"
      >
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          @change="onFileChange"
        >
        <span>{{ documentoPath ? 'Reemplazar' : 'Subir documento' }}</span>
      </label>

      <div
        v-if="localErr"
        class="duf-err"
      >
        {{ localErr }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.duf {
  border: 1px solid #ccc;
  padding: 12px;
  border-radius: 6px;
  background: #fafafa;
}
.duf-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.duf-status {
  font-family: monospace;
  font-size: 0.75em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: #060;
  color: #fff;
}
.duf-info {
  font-size: 0.9em;
  color: #555;
}
.duf-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0;
  font-size: 0.85em;
  font-family: monospace;
}
.duf-bar {
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}
.duf-fill {
  height: 100%;
  background: #060;
  transition: width 0.2s linear;
}
.duf-ok {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 0.9em;
  color: #060;
  margin: 6px 0;
}
.duf-ok button {
  border: 1px solid #a00;
  background: transparent;
  color: #a00;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
}
.duf-upload {
  display: inline-block;
  margin-top: 8px;
}
.duf-upload input {
  display: none;
}
.duf-upload span {
  cursor: pointer;
  text-decoration: underline;
  color: #036;
  font-size: 0.9em;
}
.duf-err {
  color: #a00;
  font-size: 0.9em;
  margin-top: 6px;
}
</style>
