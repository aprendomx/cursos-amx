<script setup>
import { onMounted, watch } from 'vue'
import AdminDashboard from '@/components/AdminDashboard.vue'
import AdminCourseList from '@/components/AdminCourseList.vue'
import AdminUserManager from '@/components/AdminUserManager.vue'
import AdminInstructorManager from '@/components/AdminInstructorManager.vue'
import AdminConstancias from '@/components/AdminConstancias.vue'
import AdminReportes from '@/components/AdminReportes.vue'
import AdminConfig from '@/components/AdminConfig.vue'
import AdminRubricaManager from '@/components/AdminRubricaManager.vue'
import AdminCohortManager from '@/components/AdminCohortManager.vue'
import AdminBadgeManager from '@/components/AdminBadgeManager.vue'
import AnalyticsDashboard from '@/components/AnalyticsDashboard.vue'
import { useAdminNavigation } from '@/composables/useAdminNavigation.js'
import { useAdminDashboard } from '@/composables/useAdminDashboard.js'

const props = defineProps({
  session: { type: Object, default: null },
})

const {
  activeSection,
  editingCurso,
  sidebarHidden,
  toggleSidebar,
  navItems,
  setSection,
  editCurso,
  onCoursePublished,
} = useAdminNavigation()

const { metrics, adminCursos, barData, topCourses, recentActivity, loadDashboard } =
  useAdminDashboard(() => props.session)

onMounted(loadDashboard)
watch(
  () => props.session?.access_token,
  (newToken, oldToken) => {
    if (newToken && !oldToken) loadDashboard()
  }
)

function handlePublished() {
  onCoursePublished()
  loadDashboard()
}

function handleDeleted(curso) {
  adminCursos.value = adminCursos.value.filter((c) => c.id !== curso.id)
}
</script>

<template>
  <div class="admin-layout" :class="{ 'sidebar-hidden': sidebarHidden }">
    <aside v-show="!sidebarHidden" id="admin-sidebar" class="admin-sidebar">
      <div class="admin-sidebar-header">
        <p class="eyebrow" :style="{ color: 'var(--brand-accent)' }">Panel admin</p>
        <h2 class="display" :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }">
          Operaci&oacute;n
        </h2>
      </div>
      <nav class="admin-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="admin-nav-btn"
          :class="{ active: activeSection === item.key && !item.primary, primary: item.primary }"
          @click="setSection(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </aside>

    <main class="admin-main">
      <button
        type="button"
        class="admin-sidebar-toggle"
        :aria-expanded="!sidebarHidden"
        aria-controls="admin-sidebar"
        :aria-label="sidebarHidden ? 'Mostrar men\u00fa' : 'Ocultar men\u00fa'"
        :title="sidebarHidden ? 'Mostrar men\u00fa' : 'Ocultar men\u00fa'"
        @click="toggleSidebar"
      >
        ☰
      </button>

      <AdminDashboard
        v-if="activeSection === 'resumen'"
        :metrics="metrics"
        :bar-data="barData"
        :top-courses="topCourses"
        :recent-activity="recentActivity"
        @create-course="setSection('nuevo')"
      />

      <AdminCourseList
        v-else-if="activeSection === 'cursos'"
        :cursos="adminCursos"
        :session="session"
        :editing-curso="editingCurso"
        @create="setSection('nuevo')"
        @edit="editCurso"
        @cancel="editingCurso = null"
        @deleted="handleDeleted"
        @published="handlePublished"
      />

      <AdminUserManager v-else-if="activeSection === 'usuarios'" :session="session" />

      <AdminInstructorManager v-else-if="activeSection === 'instructores'" />

      <AdminConstancias v-else-if="activeSection === 'constancias'" :metrics="metrics" />

      <AdminReportes v-else-if="activeSection === 'reportes'" :session="session" />

      <AdminConfig v-else-if="activeSection === 'config'" />

      <AdminRubricaManager v-else-if="activeSection === 'rubricas'" />

      <AdminCohortManager v-else-if="activeSection === 'cohortes'" />

      <AdminBadgeManager v-else-if="activeSection === 'gamificacion'" />

      <AnalyticsDashboard v-else-if="activeSection === 'analytics'" />
    </main>
  </div>
</template>
