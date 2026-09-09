// supabase/functions/_shared/leccionAbierta.test.ts
// Ejecutar: deno test --allow-all supabase/functions/_shared/leccionAbierta.test.ts
//
// La regla que decide qué ve un visitante sin sesión: la primera lección de
// un curso publicado, y nada más. Los casos son los de la tarea 4.2 del
// change portada-cursos-primero: primera lección de curso publicado pasa;
// lección posterior, curso sin publicar y petición sin lección rechazan.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { esJwtDeUsuario, esPrimeraLeccionAbierta } from './leccionAbierta.ts'

interface Fila {
  id: string
  orden: number
  modulos: { orden: number; curso_id: string; cursos: { id: string; publicado: boolean } }
}

// El mock genérico de testing.ts no filtra por eq(); este fake sí, porque la
// regla consulta `lecciones` dos veces con filtros distintos (por id y por
// curso) y la diferencia es justo lo que se prueba.
function fakeAdmin(filas: Fila[]) {
  return {
    from(_tabla: string) {
      return {
        select(_columnas: string) {
          return {
            eq(columna: string, valor: string) {
              const matched =
                columna === 'id'
                  ? filas.filter((f) => f.id === valor)
                  : filas.filter((f) => f.modulos.curso_id === valor)
              const lista = { data: matched, error: null }
              return {
                then(res?: (v: typeof lista) => unknown, rej?: (e: unknown) => unknown) {
                  return Promise.resolve(lista).then(res, rej)
                },
                single: () =>
                  Promise.resolve(
                    matched.length
                      ? { data: matched[0], error: null }
                      : { data: null, error: { message: 'not found' } }
                  ),
                limit: (_n: number) => Promise.resolve(lista),
              }
            },
          }
        },
      }
    },
  }
}

function curso(publicado: boolean) {
  return { id: 'curso-1', publicado }
}

// Curso con dos módulos y dos lecciones por módulo. La primera del curso es
// l-11 (módulo 1, lección 1); l-21 tiene orden 1 pero en el módulo 2.
function filasCurso(publicado: boolean): Fila[] {
  return [
    { id: 'l-11', orden: 1, modulos: { orden: 1, curso_id: 'curso-1', cursos: curso(publicado) } },
    { id: 'l-12', orden: 2, modulos: { orden: 1, curso_id: 'curso-1', cursos: curso(publicado) } },
    { id: 'l-21', orden: 1, modulos: { orden: 2, curso_id: 'curso-1', cursos: curso(publicado) } },
    { id: 'l-22', orden: 2, modulos: { orden: 2, curso_id: 'curso-1', cursos: curso(publicado) } },
  ]
}

Deno.test('la primera lección de un curso publicado pasa', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), 'l-11'), true)
})

Deno.test('una lección posterior del mismo módulo rechaza', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), 'l-12'), false)
})

Deno.test('la primera lección de un módulo posterior rechaza', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), 'l-21'), false)
})

Deno.test('la primera lección de un curso SIN publicar rechaza', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(false)), 'l-11'), false)
})

Deno.test('una lección inexistente rechaza', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), 'no-existe'), false)
})

Deno.test('una petición sin lección rechaza', async () => {
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), null), false)
  assertEquals(await esPrimeraLeccionAbierta(fakeAdmin(filasCurso(true)), ''), false)
})

Deno.test('un error de consulta rechaza (cerrado por defecto)', async () => {
  const roto = {
    from() {
      throw new Error('base caída')
    },
  }
  assertEquals(await esPrimeraLeccionAbierta(roto, 'l-11'), false)
})

function jwtConRol(rol: string): string {
  return `x.${btoa(JSON.stringify({ role: rol }))}.y`
}

Deno.test('esJwtDeUsuario distingue sesión real de anon key', () => {
  assertEquals(esJwtDeUsuario(jwtConRol('authenticated')), true)
  assertEquals(esJwtDeUsuario(jwtConRol('anon')), false)
  assertEquals(esJwtDeUsuario(jwtConRol('service_role')), false)
  assertEquals(esJwtDeUsuario('basura-sin-formato'), false)
  assertEquals(esJwtDeUsuario(''), false)
  assertEquals(esJwtDeUsuario(null), false)
})
