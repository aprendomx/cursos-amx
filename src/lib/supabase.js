import { createClient } from '@supabase/supabase-js'
import { theme } from '@/lib/theme.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE, y el motivo importa: el enrutador de esta aplicación vive en el
    // FRAGMENTO de la URL (createWebHashHistory), y el flujo implícito de
    // GoTrue devuelve el testigo también en el fragmento
    // (#access_token=…&type=recovery). Los dos reclaman el mismo sitio, así
    // que el enlace de recuperación llegaba con la ruta destrozada.
    //
    // Con PKCE el testigo vuelve en la cadena de CONSULTA y no colisiona:
    //   https://…/?code=abc123#/restablecer
    //                └ consulta  └ ruta
    //
    // Afecta a los tres flujos —acceso, alta y recuperación—, no solo al
    // último. Si alguien revierte esto, se lleva por delante la recuperación
    // de contraseña; antes de tocarlo, ver openspec/specs/acceso/.
    flowType: 'pkce',
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
