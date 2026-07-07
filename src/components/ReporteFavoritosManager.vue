<script setup>
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'cursos_amx_reportes_favoritos'

const favoritos = ref([])

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) favoritos.value = parsed
    }
  } catch {
    // ignore corrupted storage
  }
})

function eliminar(index) {
  favoritos.value.splice(index, 1)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favoritos.value))
  } catch {
    // ignore storage errors
  }
}
</script>

<template>
  <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
    <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Reportes favoritos</p>

    <div
      v-if="!favoritos.length"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
    >
      No tienes reportes guardados.
    </div>

    <ul
      v-else
      :style="{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--unit) * 1.5)',
      }"
    >
      <li
        v-for="(item, i) in favoritos"
        :key="i"
        :style="{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(var(--unit) * 1.5) calc(var(--unit) * 2)',
          borderRadius: '6px',
          background: 'var(--paper-2)',
        }"
      >
        <span class="mono" :style="{ color: 'var(--ink-2)', fontSize: '13px' }">
          {{ item.nombre || item.tipo_reporte || 'Reporte' }}
        </span>
        <button class="btn btn-sm btn-secondary" @click="eliminar(i)">Eliminar</button>
      </li>
    </ul>
  </div>
</template>
