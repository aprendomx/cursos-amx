// Persistencia del editor de cursos (AdminCourseEditor): carga desde la BD
// (mapeo filas → modelo del editor) y publicación (diff insert/patch/delete).
import { ref } from 'vue'
import { sbSelect, sbInsert, sbPatch, sbDelete } from '@/lib/sbRest'
import { cargarPreguntasAdmin, guardarEvaluacionAdmin } from '@/services/evaluaciones'
import { parseDuracionToSeg } from '@/lib/duracion.js'
import { createBlankModulo, entregaPayload, isUuid } from '@/composables/useCourseEditorModel.js'

function leccionFromRow(l, mi, li) {
  return {
    id: l.id || `l-${mi + 1}-${li + 1}`,
    titulo: l.titulo || '',
    tipo: l.tipo_material || 'video',
    youtube_url: l.url_youtube || '',
    duracion: l.duracion_seg
      ? `${Math.floor(l.duracion_seg / 60)}:${String(l.duracion_seg % 60).padStart(2, '0')}`
      : '',
    video_id: l.video_id || null,
    documento_path: l.documento_path || null,
    documento_tipo: l.documento_tipo || null,
    fuente:
      l.tipo_material === 'examen'
        ? 'examen'
        : l.documento_path
          ? 'documento'
          : l.video_id
            ? 'hls'
            : l.url_youtube
              ? 'youtube'
              : l.contenido
                ? 'texto'
                : 'ninguno',
    requiere_entrega: l.requiere_entrega === true,
    entrega_tipos_csv: (l.entrega_tipos || ['pdf', 'docx', 'zip', 'png', 'jpg']).join(', '),
    entrega_max_mb: l.entrega_max_mb || 10,
    eval_puntaje_minimo: l.eval_puntaje_minimo ?? 70,
    eval_max_intentos: l.eval_max_intentos ?? 3,
    preguntas: [],
  }
}

function leccionPayload(lec, moduloId, orden) {
  return {
    modulo_id: moduloId,
    orden,
    titulo: lec.titulo,
    tipo_material:
      lec.fuente === 'examen'
        ? 'examen'
        : lec.fuente === 'documento'
          ? 'lectura'
          : lec.tipo || 'video',
    url_youtube: lec.fuente === 'youtube' ? lec.youtube_url || null : null,
    video_id: lec.fuente === 'hls' ? lec.video_id || null : null,
    documento_path: lec.fuente === 'documento' ? lec.documento_path || null : null,
    documento_tipo: lec.fuente === 'documento' ? lec.documento_tipo || null : null,
    duracion_seg: parseDuracionToSeg(lec.duracion),
    eval_puntaje_minimo: lec.fuente === 'examen' ? Number(lec.eval_puntaje_minimo) || 70 : 70,
    eval_max_intentos: lec.fuente === 'examen' ? Number(lec.eval_max_intentos) || 3 : 3,
    ...entregaPayload(lec),
  }
}

/**
 * @param {object} opts
 * @param {import('vue').Ref<object|null>} opts.editingCurso
 * @param {() => object|null} opts.getSession
 * @param {import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>} opts.visualBuilder
 * @param {import('vue').ComputedRef<boolean>} opts.allValid
 * @param {import('vue').ComputedRef<Array>} opts.validationChecks
 * @param {(cursoId: string) => void} opts.onPublished
 */
export function useCursoPersistence({
  editingCurso,
  getSession,
  visualBuilder,
  allValid,
  validationChecks,
  onPublished,
}) {
  const publishing = ref(false)
  const publishStatus = ref(null)
  const creandoBorrador = ref(false)

  /* ── Carga ──────────────────────────────────────── */
  async function loadCurso(curso) {
    publishStatus.value = null
    const session = getSession()
    if (!session?.access_token) {
      publishStatus.value = { type: 'error', text: 'Necesitas iniciar sesión.' }
      return
    }
    try {
      const token = session.access_token
      const { data: rows } = await sbSelect(
        `cursos?select=id,slug,titulo,descripcion,nivel,imagen_portada,publicado,modulos(id,orden,titulo,descripcion,imagen_portada,requiere_previo,lecciones(id,orden,titulo,tipo_material,url_youtube,duracion_seg,video_id,documento_path,documento_tipo,contenido,requiere_entrega,entrega_tipos,entrega_max_mb,eval_puntaje_minimo,eval_max_intentos))&id=eq.${curso.id}`,
        token
      )
      const c = rows?.[0]
      if (!c) {
        publishStatus.value = { type: 'error', text: 'No se encontró el curso en la base.' }
        return
      }
      const modulos = (c.modulos || [])
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((m, mi) => ({
          id: m.id || `m-${mi + 1}`,
          titulo: m.titulo || '',
          descripcion: m.descripcion || '',
          imagen_portada: m.imagen_portada || '',
          requiere_previo: !!m.requiere_previo,
          lecciones: (m.lecciones || [])
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((l, li) => leccionFromRow(l, mi, li)),
        }))

      editingCurso.value = {
        id: c.id,
        slug: c.slug || '',
        titulo: c.titulo || '',
        descripcion: c.descripcion || '',
        nivel: c.nivel || 'Fundamental',
        idioma: 'Español',
        imagen: c.imagen_portada || '',
        publicado: !!c.publicado,
        modulos: modulos.length ? modulos : [createBlankModulo()],
      }
      // Cargar preguntas de las lecciones tipo examen ya guardadas.
      for (const m of editingCurso.value.modulos) {
        for (const lec of m.lecciones) {
          if (lec.fuente === 'examen' && isUuid(lec.id)) {
            try {
              lec.preguntas = await cargarPreguntasAdmin(lec.id)
            } catch (e) {
              console.warn('cargar preguntas:', e)
            }
          }
        }
      }
    } catch (err) {
      console.error('Error cargando curso para editar:', err)
      publishStatus.value = {
        type: 'error',
        text: 'Error al cargar el curso: ' + (err?.message || 'desconocido'),
      }
    }
  }

  /* ── Borrador (constructor visual) ──────────────── */
  async function crearBorrador() {
    const c = editingCurso.value
    creandoBorrador.value = true
    try {
      const data = await sbInsert(
        'cursos',
        {
          slug: c.slug,
          titulo: c.titulo,
          descripcion: c.descripcion,
          nivel: c.nivel,
          imagen_portada: c.imagen || null,
          publicado: false,
        },
        getSession().access_token
      )
      if (!data?.id) throw new Error('No se pudo crear el borrador (posible RLS).')
      c.id = data.id
      publishStatus.value = null
      return true
    } catch (err) {
      publishStatus.value = { type: 'error', text: err?.message || 'Error creando el borrador.' }
      return false
    } finally {
      creandoBorrador.value = false
    }
  }

  /* ── Publicación ────────────────────────────────── */
  async function publishCurso() {
    publishStatus.value = null

    if (!allValid.value) {
      const missing = validationChecks.value.filter((v) => !v.pass).map((v) => v.label)
      publishStatus.value = {
        type: 'error',
        text: 'Faltan datos: ' + missing.join(', '),
      }
      return
    }

    const session = getSession()
    if (!session) {
      publishStatus.value = {
        type: 'error',
        text: 'Necesitas iniciar sesión como administrador para publicar.',
      }
      return
    }

    const c = editingCurso.value
    publishing.value = true
    try {
      const accessToken = session.access_token
      if (!accessToken) throw new Error('No hay access_token en la sesión.')
      const isExisting = isUuid(c.id)

      const cursoPayload = {
        slug: c.slug,
        titulo: c.titulo,
        descripcion: c.descripcion,
        nivel: c.nivel,
        imagen_portada: c.imagen || null,
        publicado: c.publicado,
      }

      // v2: con el constructor visual la estructura ya está persistida — solo metadata.
      if (visualBuilder.value && isUuid(c.id)) {
        const cursoData = await sbPatch('cursos', `id=eq.${c.id}`, cursoPayload, accessToken)
        if (!cursoData?.id) throw new Error('Update curso devolvió vacío (posible RLS).')
        publishStatus.value = { type: 'success', text: 'Curso actualizado exitosamente.' }
        onPublished(cursoData.id)
        return
      }

      let cursoData
      if (isExisting) {
        cursoData = await sbPatch('cursos', `id=eq.${c.id}`, cursoPayload, accessToken)
        if (!cursoData?.id) throw new Error('Update curso devolvió vacío (posible RLS).')
      } else {
        cursoData = await sbInsert('cursos', cursoPayload, accessToken)
        if (!cursoData?.id) throw new Error('Insert curso devolvió vacío (posible RLS).')
      }
      const cursoId = cursoData.id

      const existingByModule = new Map()
      const existingModuleIds = new Set()
      if (isExisting) {
        const { data: existing } = await sbSelect(
          `modulos?curso_id=eq.${cursoId}&select=id,lecciones(id)`,
          accessToken
        )
        for (const m of existing || []) {
          existingModuleIds.add(m.id)
          const lset = new Set()
          for (const l of m.lecciones || []) lset.add(l.id)
          existingByModule.set(m.id, lset)
        }
      }

      const keptModuleIds = new Set()
      const keptLessonsByModule = new Map()

      for (let mi = 0; mi < c.modulos.length; mi++) {
        const mod = c.modulos[mi]
        const modPayload = {
          curso_id: cursoId,
          orden: mi + 1,
          titulo: mod.titulo,
          descripcion: mod.descripcion,
          imagen_portada: mod.imagen_portada || null,
          requiere_previo: mod.requiere_previo,
        }

        let moduloId
        if (isUuid(mod.id) && existingModuleIds.has(mod.id)) {
          await sbPatch('modulos', `id=eq.${mod.id}`, modPayload, accessToken)
          moduloId = mod.id
        } else {
          const modData = await sbInsert('modulos', modPayload, accessToken)
          if (!modData?.id) throw new Error(`Insert modulo ${mi + 1} devolvió vacío.`)
          moduloId = modData.id
          mod.id = moduloId
        }
        keptModuleIds.add(moduloId)

        const existingLessonsHere = existingByModule.get(mod.id) || new Set()
        const keptLessons = []
        const newLessons = []
        const keptLessonIds = new Set()
        for (let li = 0; li < mod.lecciones.length; li++) {
          const lec = mod.lecciones[li]
          if (isUuid(lec.id) && existingLessonsHere.has(lec.id)) {
            keptLessons.push({ lec, li })
            keptLessonIds.add(lec.id)
          } else {
            newLessons.push({ lec, li })
          }
        }
        keptLessonsByModule.set(moduloId, keptLessonIds)

        // Primera pasada: órdenes negativos para evitar colisiones de unique(orden).
        for (const { lec, li } of keptLessons) {
          await sbPatch(
            'lecciones',
            `id=eq.${lec.id}`,
            leccionPayload(lec, moduloId, -(li + 1)),
            accessToken
          )
          if (lec.fuente === 'hls' && lec.video_id) {
            await sbPatch('videos', `id=eq.${lec.video_id}`, { leccion_id: lec.id }, accessToken)
          }
        }

        for (const { lec, li } of newLessons) {
          const newLec = await sbInsert(
            'lecciones',
            leccionPayload(lec, moduloId, li + 1),
            accessToken
          )
          if (newLec?.id) {
            lec.id = newLec.id
            if (lec.fuente === 'hls' && lec.video_id) {
              await sbPatch(
                'videos',
                `id=eq.${lec.video_id}`,
                { leccion_id: newLec.id },
                accessToken
              )
            }
          }
        }

        for (const { lec, li } of keptLessons) {
          await sbPatch('lecciones', `id=eq.${lec.id}`, { orden: li + 1 }, accessToken)
        }
      }

      for (const mod of c.modulos) {
        for (const lec of mod.lecciones) {
          if (lec.fuente === 'examen' && isUuid(lec.id)) {
            await guardarEvaluacionAdmin(lec.id, lec.preguntas || [])
          }
        }
      }

      for (const moduloId of existingModuleIds) {
        if (!keptModuleIds.has(moduloId)) {
          await sbDelete(`modulos?id=eq.${moduloId}`, accessToken)
        }
      }
      for (const [moduloId, keptLessonIds] of keptLessonsByModule) {
        const existingLessons = existingByModule.get(moduloId) || new Set()
        for (const leccionId of existingLessons) {
          if (!keptLessonIds.has(leccionId)) {
            await sbDelete(`lecciones?id=eq.${leccionId}`, accessToken)
          }
        }
      }

      publishStatus.value = {
        type: 'success',
        text: isExisting ? 'Curso actualizado exitosamente.' : 'Curso publicado exitosamente.',
      }
      onPublished(cursoId)
    } catch (err) {
      console.error('Error publishing curso:', err, err?.raw)
      publishStatus.value = {
        type: 'error',
        text: err?.message || 'Error desconocido al publicar.',
      }
    } finally {
      publishing.value = false
    }
  }

  return { publishing, publishStatus, creandoBorrador, loadCurso, crearBorrador, publishCurso }
}
