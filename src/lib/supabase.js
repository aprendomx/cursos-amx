import { createClient } from '@supabase/supabase-js'
import { theme } from '@/lib/theme.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: `sb-${theme.app.storagePrefix}-auth`,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    heartbeatIntervalMs: 30000,
    // Exponential backoff so a transient WebSocket failure doesn't
    // spin in a tight reconnect loop and drag auth refresh down with it.
    reconnectAfterMs: (tries) => Math.min(1000 * 2 ** tries, 30000),
  },
})
