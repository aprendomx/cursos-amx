import { supabase } from '@/lib/supabase.js'

export async function fetchDependencias() {
  const { data, error } = await supabase
    .from('dependencias')
    .select('*')
    .eq('activa', true)
    .order('nombre')
  if (error) throw error
  return data
}
