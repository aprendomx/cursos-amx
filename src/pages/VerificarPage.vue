<!-- src/pages/VerificarPage.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { sbRpc } from '@/lib/sbRest.js'
import IconSet from '@/components/IconSet.vue'
import AppLogo from '@/components/AppLogo.vue'

const props = defineProps({
  folio: { type: String, required: true },
})

const router = useRouter()

const loading = ref(true)
const data = ref(null)
const fetchError = ref(null)
const notFound = ref(false)

const fechaFormateada = computed(() => {
  if (!data.value?.emitida_en) return ''
  const d = new Date(data.value.emitida_en)
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
})

const hashTruncado = computed(() => {
  const h = data.value?.hash_verif || ''
  return h.length > 12 ? '…' + h.slice(-12) : h
})

onMounted(async () => {
  try {
    const result = await sbRpc('verificar_constancia', { p_folio: props.folio }, null)
    if (Array.isArray(result) && result.length > 0) {
      data.value = result[0]
    } else {
      notFound.value = true
    }
  } catch (err) {
    console.error('Error verificando constancia:', err)
    fetchError.value = err?.message || 'No se pudo verificar.'
  } finally {
    loading.value = false
  }
})

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="verificar-page">
    <header class="verificar-header container">
      <AppLogo />
      <span class="mono" :style="{ color: 'var(--ink-4)' }">
        Verificaci&oacute;n oficial &middot; CONASAMA
      </span>
    </header>

    <main class="verificar-main container">
      <!-- Loading -->
      <div v-if="loading" class="verificar-state">
        <span class="mono" :style="{ color: 'var(--ink-3)' }">Verificando&hellip;</span>
      </div>

      <!-- Error de red -->
      <div v-else-if="fetchError" class="verificar-state">
        <p class="eyebrow" :style="{ color: 'var(--danger)' }">Error de conexi&oacute;n</p>
        <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
          {{ fetchError }}
        </p>
        <button class="btn btn-ghost btn-sm verificar-cta" @click="goHome">
          Volver al inicio
          <IconSet name="arrow" />
        </button>
      </div>

      <!-- No encontrada -->
      <div v-else-if="notFound" class="verificar-state">
        <p class="eyebrow" :style="{ color: 'var(--danger)' }">Constancia no encontrada</p>
        <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
          No existe una constancia con folio <span class="mono">{{ folio }}</span
          >.
        </p>
        <button class="btn btn-ghost btn-sm verificar-cta" @click="goHome">
          Volver al inicio
          <IconSet name="arrow" />
        </button>
      </div>

      <!-- Encontrada -->
      <div v-else class="verificar-card">
        <p class="eyebrow" :style="{ color: 'var(--ink-3)' }">VERIFICACI&Oacute;N OFICIAL</p>

        <span class="chip chip-verde verificar-chip">
          <IconSet name="check" />
          V&aacute;lida
        </span>

        <h1 class="display verificar-name">
          {{ data.nombre_persona }}
        </h1>

        <p :style="{ color: 'var(--ink-2)', fontSize: '15px' }">acredit&oacute; el curso de</p>

        <h2 class="display-italic verificar-curso">
          {{ data.titulo_curso }}
        </h2>

        <div class="verificar-meta">
          <div>
            <p class="eyebrow">Emitida</p>
            <p :style="{ fontSize: '14px', fontWeight: '500' }">
              {{ fechaFormateada }}
            </p>
          </div>
          <div>
            <p class="eyebrow">Folio</p>
            <p class="mono" :style="{ fontSize: '14px' }">
              {{ data.folio }}
            </p>
          </div>
          <div>
            <p class="eyebrow">Hash de verificaci&oacute;n</p>
            <p class="mono" :style="{ fontSize: '14px' }">
              {{ hashTruncado }}
            </p>
          </div>
        </div>

        <button class="btn btn-ghost btn-sm verificar-cta" @click="goHome">
          Volver al inicio
          <IconSet name="arrow" />
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.verificar-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.verificar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: calc(var(--unit) * 4);
  padding-bottom: calc(var(--unit) * 4);
  border-bottom: 1px solid var(--line);
}

.verificar-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: calc(var(--unit) * 8);
  padding-bottom: calc(var(--unit) * 8);
}

.verificar-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 6) 0;
}

.verificar-card {
  max-width: 640px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 6) calc(var(--unit) * 4);
}

.verificar-chip {
  margin-bottom: calc(var(--unit) * 2);
}

.verificar-name {
  font-size: clamp(36px, 4vw, 56px);
  color: var(--ink);
  line-height: 1;
}

.verificar-curso {
  font-size: clamp(24px, 3vw, 36px);
  color: var(--primary);
  margin: calc(var(--unit) * 1) 0 calc(var(--unit) * 4) 0;
  line-height: 1.1;
}

.verificar-meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 4);
  width: 100%;
  padding-top: calc(var(--unit) * 4);
  border-top: 1px solid var(--line);
  text-align: left;
  margin-bottom: calc(var(--unit) * 4);
}

.verificar-cta {
  margin-top: calc(var(--unit) * 2);
}

@media (max-width: 720px) {
  .verificar-meta {
    grid-template-columns: 1fr;
    gap: calc(var(--unit) * 2);
  }
}
</style>
