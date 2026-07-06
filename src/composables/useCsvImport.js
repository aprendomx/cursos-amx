// src/composables/useCsvImport.js
import { ref, computed } from 'vue'

export function useCsvImport() {
  const raw = ref('')
  const headers = ref([])
  const rows = ref([])
  const errors = ref([])

  const validRows = computed(() => rows.value.filter((r) => r.valid))
  const invalidRows = computed(() => rows.value.filter((r) => !r.valid))

  function parse(csvText) {
    raw.value = csvText
    rows.value = []
    errors.value = []

    const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) {
      errors.value.push(
        'El archivo CSV debe tener al menos una fila de encabezados y una fila de datos'
      )
      return
    }

    const h = lines[0].split(',').map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''))
    headers.value = h

    const required = ['nombre', 'email']
    const missing = required.filter((r) => !h.includes(r))
    if (missing.length) {
      errors.value.push(`Faltan columnas requeridas: ${missing.join(', ')}`)
      return
    }

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const row = { line: i + 1, valid: true, errors: [], data: {} }

      h.forEach((col, idx) => {
        row.data[col] = cells[idx] || ''
      })

      // Validaciones
      if (!row.data.nombre) {
        row.valid = false
        row.errors.push('nombre vacío')
      }
      if (!row.data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.data.email)) {
        row.valid = false
        row.errors.push('email inválido')
      }

      rows.value.push(row)
    }
  }

  function reset() {
    raw.value = ''
    headers.value = []
    rows.value = []
    errors.value = []
  }

  return {
    raw,
    headers,
    rows,
    errors,
    validRows,
    invalidRows,
    parse,
    reset,
  }
}
