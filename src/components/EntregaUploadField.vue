<script setup>
import { ref, watch } from 'vue'
import { useEntregas, ESTADO_LABEL } from '@/composables/useEntregas.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  leccion: { type: Object, required: true }, // fila de lecciones con requiere_entrega/entrega_tipos/entrega_max_mb
})

const {
  habilitado,
  entrega,
  historial,
  subiendo,
  error,
  tiposPermitidos,
  maxMb,
  accept,
  cargar,
  subir,
  descargar,
} = useEntregas(props.cursoId, props.leccion)

const inputRef = ref(null)
const mostrarHistorial = ref(false)

watch(
  () => props.leccion?.id,
  () => cargar(),
  { immediate: true }
)

async function onFile(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  await subir(file)
  if (inputRef.value) inputRef.value.value = ''
}

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const fmtBytes = (b) =>
  b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'
</script>

<template>
  <div
    v-if="habilitado && leccion?.requiere_entrega"
    class="entrega-field card"
  >
    <div class="entrega-head">
      <p class="eyebrow">
        Entrega de la lección
      </p>
      <span
        v-if="entrega"
        class="entrega-estado mono"
        :data-estado="entrega.estado"
      >
        {{ ESTADO_LABEL[entrega.estado] || entrega.estado }}
      </span>
    </div>

    <p
      v-if="error"
      class="entrega-error mono"
    >
      ⚠ {{ error }}
    </p>

    <!-- Entrega vigente -->
    <div
      v-if="entrega"
      class="entrega-actual"
    >
      <button
        class="entrega-archivo"
        type="button"
        :title="'Descargar ' + entrega.archivo_nombre"
        @click="descargar(entrega)"
      >
        📎 {{ entrega.archivo_nombre }}
      </button>
      <span class="mono entrega-meta">v{{ entrega.version }} · {{ fmtBytes(entrega.archivo_bytes) }} ·
        {{ fmtFecha(entrega.creado_en) }}</span>
    </div>

    <p
      v-if="entrega?.comentario_instructor"
      class="entrega-comentario"
    >
      <strong>Comentario del instructor:</strong> {{ entrega.comentario_instructor }}
    </p>

    <!-- Subir / resubir -->
    <div class="entrega-subir">
      <input
        ref="inputRef"
        type="file"
        :accept="accept"
        :disabled="subiendo"
        style="display: none"
        @change="onFile"
      >
      <button
        class="btn btn-primary btn-sm"
        :disabled="subiendo"
        @click="inputRef?.click()"
      >
        <template v-if="subiendo">
          Subiendo…
        </template>
        <template v-else-if="entrega">
          Resubir archivo
        </template>
        <template v-else>
          Subir archivo
        </template>
      </button>
      <span class="mono entrega-hint">
        {{ tiposPermitidos.join(', ').toUpperCase() }} · máx {{ maxMb }} MB
      </span>
    </div>

    <!-- Historial de versiones -->
    <div
      v-if="historial.length > 1"
      class="entrega-historial"
    >
      <button
        class="btn btn-ghost btn-sm"
        type="button"
        @click="mostrarHistorial = !mostrarHistorial"
      >
        {{ mostrarHistorial ? 'Ocultar' : 'Ver' }} historial ({{ historial.length - 1 }} anterior{{
          historial.length > 2 ? 'es' : ''
        }})
      </button>
      <ul v-if="mostrarHistorial">
        <li
          v-for="h in historial.filter((x) => !x.vigente)"
          :key="h.id"
          class="mono"
        >
          v{{ h.version }} · {{ h.archivo_nombre }} · {{ fmtFecha(h.creado_en) }}
          <a
            href="#"
            @click.prevent="descargar(h)"
          >descargar</a>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.entrega-field {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
  margin-top: calc(var(--unit) * 2);
}
.entrega-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.entrega-estado {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--paper-2, #f3efe7);
  color: var(--ink-3);
}
.entrega-estado[data-estado='aprobada'] {
  background: var(--brand-secondary-soft, #d8e6e1);
  color: var(--brand-secondary, #1e5b4f);
}
.entrega-estado[data-estado='rechazada'] {
  background: var(--primary-100, #f0dce4);
  color: var(--primary, #9b2247);
}
.entrega-estado[data-estado='revisada'] {
  background: var(--brand-accent-soft, #e6d194);
  color: #8a6e3f;
}
.entrega-error {
  color: var(--primary);
  font-size: 12px;
}
.entrega-actual {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.entrega-archivo {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
  text-decoration: underline;
}
.entrega-meta,
.entrega-hint {
  font-size: 11px;
  color: var(--ink-4);
}
.entrega-comentario {
  font-size: 13px;
  color: var(--ink-2);
  background: var(--paper-2, #f8f5ee);
  padding: 8px 12px;
  border-left: 3px solid var(--brand-accent, #a57f2c);
}
.entrega-subir {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.entrega-historial ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.entrega-historial li {
  font-size: 11px;
  color: var(--ink-4);
}
.entrega-historial a {
  color: var(--ink-3);
}
</style>
