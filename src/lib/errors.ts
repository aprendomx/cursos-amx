export class AppError extends Error {
  code: string
  status: number
  details: any

  constructor(
    message: string,
    {
      code = 'UNKNOWN',
      status = 500,
      details = null,
    }: { code?: string; status?: number; details?: any } = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Error de conexión', details = null) {
    super(message, { code: 'NETWORK_ERROR', status: 0, details })
    this.name = 'NetworkError'
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Permisos insuficientes', details = null) {
    super(message, { code: 'PERMISSION_DENIED', status: 403, details })
    this.name = 'PermissionError'
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', details = null) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details })
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Demasiadas peticiones. Intenta de nuevo en un minuto.', details = null) {
    super(message, { code: 'RATE_LIMITED', status: 429, details })
    this.name = 'RateLimitError'
  }
}

export class ModuloApagadoError extends AppError {
  constructor(message = 'Este módulo está desactivado en esta instalación.', details = null) {
    super(message, { code: 'FEATURE_DISABLED', status: 403, details })
    this.name = 'ModuloApagadoError'
  }
}

export function mapSupabaseError(error: any): AppError {
  const msg = String(error?.message || error || '')
  const code = String(error?.code || '')

  // Códigos SQLSTATE que producen las migraciones de este repositorio. Sin
  // este mapeo, al usuario le llega el texto crudo de Postgres.
  if (code === '53400' || /demasiadas verificaciones|too many requests/i.test(msg)) {
    return new RateLimitError(undefined, error)
  }
  if (/no estás inscrito/i.test(msg)) {
    return new PermissionError('No estás inscrito en este curso.', error)
  }
  if (/sin intentos restantes/i.test(msg)) {
    return new ValidationError('Ya usaste todos tus intentos en esta evaluación.', error)
  }
  if (/no se puede completar un video sin haberlo visto|video no visto/i.test(msg)) {
    return new ValidationError(
      'Necesitas ver el video completo antes de marcar la lección como terminada.',
      error
    )
  }
  if (/una evaluación (solo se completa|se completa) aprobándola/i.test(msg)) {
    return new ValidationError('Esta lección se completa aprobando su evaluación.', error)
  }
  if (/no autorizado para modificar es_admin/i.test(msg)) {
    return new PermissionError('No puedes cambiar tu propio rol.', error)
  }
  // Una política RESTRICTIVA de módulo apagado se manifiesta como violación de
  // RLS sin más contexto; el mensaje genérico de permisos confundiría.
  if (code === '42501' && /row-level security|violates/i.test(msg)) {
    return new ModuloApagadoError(undefined, error)
  }
  if (/network|fetch|timeout/i.test(msg)) return new NetworkError(msg, error)
  if (/unauthorized|jwt|auth/i.test(msg))
    return new PermissionError('Sesión expirada. Vuelve a iniciar sesión.', error)
  if (/forbidden|rls/i.test(msg)) return new PermissionError(msg, error)
  if (/duplicate|23505/i.test(msg)) return new ValidationError('Registro duplicado.', error)
  if (/not.*found|404/i.test(msg))
    return new AppError('No encontrado.', { code: 'NOT_FOUND', status: 404, details: error })
  return new AppError(msg, { code: 'SUPABASE_ERROR', status: error?.status || 500, details: error })
}
