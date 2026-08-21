import { createRouter, createWebHashHistory } from 'vue-router'
import { setupGuards } from './guards.js'

// Solo la landing va estática: es la primera pantalla y no debe esperar a un
// chunk aparte. Todo lo demás se carga bajo demanda.
//
// Antes, 8 de las 10 rutas eran import estático, así que quien solo miraba el
// catálogo descargaba el reproductor, el generador de PDF, el lector de QR y
// el editor de texto enriquecido. Ver el desglose de chunks en vite.config.js.
import LandingPage from '@/pages/LandingPage.vue'

const LoginPage = () => import('@/pages/LoginPage.vue')
const RegistroPage = () => import('@/pages/RegistroPage.vue')
const RecuperarPage = () => import('@/pages/RecuperarPage.vue')
const RestablecerPage = () => import('@/pages/RestablecerPage.vue')
const CursoDetalle = () => import('@/pages/CursoDetalle.vue')
const PlayerPage = () => import('@/pages/PlayerPage.vue')
const PerfilPage = () => import('@/pages/PerfilPage.vue')
const ConstanciaPage = () => import('@/pages/ConstanciaPage.vue')
const VerificarPage = () => import('@/pages/VerificarPage.vue')
const DocumentoPage = () => import('@/pages/DocumentoPage.vue')

const routes = [
  { path: '/', name: 'home', component: LandingPage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/registro', name: 'registro', component: RegistroPage },
  // Pública a propósito: quien no puede entrar es justo quien la necesita.
  { path: '/recuperar', name: 'recuperar', component: RecuperarPage },
  { path: '/restablecer', name: 'restablecer', component: RestablecerPage },
  {
    path: '/curso/:id',
    name: 'curso',
    component: CursoDetalle,
    props: (route) => ({ cursoId: route.params.id, anchor: route.query.anchor || null }),
  },
  {
    path: '/player/:cursoId/:leccionId?',
    name: 'player',
    component: PlayerPage,
    props: true,
    meta: { requiresAuth: true },
  },
  { path: '/perfil', name: 'perfil', component: PerfilPage, meta: { requiresAuth: true } },
  {
    path: '/constancia/:cursoId',
    name: 'constancia',
    component: ConstanciaPage,
    props: true,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/pages/AdminPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/instructor',
    name: 'instructor',
    component: () => import('@/pages/InstructorPage.vue'),
    meta: { requiresAuth: true, requiresInstructor: true },
  },
  {
    path: '/verificar/:folio',
    name: 'verificar',
    component: VerificarPage,
    props: true,
  },
  // Documentos institucionales. Públicos y sin sesión a propósito: quien
  // todavía no se registra necesita leer el aviso antes de aceptarlo.
  {
    path: '/aviso-privacidad',
    name: 'aviso-privacidad',
    component: DocumentoPage,
    props: { slug: 'aviso-privacidad' },
  },
  {
    path: '/terminos-uso',
    name: 'terminos-uso',
    component: DocumentoPage,
    props: { slug: 'terminos-uso' },
  },
  {
    path: '/contacto',
    name: 'contacto',
    component: DocumentoPage,
    props: { slug: 'contacto' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})
// El enlace del correo de recuperación llega como `/?token_hash=…&type=recovery`,
// sin fragmento: el testigo va en la cadena de consulta justamente para no
// pelearse con el enrutador, que vive en el fragmento. Sin este desvío, la
// aplicación arrancaría en la portada con el testigo colgando de la URL.
//
// Va aquí y no en main.js: `createWebHashHistory()` captura la ubicación al
// importarse, y como los imports se elevan, cualquier ajuste hecho en main.js
// corre DESPUÉS y el enrutador lo pisa al normalizar. Comprobado.
router.beforeEach((to) => {
  if (to.name === 'restablecer') return true
  const consulta = new URLSearchParams(window.location.search)
  if (consulta.get('type') === 'recovery' && consulta.get('token_hash')) {
    return { name: 'restablecer' }
  }
  return true
})

setupGuards(router)

export default router
