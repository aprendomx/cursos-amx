import { createRouter, createWebHashHistory } from 'vue-router'
import { setupGuards } from './guards.js'
import LandingPage from '@/pages/LandingPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import RegistroPage from '@/pages/RegistroPage.vue'
import CursoDetalle from '@/pages/CursoDetalle.vue'
import PlayerPage from '@/pages/PlayerPage.vue'
import PerfilPage from '@/pages/PerfilPage.vue'
import ConstanciaPage from '@/pages/ConstanciaPage.vue'
import VerificarPage from '@/pages/VerificarPage.vue'

const routes = [
  { path: '/', name: 'home', component: LandingPage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/registro', name: 'registro', component: RegistroPage },
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
    meta: { requiresAuth: true },
  },
  {
    path: '/instructor',
    name: 'instructor',
    component: () => import('@/pages/InstructorPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/verificar/:folio',
    name: 'verificar',
    component: VerificarPage,
    props: true,
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

setupGuards(router)

export default router
