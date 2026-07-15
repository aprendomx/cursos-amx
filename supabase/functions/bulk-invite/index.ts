// supabase/functions/bulk-invite/index.ts
// Entrypoint: la lógica vive en handler.ts para poder testearla sin
// ejecutar Deno.serve al importar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler(() =>
    createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
  )
)
