import { supabase } from '@/lib/supabase.js'
import * as tus from 'tus-js-client'

const BUCKET = 'lesson-docs'
const CHUNK = 6 * 1024 * 1024
const MAX_SIZE = 50 * 1024 * 1024
const ALLOWED = {
  'application/pdf': 'pdf',
  'image/png': 'imagen',
  'image/jpeg': 'imagen',
  'image/webp': 'imagen',
}

export async function uploadDocumento(leccionId, file, { onProgress } = {}) {
  if (!ALLOWED[file.type]) {
    throw new Error(`Tipo no soportado: ${file.type}. Solo PDF, PNG, JPEG o WebP.`)
  }
  if (file.size > MAX_SIZE) {
    throw new Error(
      `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 50 MB.`
    )
  }
  const docTipo = ALLOWED[file.type]
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const objectName = `${leccionId}/${crypto.randomUUID()}.${ext}`

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK,
      // Fingerprint forzado al objectName (UUID único por subida) para
      // que dos uploads consecutivos del mismo archivo o de la misma
      // lección no se confundan en localStorage.
      fingerprint: (f) => Promise.resolve(`tus-${objectName}-${f.name}-${f.size}`),
      metadata: {
        bucketName: BUCKET,
        objectName: objectName,
        contentType: file.type,
        cacheControl: '3600',
      },
      onError: (err) => reject(new Error(`upload failed: ${err.message || err}`)),
      onProgress: (b, t) => {
        if (onProgress && t > 0) onProgress(b / t)
      },
      onSuccess: resolve,
    })
    // Arranque fresco: cada objectName es único, reanudar siempre
    // apuntaría a una URL caducada.
    upload.start()
  })

  const { error } = await supabase
    .from('lecciones')
    .update({
      documento_path: objectName,
      documento_tipo: docTipo,
      tipo_material: 'lectura',
    })
    .eq('id', leccionId)
  if (error) throw error

  return { path: objectName, tipo: docTipo }
}

export async function deleteDocumento(leccionId) {
  const { error } = await supabase
    .from('lecciones')
    .update({ documento_path: null, documento_tipo: null })
    .eq('id', leccionId)
  if (error) throw error
}

export async function getDocumentoUrl(leccionId) {
  const { data, error } = await supabase.functions.invoke('documento-url', {
    body: { leccion_id: leccionId },
  })
  if (error) throw error
  return data
}
