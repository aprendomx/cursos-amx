import { supabase } from '@/lib/supabase.js'

/**
 * Invita usuarios masivamente vía Edge Function.
 * @param {Array<{email: string, nombres: string, apellido_paterno: string, apellido_materno?: string, telefono?: string, dependencia_id?: string, cargo?: string}>} users
 */
export async function bulkInviteUsers(users) {
  const { data, error } = await supabase.functions.invoke('bulk-invite', {
    body: { users },
  })
  if (error) throw error
  return data
}
