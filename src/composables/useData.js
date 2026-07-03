import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase.js'
import * as services from '@/services/index.js'
import * as mock from '@/data.js'

const isSupabaseReady = ref(false)
const supabaseChecked = ref(false)

async function checkSupabase() {
  if (supabaseChecked.value) return isSupabaseReady.value
  supabaseChecked.value = true
  try {
    const { error } = await supabase.from('cursos').select('id').limit(1)
    isSupabaseReady.value = !error
  } catch {
    isSupabaseReady.value = false
  }
  return isSupabaseReady.value
}

/**
 * Composable principal de datos.
 * Si Supabase está configurado y accesible, usa datos reales.
 * Si no, usa datos mock para desarrollo/demo.
 */
export function useData() {
  const cursos = ref([])
  const modulosCurso = ref([])
  const leccionesModulo = ref([])
  const dependencias = ref([])
  const user = ref(null)
  const loading = ref(false)
  const usingMock = ref(true)

  async function loadCursos() {
    loading.value = true
    const ready = await checkSupabase()
    if (ready) {
      try {
        cursos.value = await services.fetchCursos()
        usingMock.value = false
        loading.value = false
        return
      } catch {
        /* fallback */
      }
    }
    cursos.value = mock.CURSOS
    usingMock.value = true
    loading.value = false
  }

  async function loadModulos(cursoId) {
    loading.value = true
    const ready = await checkSupabase()
    if (ready) {
      try {
        modulosCurso.value = await services.fetchModulos(cursoId)
        loading.value = false
        return
      } catch {
        /* fallback */
      }
    }
    modulosCurso.value = mock.MODULOS_CURSO
    loading.value = false
  }

  async function loadLecciones(moduloId) {
    loading.value = true
    const ready = await checkSupabase()
    if (ready) {
      try {
        leccionesModulo.value = await services.fetchLecciones(moduloId)
        loading.value = false
        return
      } catch {
        /* fallback */
      }
    }
    leccionesModulo.value = mock.LECCIONES_MODULO
    loading.value = false
  }

  async function loadDependencias() {
    const ready = await checkSupabase()
    if (ready) {
      try {
        const deps = await services.fetchDependencias()
        dependencias.value = deps.map((d) => d.nombre)
        return
      } catch {
        /* fallback */
      }
    }
    dependencias.value = mock.DEPENDENCIAS
  }

  async function loadUser() {
    const ready = await checkSupabase()
    if (ready) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session) {
          const { data } = await supabase
            .from('perfiles')
            .select('*, dependencias(nombre)')
            .eq('id', session.user.id)
            .single()
          if (data) {
            user.value = {
              nombre: data.nombres,
              apellidos: `${data.apellido_paterno} ${data.apellido_materno || ''}`.trim(),
              correo: data.correo,
              telefono: data.telefono_movil,
              dependencia: data.dependencias?.nombre || '',
              iniciales: (data.nombres?.[0] || '') + (data.apellido_paterno?.[0] || ''),
              es_admin: data.es_admin,
            }
            return
          }
        }
      } catch {
        /* fallback */
      }
    }
    user.value = mock.USER
  }

  return {
    cursos,
    modulosCurso,
    leccionesModulo,
    dependencias,
    user,
    loading,
    usingMock,
    isSupabaseReady,
    loadCursos,
    loadModulos,
    loadLecciones,
    loadDependencias,
    loadUser,
  }
}
