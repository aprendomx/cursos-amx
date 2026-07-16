<script setup>
import { ref } from 'vue'
import { subirArchivo } from '@/services/entregas'

const props = defineProps({
  maxFiles: { type: Number, default: 5 },
  maxSizeMb: { type: Number, default: 10 },
  tareaId: { type: String, required: true },
  userId: { type: String, required: true },
  version: { type: Number, required: true },
})

const emit = defineEmits(['uploaded', 'removed'])

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/x-zip-compressed',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.zip']

const uploadedFiles = ref([])
const isDragging = ref(false)
const errorMsg = ref('')
const uploading = ref(false)

function extensionValida(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext)
}

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type) && !extensionValida(file.name)) {
    return `Tipo no permitido: ${file.name}`
  }
  if (file.size > props.maxSizeMb * 1024 * 1024) {
    return `Tamaño excede ${props.maxSizeMb} MB: ${file.name}`
  }
  return null
}

async function handleFiles(files) {
  errorMsg.value = ''
  const newFiles = Array.from(files)

  if (uploadedFiles.value.length + newFiles.length > props.maxFiles) {
    errorMsg.value = `Máximo ${props.maxFiles} archivos permitidos.`
    return
  }

  for (const file of newFiles) {
    const err = validateFile(file)
    if (err) {
      errorMsg.value = err
      return
    }
  }

  uploading.value = true
  const paths = []
  try {
    for (const file of newFiles) {
      const path = await subirArchivo(props.tareaId, props.userId, props.version, file)
      uploadedFiles.value.push({ name: file.name, path })
      paths.push(path)
    }
    emit('uploaded', paths)
  } catch (e) {
    errorMsg.value = e?.message || 'Error al subir archivos'
  } finally {
    uploading.value = false
  }
}

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length) handleFiles(files)
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onFileInput(e) {
  const files = e.target.files
  if (files?.length) handleFiles(files)
  e.target.value = ''
}

function removeFile(index) {
  const file = uploadedFiles.value[index]
  uploadedFiles.value.splice(index, 1)
  emit('removed', file.path)
}
</script>

<template>
  <div class="entrega-uploader">
    <div
      class="drop-zone"
      :class="{ dragging: isDragging, disabled: uploading }"
      data-test="drop-zone"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      @click="!uploading && $refs.fileInput.click()"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        class="file-input"
        data-test="file-input"
        @change="onFileInput"
      />
      <p class="drop-text">
        {{ uploading ? 'Subiendo…' : 'Arrastra archivos aquí o haz clic para seleccionar' }}
      </p>
      <p class="drop-hint">
        PDF, DOC, DOCX, PNG, JPG, JPEG, ZIP — máx. {{ maxSizeMb }} MB / {{ maxFiles }} archivos
      </p>
    </div>

    <p v-if="errorMsg" class="error-msg" data-test="error-msg">
      {{ errorMsg }}
    </p>

    <ul v-if="uploadedFiles.length" class="file-list" data-test="file-list">
      <li v-for="(f, i) in uploadedFiles" :key="f.path" class="file-item" data-test="file-item">
        <span class="file-name">{{ f.name }}</span>
        <button
          class="remove-btn"
          data-test="remove-btn"
          :aria-label="`Eliminar ${f.name}`"
          @click.stop="removeFile(i)"
        >
          ×
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.entrega-uploader {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.drop-zone {
  border: 2px dashed var(--line);
  border-radius: 6px;
  padding: calc(var(--unit) * 3);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 160ms var(--ease),
    background 160ms var(--ease);
  background: var(--paper);
}
.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--primary);
  background: var(--paper-2);
}
.drop-zone.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.file-input {
  display: none;
}
.drop-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
  margin: 0 0 4px;
}
.drop-hint {
  font-size: 12px;
  color: var(--ink-3);
  margin: 0;
}
.error-msg {
  font-size: 13px;
  color: #dc2626;
  margin: 0;
}
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit));
}
.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--unit)) calc(var(--unit) * 1.5);
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
}
.file-name {
  font-size: 13px;
  color: var(--ink);
  word-break: break-all;
}
.remove-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    color 160ms var(--ease),
    background 160ms var(--ease);
}
.remove-btn:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}
</style>
