<!-- src/components/AvanceSemanal.vue — la racha como titular y la semana en
     barras (pantalla 07 de la propuesta). Solo se monta con `gamificacion`
     encendida: quien lo use debe condicionar el montaje, no este componente.

     La semana se corta con la fecha LOCAL del navegador; los días activos
     llegan ya cortados en la zona horaria de la plataforma (migración 002).
     Para el público de esta plataforma ambos husos coinciden; si divergen, el
     desfase es de presentación, nunca del cálculo de la racha. -->
<script setup>
import { computed } from 'vue'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  racha: {
    type: Object,
    default: () => ({ racha_actual: 0, mejor_racha: 0, activo_hoy: false }),
  },
  // Fechas 'YYYY-MM-DD' con actividad (obtenerDiasActivos).
  diasActivos: { type: Array, default: () => [] },
})

// Meta semanal: convención de interfaz (no hay campo de producto para esto).
// 5 de 7 deja respirar el fin de semana sin romper el hábito.
const META_SEMANAL = 5

const ETIQUETAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function isoLocal(d) {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

const semana = computed(() => {
  const activos = new Set(props.diasActivos)
  const hoy = new Date()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  const hoyIso = isoLocal(hoy)
  return ETIQUETAS.map((etiqueta, i) => {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    const iso = isoLocal(d)
    return {
      etiqueta,
      iso,
      activo: activos.has(iso),
      esHoy: iso === hoyIso,
      futuro: iso > hoyIso,
    }
  })
})

const activosSemana = computed(() => semana.value.filter((d) => d.activo).length)
const metaCumplida = computed(() => activosSemana.value >= META_SEMANAL)
</script>

<template>
  <div class="avance-semanal tarjeta-plana" data-test="avance-semanal">
    <div class="avance-racha">
      <span class="display avance-racha-num" data-test="racha-actual">{{
        racha.racha_actual
      }}</span>
      <div class="avance-racha-texto">
        <strong>{{ racha.racha_actual === 1 ? 'día de racha' : 'días de racha' }}</strong>
        <span v-if="racha.activo_hoy" class="avance-racha-estado is-hecho">
          <IconSet name="check" /> Hoy ya cuenta
        </span>
        <span v-else class="avance-racha-estado">Hoy aún no cuenta</span>
        <span v-if="racha.mejor_racha > 1" class="mono avance-racha-mejor"
          >Mejor racha: {{ racha.mejor_racha }} días</span
        >
      </div>
    </div>

    <div
      class="avance-semana"
      role="img"
      :aria-label="`${activosSemana} de 7 días activos esta semana`"
    >
      <div v-for="d in semana" :key="d.iso" class="avance-dia">
        <span
          class="avance-dia-barra"
          :class="{ 'is-activo': d.activo, 'is-hoy': d.esHoy, 'is-futuro': d.futuro }"
        />
        <span class="mono avance-dia-etiqueta">{{ d.etiqueta }}</span>
      </div>
    </div>

    <p class="avance-meta" :class="{ 'is-cumplida': metaCumplida }" data-test="meta-semanal">
      <template v-if="metaCumplida">
        Meta semanal cumplida: {{ activosSemana }} de {{ META_SEMANAL }} días.
      </template>
      <template v-else>
        Meta semanal: {{ activosSemana }} de {{ META_SEMANAL }} días activos.
      </template>
    </p>
  </div>
</template>

<style scoped>
.avance-semanal {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2.5);
}
.avance-racha {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
}
.avance-racha-num {
  font-size: var(--text-4xl);
  line-height: 1;
  color: var(--ink);
}
.avance-racha-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--ink);
}
.avance-racha-estado {
  font-size: var(--text-sm);
  color: var(--ink-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.avance-racha-estado.is-hecho {
  color: var(--sobre-accent-soft);
  background: var(--brand-accent-soft);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  align-self: flex-start;
}
.avance-racha-mejor {
  font-size: var(--text-xs);
  color: var(--ink-4);
}

.avance-semana {
  display: flex;
  gap: calc(var(--unit) * 1);
  align-items: flex-end;
}
.avance-dia {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.avance-dia-barra {
  width: 100%;
  max-width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--paper-3);
}
.avance-dia-barra.is-activo {
  background: var(--brand-accent);
}
.avance-dia-barra.is-hoy:not(.is-activo) {
  border: 2px dashed var(--ink-3);
  background: transparent;
}
.avance-dia-barra.is-futuro {
  opacity: 0.45;
}
.avance-dia-etiqueta {
  font-size: var(--text-xs);
  color: var(--ink-4);
}

.avance-meta {
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.avance-meta.is-cumplida {
  color: var(--sobre-accent-soft);
  background: var(--brand-accent-soft);
  padding: calc(var(--unit) * 1) calc(var(--unit) * 1.5);
  border-radius: var(--radius-sm);
  align-self: flex-start;
}
</style>
