<script setup>
import { computed } from 'vue'

const props = defineProps({
  rubrica: { type: Object, required: true },
  calificaciones: { type: Array, default: () => [] },
  puntajeFinal: { type: Number, default: 0 },
})

const criterios = computed(() => props.rubrica?.criterios || props.rubrica?.rubrica_criterios || [])
const niveles = computed(() => props.rubrica?.niveles || props.rubrica?.rubrica_niveles || [])

function calificacionDeCriterio(criterioId) {
  return props.calificaciones.find((c) => c.criterio_id === criterioId) || null
}

function nivelDeCriterio(criterioId) {
  const cal = calificacionDeCriterio(criterioId)
  if (!cal || !cal.nivel_id) return null
  return niveles.value.find((n) => n.id === cal.nivel_id) || null
}

const scoreColor = computed(() => {
  const p = props.puntajeFinal
  if (p >= 80) return 'var(--brand-secondary)'
  if (p >= 60) return 'var(--brand-accent)'
  return 'var(--primary)'
})
</script>

<template>
  <div class="rubrica-view card">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Rúbrica de calificación</p>
      <h3
        v-if="rubrica.titulo || rubrica.nombre"
        :style="{ marginTop: '4px', fontSize: '16px', fontWeight: '600' }"
      >
        {{ rubrica.titulo || rubrica.nombre }}
      </h3>
    </div>

    <div
      :style="{
        padding: 'calc(var(--unit) * 2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--unit) * 2.5)',
      }"
    >
      <div
        v-for="c in criterios"
        :key="c.id"
        :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 1)' }"
      >
        <div
          :style="{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '8px',
          }"
        >
          <h4 :style="{ fontSize: '14px', fontWeight: '600' }">
            {{ c.nombre }}
          </h4>
          <span class="mono" :style="{ color: 'var(--ink-3)' }">
            {{
              calificacionDeCriterio(c.id)?.puntaje != null
                ? calificacionDeCriterio(c.id).puntaje + ' pts'
                : '—'
            }}
          </span>
        </div>

        <p
          v-if="c.descripcion"
          :style="{ fontSize: '13px', color: 'var(--ink-3)', margin: '4px 0 8px' }"
        >
          {{ c.descripcion }}
        </p>

        <!-- Nivel destacado (tipo niveles) -->
        <div
          v-if="rubrica.tipo === 'niveles' && nivelDeCriterio(c.id)"
          :style="{
            background: 'var(--paper-2)',
            padding: '10px 12px',
            borderRadius: '6px',
            borderLeft: '3px solid var(--primary)',
          }"
        >
          <span :style="{ fontWeight: '500', fontSize: '13px' }">
            {{
              nivelDeCriterio(c.id).nombre ||
              nivelDeCriterio(c.id).descripcion ||
              'Nivel seleccionado'
            }}
          </span>
          <span
            v-if="nivelDeCriterio(c.id).puntaje != null"
            class="mono"
            :style="{ marginLeft: '8px', color: 'var(--ink-3)' }"
          >
            {{ nivelDeCriterio(c.id).puntaje }} pts
          </span>
        </div>

        <!-- Puntaje libre -->
        <div
          v-else-if="
            rubrica.tipo === 'puntaje_libre' && calificacionDeCriterio(c.id)?.puntaje != null
          "
          :style="{
            background: 'var(--paper-2)',
            padding: '10px 12px',
            borderRadius: '6px',
            borderLeft: '3px solid var(--primary)',
          }"
        >
          <span :style="{ fontWeight: '500', fontSize: '13px' }"> Puntaje asignado </span>
          <span class="mono" :style="{ marginLeft: '8px', color: 'var(--ink-3)' }">
            {{ calificacionDeCriterio(c.id).puntaje }} pts
          </span>
        </div>

        <!-- Comentario instructor -->
        <p
          v-if="calificacionDeCriterio(c.id)?.comentario"
          :style="{
            fontSize: '12px',
            color: 'var(--ink-3)',
            marginTop: '6px',
            fontStyle: 'italic',
          }"
        >
          “{{ calificacionDeCriterio(c.id).comentario }}”
        </p>
      </div>

      <div
        :style="{
          borderTop: '1px solid var(--line)',
          paddingTop: 'calc(var(--unit) * 2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }"
      >
        <span class="eyebrow">Puntaje final</span>
        <span :style="{ fontSize: '28px', fontWeight: '600', color: scoreColor }">
          {{ puntajeFinal }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rubrica-view {
  display: flex;
  flex-direction: column;
}
</style>
