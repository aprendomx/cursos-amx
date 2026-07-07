<script setup>
import { ref } from 'vue'
import { useAiSummarizer } from '@/composables/useAiSummarizer.js'

const props = defineProps({
  content: { type: String, default: '' },
  contentType: { type: String, default: 'text' },
  leccionId: { type: String, default: '' },
})

const ai = useAiSummarizer()
const expanded = ref(false)

async function onResumir() {
  if (!props.content.trim()) return
  expanded.value = true
  await ai.resumir(props.content, props.contentType, props.leccionId)
}

function onCerrar() {
  expanded.value = false
  ai.limpiar()
}
</script>

<template>
  <div class="ai-summarize">
    <button
      type="button"
      class="btn btn-secondary ai-btn"
      :disabled="ai.loading.value"
      @click="onResumir"
    >
      <span v-if="ai.loading.value">✨ Resumiendo…</span>
      <span v-else>✨ Resumir esta lección</span>
    </button>

    <div
      v-if="expanded"
      class="card ai-summary-panel"
      :style="{ marginTop: 'calc(var(--unit) * 2)' }"
    >
      <div class="ai-summary-header">
        <h4 class="eyebrow">Resumen generado por IA</h4>
        <button type="button" class="qe-icon" @click="onCerrar">×</button>
      </div>

      <div v-if="ai.error.value" class="alert alert-error">
        {{ ai.error.value }}
      </div>

      <div v-else-if="ai.summary.value" class="ai-summary-body" :style="{ whiteSpace: 'pre-wrap' }">
        {{ ai.summary.value }}
      </div>

      <p
        v-if="ai.isCached.value"
        class="caption"
        :style="{ color: 'var(--ink-4)', marginTop: '8px' }"
      >
        (Desde caché)
      </p>
    </div>
  </div>
</template>

<style scoped>
.ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-summary-panel {
  padding: calc(var(--unit) * 3);
}
.ai-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--unit) * 2);
}
.ai-summary-body {
  line-height: 1.6;
  color: var(--ink-2);
}
</style>
