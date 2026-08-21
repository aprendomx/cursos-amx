<script setup>
import { computed } from 'vue'
import { generateHTML } from '@tiptap/core'
import { EXTENSIONES_TEXTO } from '@/components/LessonRichTextEditor.vue'
import { sanitizarHtml, marcarEnlacesExternos } from '@/lib/sanitizarHtml.js'

// Único componente que presenta un documento institucional. Lo usan la página
// pública y la vista previa del panel, a propósito: si fueran dos, lo
// previsualizado podría dejar de ser lo que se publica.
const props = defineProps({
  contenido: { type: Object, default: null },
})

// Dos capas, y las dos hacen falta:
//
//  1) generateHTML con la whitelist compartida EXTENSIONES_TEXTO — la misma
//     que usa el editor—, así que solo nodos y marcas conocidas producen
//     markup.
//  2) DOMPurify encima. La whitelist restringe la ESTRUCTURA, pero no
//     verifica los atributos que traiga el JSON: un href 'javascript:'
//     escrito a mano contra la API no lo cubre. Aquí se filtra el esquema.
//
// El contenido lo escriben administradores, pero un administrador puede hacer
// PATCH contra PostgREST sin pasar por el editor: la frontera de confianza
// está en el renderizado.
const render = computed(() => {
  if (!props.contenido) return { html: '', roto: false }
  try {
    const crudo = generateHTML(props.contenido, EXTENSIONES_TEXTO)
    return { html: marcarEnlacesExternos(sanitizarHtml(crudo)), roto: false }
  } catch {
    // generateHTML lanza ante un nodo desconocido en vez de descartarlo. Un
    // documento corrupto no debe tumbar la página: degrada a un aviso, que
    // además le dice a quien administra que hay algo que revisar.
    return { html: '', roto: true }
  }
})
</script>

<template>
  <div v-if="render.roto" class="documento-roto" data-test="documento-roto">
    <p>
      Este documento no se puede mostrar: su contenido tiene un formato que la plataforma no
      reconoce. Avisa a quien la administre.
    </p>
  </div>
  <!-- eslint-disable-next-line vue/no-v-html : whitelist de Tiptap + DOMPurify, nunca input crudo -->
  <div v-else class="documento-cuerpo" data-test="documento-cuerpo" v-html="render.html" />
</template>

<style scoped>
.documento-cuerpo {
  color: var(--ink);
  line-height: 1.75;
  max-width: 68ch;
}
.documento-cuerpo :deep(h2),
.documento-cuerpo :deep(h3),
.documento-cuerpo :deep(h4) {
  font-family: var(--display);
  color: var(--ink);
  margin-top: calc(var(--unit) * 4);
  margin-bottom: calc(var(--unit) * 1);
}
.documento-cuerpo :deep(p) {
  margin: calc(var(--unit) * 1.5) 0;
}
.documento-cuerpo :deep(ul),
.documento-cuerpo :deep(ol) {
  padding-left: calc(var(--unit) * 3);
}
.documento-cuerpo :deep(li) {
  margin: calc(var(--unit) * 0.5) 0;
}
.documento-cuerpo :deep(a) {
  color: var(--primary);
}
.documento-cuerpo :deep(blockquote) {
  border-left: 3px solid var(--line);
  margin-left: 0;
  padding-left: calc(var(--unit) * 2);
  color: var(--ink-2);
}
.documento-cuerpo :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.documento-cuerpo :deep(th),
.documento-cuerpo :deep(td) {
  border: 1px solid var(--line);
  padding: calc(var(--unit) * 1);
  text-align: left;
}
.documento-roto {
  border: 1px solid var(--line);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  padding: calc(var(--unit) * 2);
  color: var(--ink-2);
}
</style>
