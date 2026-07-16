import { ref } from 'vue'
import { sbSelect } from '@/lib/sbRest'

export function useAdminDashboard(getSession) {
  const metrics = ref([
    { label: 'Inscripciones', value: '\u2014', delta: '', up: true },
    { label: 'Lecciones vistas', value: '\u2014', delta: '', up: true },
    { label: 'Constancias', value: '\u2014', delta: '', up: true },
    { label: 'Tasa aprobaci\u00f3n', value: '\u2014', delta: '', up: true },
  ])

  const adminCursos = ref([])
  const barData = ref(new Array(30).fill(0))
  const topCourses = ref([])
  const recentActivity = ref([])

  function relativeTime(iso) {
    if (!iso) return ''
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'Hace unos segundos'
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
    if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  }

  async function loadDashboard() {
    const session = getSession()
    if (!session?.access_token) return
    const accessToken = session.access_token
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

    let inscByCurso = {}
    try {
      const { data: allInsc } = await sbSelect(
        'inscripciones?select=curso_id&limit=10000',
        accessToken
      )
      for (const r of allInsc || []) {
        inscByCurso[r.curso_id] = (inscByCurso[r.curso_id] || 0) + 1
      }
    } catch (err) {
      console.error('Error fetching inscripciones counts:', err)
    }

    try {
      const { data: cursos } = await sbSelect(
        'cursos?select=*,modulos(id,lecciones(id))&order=creado_en.desc',
        accessToken
      )
      adminCursos.value = (cursos || []).map((c) => ({
        ...c,
        inscritos: inscByCurso[c.id] || 0,
        modulos: c.modulos?.length || 0,
        lecciones: (c.modulos || []).reduce((s, m) => s + (m.lecciones?.length || 0), 0),
        slug: c.slug || '',
        imagen: c.imagen_portada || c.titulo,
      }))
    } catch (err) {
      console.error('Error fetching admin courses:', err)
    }

    try {
      const [insc, inscMes, prog, constTot, constMes] = await Promise.all([
        sbSelect('inscripciones?select=id', accessToken, { count: 'exact' }),
        sbSelect(`inscripciones?select=id&inscrito_en=gte.${startOfMonth}`, accessToken, {
          count: 'exact',
        }),
        sbSelect('progreso?select=id&completado=eq.true', accessToken, { count: 'exact' }),
        sbSelect('constancias?select=id', accessToken, { count: 'exact' }),
        sbSelect(`constancias?select=id&emitida_en=gte.${startOfMonth}`, accessToken, {
          count: 'exact',
        }),
      ])
      const totalInsc = insc.count ?? 0
      const totalConst = constTot.count ?? 0
      const tasa = totalInsc > 0 ? ((totalConst / totalInsc) * 100).toFixed(1) + '%' : '\u2014'
      metrics.value = [
        {
          label: 'Inscripciones',
          value: totalInsc.toLocaleString(),
          delta: `+${inscMes.count ?? 0} este mes`,
          up: true,
        },
        {
          label: 'Lecciones vistas',
          value: (prog.count ?? 0).toLocaleString(),
          delta: '',
          up: true,
        },
        {
          label: 'Constancias',
          value: totalConst.toLocaleString(),
          delta: `+${constMes.count ?? 0} este mes`,
          up: true,
        },
        { label: 'Tasa aprobaci\u00f3n', value: tasa, delta: '', up: true },
      ]
    } catch (err) {
      console.error('Error fetching admin metrics:', err)
    }

    try {
      const { data: insc30 } = await sbSelect(
        `inscripciones?select=inscrito_en&inscrito_en=gte.${since30}`,
        accessToken
      )
      const buckets = new Array(30).fill(0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (const r of insc30 || []) {
        const d = new Date(r.inscrito_en)
        d.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((today - d) / 86400000)
        const idx = 29 - diffDays
        if (idx >= 0 && idx < 30) buckets[idx]++
      }
      const max = Math.max(...buckets, 1)
      barData.value = buckets.map((v) => Math.max(4, Math.round((v / max) * 95)))
    } catch (err) {
      console.error('Error fetching bar data:', err)
    }

    try {
      const { data: allInsc } = await sbSelect('inscripciones?select=curso_id', accessToken)
      const counts = {}
      for (const r of allInsc || []) counts[r.curso_id] = (counts[r.curso_id] || 0) + 1
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      if (sorted.length) {
        const ids = sorted.map(([id]) => id).join(',')
        const { data: cursos } = await sbSelect(
          `cursos?select=id,titulo,nivel&id=in.(${ids})`,
          accessToken
        )
        topCourses.value = sorted.map(([id, n]) => {
          const c = (cursos || []).find((x) => x.id === id) || {}
          return { id, titulo: c.titulo || 'Curso', nivel: c.nivel || '\u2014', inscritos: n }
        })
      } else {
        topCourses.value = []
      }
    } catch (err) {
      console.error('Error fetching top courses:', err)
    }

    try {
      const [iRes, cRes, mRes] = await Promise.all([
        sbSelect(
          'inscripciones?select=id,inscrito_en,perfiles(nombres_completos),cursos(titulo)&order=inscrito_en.desc&limit=10',
          accessToken
        ),
        sbSelect(
          'constancias?select=id,emitida_en,folio,perfiles(nombres_completos),cursos(titulo)&order=emitida_en.desc&limit=10',
          accessToken
        ),
        sbSelect(
          'comentarios?select=id,creado_en,perfiles(nombres_completos),lecciones(titulo)&order=creado_en.desc&limit=10',
          accessToken
        ),
      ])
      const items = [
        ...(iRes.data || []).map((r) => ({
          ts: r.inscrito_en,
          text: `${r.perfiles?.nombres_completos || 'Usuario'} se inscribi\u00f3 en "${r.cursos?.titulo || '\u2014'}"`,
        })),
        ...(cRes.data || []).map((r) => ({
          ts: r.emitida_en,
          text: `Se emiti\u00f3 constancia ${r.folio || ''} a ${r.perfiles?.nombres_completos || 'usuario'}`,
        })),
        ...(mRes.data || []).map((r) => ({
          ts: r.creado_en,
          text: `${r.perfiles?.nombres_completos || 'Usuario'} coment\u00f3 en "${r.lecciones?.titulo || '\u2014'}"`,
        })),
      ]
      items.sort((a, b) => new Date(b.ts) - new Date(a.ts))
      recentActivity.value = items.slice(0, 6).map((x) => ({
        time: relativeTime(x.ts),
        text: x.text,
      }))
    } catch (err) {
      console.error('Error fetching recent activity:', err)
    }
  }

  return {
    metrics,
    adminCursos,
    barData,
    topCourses,
    recentActivity,
    loadDashboard,
  }
}
