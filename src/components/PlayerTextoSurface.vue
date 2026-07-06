<script setup>
import { computed } from 'vue'
import { generateHTML } from '@tiptap/core'
import { useI18n } from 'vue-i18n'
import { EXTENSIONES_TEXTO } from '@/components/LessonRichTextEditor.vue'

const props = defineProps({
  contenido: { type: Object, required: true },
  completada: { type: Boolean, default: false },
})
const emit = defineEmits(['completada'])
const { t } = useI18n()

// La whitelist EXTENSIONES_TEXTO es la sanitización: solo nodos/marks
// conocidos generan markup; Link ya restringe protocolos a http/https.
const html = computed(() => {
  try {
    return generateHTML(props.contenido, EXTENSIONES_TEXTO)
  } catch {
    return ''
  }
})
</script>

<template>
  <div class="texto-surface">
    <!-- eslint-disable-next-line vue/no-v-html : HTML generado por whitelist Tiptap, nunca input crudo -->
    <div
      class="texto-body"
      data-test="texto-body"
      v-html="html"
    />
    <button
      v-if="!completada"
      class="texto-completar"
      data-test="marcar-completada"
      @click="emit('completada')"
    >
      ✓ {{ t('builder.markComplete') }}
    </button>
  </div>
</template>

<style scoped>
.texto-surface {
  background: var(--paper);
  border-radius: 12px;
  padding: calc(var(--unit) * 3);
  max-width: 760px;
  margin: 0 auto;
}
.texto-body {
  color: var(--ink);
  line-height: 1.7;
}
.texto-body :deep(h2),
.texto-body :deep(h3) {
  font-family: var(--display);
  color: var(--ink);
}
.texto-body :deep(a) {
  color: var(--primary);
}
.texto-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
.texto-body :deep(blockquote) {
  border-left: 3px solid var(--line);
  margin-left: 0;
  padding-left: calc(var(--unit) * 2);
  color: var(--ink-2);
}
.texto-completar {
  margin-top: calc(var(--unit) * 3);
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
}
</style>
