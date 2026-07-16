// supabase/functions/_shared/auth.ts
// Autenticación y autorización para Edge Functions que usan service_role.
// El runtime self-hosted no soporta verify_jwt por función (FUNCTIONS_VERIFY_JWT
// es global y está en false), así que cada función protegida valida aquí el JWT
// del header Authorization y resuelve los roles del perfil en la BD.

import { corsHeaders } from './cors.ts'

export interface Roles {
  es_admin: boolean
  es_instructor: boolean
}

export interface AuthResult {
  ok: boolean
  status?: number
  error?: string
  user?: { id: string; email?: string }
  roles?: Roles
}

export interface AuthOptions {
  /** Roles aceptados. Vacío o ausente = basta con estar autenticado. */
  anyOf?: Array<'admin' | 'instructor'>
}

export function extractBearer(header: string | null): string | null {
  if (!header) return null
  const token = header.replace(/^Bearer\s+/i, '').trim()
  return token || null
}

/**
 * Autentica al llamador con su JWT y verifica roles contra `perfiles`.
 * `client` debe ser un cliente supabase con service_role (inyectable en tests).
 */
export async function authorize(
  req: Request,
  client: any,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const jwt = extractBearer(req.headers.get('authorization'))
  if (!jwt) return { ok: false, status: 401, error: 'unauthorized' }

  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data?.user) return { ok: false, status: 401, error: 'unauthorized' }
  const user = { id: data.user.id, email: data.user.email }

  const { data: perfil, error: perfilErr } = await client
    .from('perfiles')
    .select('es_admin, es_instructor')
    .eq('id', user.id)
    .single()
  if (perfilErr || !perfil) return { ok: false, status: 403, error: 'forbidden', user }

  const roles: Roles = {
    es_admin: perfil.es_admin === true,
    es_instructor: perfil.es_instructor === true,
  }

  const required = options.anyOf ?? []
  if (required.length > 0) {
    const allowed =
      (required.includes('admin') && roles.es_admin) ||
      (required.includes('instructor') && roles.es_instructor)
    if (!allowed) return { ok: false, status: 403, error: 'forbidden', user, roles }
  }

  return { ok: true, user, roles }
}

export function authErrorResponse(auth: AuthResult): Response {
  return new Response(JSON.stringify({ error: auth.error ?? 'unauthorized' }), {
    status: auth.status ?? 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
