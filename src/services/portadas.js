// src/services/portadas.js
// Upload de portada de curso al bucket público `curso-portadas`.
import { supabase } from '@/lib/supabase.js'

const BUCKET = 'curso-portadas'
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Sube un archivo al bucket de portadas y devuelve la URL pública.
 *
 * @param {File} file  archivo seleccionado por el admin
 * @param {(progress:number)=>void} [onProgress]  callback 0..1
 * @returns {Promise<{ path:string, publicUrl:string }>}
 */
export async function uploadPortada(file, onProgress) {
  if (!file) throw new Error('Selecciona un archivo.')
  if (!ALLOWED.includes(file.type)) {
    throw new Error(`Tipo no soportado: ${file.type}. Solo PNG, JPEG o WebP.`)
  }
  if (file.size > MAX_SIZE) {
    throw new Error(
      `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 10 MB.`
    )
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const objectName = `${crypto.randomUUID()}.${ext}`

  // XHR para obtener progreso (supabase-js no expone progreso nativo).
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Sin sesión activa.')

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectName}`
    xhr.open('POST', url, true)
    xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.setRequestHeader('cache-control', '31536000')
    xhr.setRequestHeader('content-type', file.type)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload ${xhr.status}: ${xhr.responseText}`))
    }
    xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'))
    xhr.send(file)
  })

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectName)
  return { path: objectName, publicUrl: pub.publicUrl }
}

/**
 * Borra una portada por su path. No lanza si ya no existe.
 */
export async function deletePortada(path) {
  if (!path) return
  // Si nos llega URL pública completa, extraer el object name.
  const objectName = path.includes('/curso-portadas/') ? path.split('/curso-portadas/').pop() : path
  await supabase.storage.from(BUCKET).remove([objectName])
}
