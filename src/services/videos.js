import { supabase } from '@/lib/supabase.js'
import * as tus from 'tus-js-client'

const INGEST_BUCKET = 'video-ingest'
// 6 MB chunks: small enough to pass through Cloudflare Free (100 MB
// per-request limit) and most nginx defaults, large enough to keep
// overhead reasonable for multi-GB uploads.
const CHUNK_SIZE = 6 * 1024 * 1024

export async function createVideoRow(leccionId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('videos')
    .insert({ leccion_id: leccionId, status: 'uploading', created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uploadVideoFile(videoId, file, { onProgress } = {}) {
  // TUS resumable upload via Supabase Storage. Sends ~6MB chunks so el
  // request stays under proxy limits (Cloudflare Free caps at 100MB
  // per HTTP request body). Automatic retries with exponential backoff
  // si la red parpadea.
  const objectName = `${videoId}.mp4`
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      // Fingerprint forzado al videoId garantiza que cada upload sea
      // único en localStorage: dos uploads del mismo archivo a distintas
      // lecciones no se confunden, y un upload nuevo en la misma pantalla
      // no intenta reanudar el anterior.
      fingerprint: (f) => Promise.resolve(`tus-${videoId}-${f.name}-${f.size}`),
      metadata: {
        bucketName: INGEST_BUCKET,
        objectName: objectName,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600',
      },
      onError: (err) => reject(new Error(`upload failed: ${err.message || err}`)),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress && bytesTotal > 0) onProgress(bytesUploaded / bytesTotal)
      },
      onSuccess: () => resolve(objectName),
    })

    // No buscamos uploads previos: cada videoId es único, así que reanudar
    // siempre apuntaría a una URL caducada. Arranque fresco.
    upload.start()
  })
}

export async function markVideoPending(videoId, sourcePath) {
  const { error } = await supabase
    .from('videos')
    .update({ status: 'pending', source_path: sourcePath })
    .eq('id', videoId)
  if (error) throw error
}

export async function attachVideoToLeccion(leccionId, videoId) {
  const { error } = await supabase
    .from('lecciones')
    .update({ video_id: videoId, tipo_material: 'video' })
    .eq('id', leccionId)
  if (error) throw error
}

export async function retryVideo(videoId) {
  const { error } = await supabase
    .from('videos')
    .update({ status: 'pending', error_msg: null })
    .eq('id', videoId)
  if (error) throw error
}

export async function deleteVideo(videoId) {
  const { error } = await supabase.from('videos').delete().eq('id', videoId)
  if (error) throw error
}

export async function fetchVideo(videoId) {
  const { data, error } = await supabase.from('videos').select('*').eq('id', videoId).maybeSingle()
  if (error) throw error
  return data
}

export async function getPlayback(videoId) {
  const { data, error } = await supabase.functions.invoke('hls-playlist-url', {
    body: { video_id: videoId },
  })
  if (error) throw error
  return data // { master_url, poster_url, duracion_seg, expires_in }
}

// Orchestrator the admin UI calls.
export async function uploadVideoForLeccion(leccionId, file, { onProgress } = {}) {
  const row = await createVideoRow(leccionId)
  const objectName = await uploadVideoFile(row.id, file, { onProgress })
  await markVideoPending(row.id, objectName)
  await attachVideoToLeccion(leccionId, row.id)
  return row.id
}
