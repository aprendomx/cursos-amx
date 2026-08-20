// Valida el contenido sembrado por supabase/migrations/056_curso_tutorial.sql.
//
// El curso tutorial vive como JSON de Tiptap dentro de un archivo SQL, así que
// ningún type-check ni lint lo cubre: un JSON mal cerrado o un nodo fuera de la
// whitelist de EXTENSIONES_TEXTO solo se notaría al abrir la lección en el
// reproductor, ya en producción. Este test cierra ese hueco.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateHTML } from '@tiptap/core'
import { EXTENSIONES_TEXTO } from '@/components/LessonRichTextEditor.vue'

const SQL = readFileSync(
  resolve(__dirname, '../../supabase/migrations/056_curso_tutorial.sql'),
  'utf8'
)
// Sin los comentarios de cabecera, que sí mencionan los tipos que NO se usan.
const SQL_EJECUTABLE = SQL.split('\n')
  .filter((linea) => !linea.trimStart().startsWith('--'))
  .join('\n')

const LECCIONES_ESPERADAS = 26
const MODULOS_ESPERADOS = 8

function bloquesContenido() {
  return [...SQL.matchAll(/\$j\$([\s\S]*?)\$j\$/g)].map((m) => m[1])
}

describe('migración 056: curso tutorial', () => {
  it('siembra el número esperado de módulos y lecciones', () => {
    const modulos = SQL.match(/'b0000007-[0-9a-f]{4}-4000-8000-000000000001'/g) || []
    const lecciones = SQL.match(/'c0000007-[0-9a-f]{4}-4000-8000-000000000001'/g) || []
    expect(new Set(modulos).size).toBe(MODULOS_ESPERADOS)
    expect(new Set(lecciones).size).toBe(LECCIONES_ESPERADAS)
  })

  it('no siembra lecciones tipo examen', () => {
    // El panel de evaluación está detrás de VITE_FEATURE_EVALUACIONES, apagado
    // por default: una lección 'examen' sería imposible de completar en una
    // instalación limpia y bloquearía la constancia del curso.
    expect(SQL_EJECUTABLE).not.toMatch(/'examen'/)
    const tipos = SQL_EJECUTABLE.match(/'lectura'/g) || []
    expect(tipos).toHaveLength(LECCIONES_ESPERADAS)
  })

  it('cada lección trae contenido Tiptap parseable', () => {
    const bloques = bloquesContenido()
    expect(bloques).toHaveLength(LECCIONES_ESPERADAS)
    for (const [i, raw] of bloques.entries()) {
      const doc = JSON.parse(raw)
      expect(doc.type, `bloque ${i + 1}`).toBe('doc')
      expect(doc.content.length, `bloque ${i + 1}`).toBeGreaterThan(0)
    }
  })

  it('todo el contenido renderiza con la whitelist del reproductor', () => {
    for (const [i, raw] of bloquesContenido().entries()) {
      const html = generateHTML(JSON.parse(raw), EXTENSIONES_TEXTO)
      // generateHTML devuelve '' o markup vacío si un nodo no está en la
      // whitelist; exigimos texto real para detectarlo.
      expect(html.length, `bloque ${i + 1}`).toBeGreaterThan(200)
      expect(html, `bloque ${i + 1}`).toContain('<p>')
    }
  })

  it('la duración declarada del curso coincide con la suma de sus lecciones', () => {
    const segundos = [...SQL.matchAll(/'lectura', (\d+), \$j\$/g)].map((m) => Number(m[1]))
    expect(segundos).toHaveLength(LECCIONES_ESPERADAS)
    const total = segundos.reduce((a, b) => a + b, 0)
    const declarada = Number(SQL.match(/^\s{2}(\d+),\s*$/m)[1])
    expect(declarada).toBe(Math.round(total / 60))
  })
})
