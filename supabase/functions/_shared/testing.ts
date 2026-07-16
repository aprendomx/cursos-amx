// supabase/functions/_shared/testing.ts
// Mocks de cliente supabase para tests de Edge Functions (solo tests).

export interface MockClientOptions {
  /** Usuario devuelto por auth.getUser; null = token inválido. */
  user?: { id: string; email?: string } | null
  /** Fila de `perfiles` para el usuario; null = sin perfil. */
  perfil?: { es_admin?: boolean; es_instructor?: boolean } | null
  /** Filas devueltas por consultas a cada tabla/vista. */
  tables?: Record<string, any[]>
}

export interface MockClient {
  auth: any
  from: (table: string) => any
  /** Inserts capturados por tabla, para asertar en tests. */
  inserts: Record<string, any[]>
  /** Llamadas a .eq() capturadas por tabla, para asertar filtros. */
  eqCalls: Record<string, Array<[string, any]>>
}

function tableBuilder(
  rows: any[],
  onInsert: (payload: any) => void,
  onEq: (column: string, value: any) => void
) {
  const builder: any = {}
  const chain = () => builder
  builder.select = chain
  builder.eq = (column: string, value: any) => {
    onEq(column, value)
    return builder
  }
  builder.gte = chain
  builder.lte = chain
  builder.order = chain
  builder.limit = chain
  builder.single = () =>
    Promise.resolve(
      rows.length > 0
        ? { data: rows[0], error: null }
        : { data: null, error: { message: 'not found' } }
    )
  builder.insert = (payload: any) => {
    onInsert(payload)
    return Promise.resolve({ data: null, error: null })
  }
  builder.delete = chain
  builder.in = () => Promise.resolve({ data: null, error: null })
  // Permite `await` directo sobre la cadena (select().eq()...).
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject)
  return builder
}

export function makeMockClient(options: MockClientOptions = {}): MockClient {
  const { user = null, perfil = null, tables = {} } = options
  const inserts: Record<string, any[]> = {}
  const eqCalls: Record<string, Array<[string, any]>> = {}

  const allTables: Record<string, any[]> = { ...tables }
  if (perfil && user) {
    allTables['perfiles'] = allTables['perfiles'] ?? [perfil]
  }

  return {
    inserts,
    eqCalls,
    auth: {
      getUser: (_jwt: string) =>
        Promise.resolve(
          user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } }
        ),
      admin: {
        createUser: (args: any) =>
          Promise.resolve({
            data: { user: { id: `created-${args.email}`, email: args.email } },
            error: null,
          }),
      },
    },
    from(table: string) {
      inserts[table] = inserts[table] ?? []
      eqCalls[table] = eqCalls[table] ?? []
      return tableBuilder(
        allTables[table] ?? [],
        (payload) => inserts[table].push(payload),
        (column, value) => eqCalls[table].push([column, value])
      )
    },
  }
}

export function makeRequest(
  body: unknown,
  { jwt }: { jwt?: string } = {}
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`
  return new Request('http://localhost/functions/v1/test', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}
