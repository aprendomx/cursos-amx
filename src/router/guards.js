import { supabase } from '@/lib/supabase.js'

export function setupGuards(router) {
  router.beforeEach(async (to, from, next) => {
    if (to.meta.requiresAuth) {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        return next({ path: '/login', query: { redirect: to.fullPath } })
      }
    }
    next()
  })
}
