export class AppError extends Error {
  code: string
  status: number
  details: any

  constructor(
    message: string,
    { code = 'UNKNOWN', status = 500, details = null }: { code?: string; status?: number; details?: any } = {}
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

export function mapSupabaseError(error: any): AppError {
  const msg = String(error?.message || error || '')
  if (/network|fetch|timeout/i.test(msg)) return new NetworkError(msg, error)
  if (/unauthorized|jwt|auth/i.test(msg)) return new PermissionError('Sesión expirada. Vuelve a iniciar sesión.', error)
  if (/forbidden|rls/i.test(msg)) return new PermissionError(msg, error)
  if (/duplicate|23505/i.test(msg)) return new ValidationError('Registro duplicado.', error)
  if (/not.*found|404/i.test(msg)) return new AppError('No encontrado.', { code: 'NOT_FOUND', status: 404, details: error })
  return new AppError(msg, { code: 'SUPABASE_ERROR', status: error?.status || 500, details: error })
}
