import { supabase } from '@/lib/supabase.js'
import * as tus from 'tus-js-client'

const INGEST_BUCKET = 'video-ingest'
// 6 MB chunks: small enough to pass through Cloudflare Free (100 MB
// per-request limit) and most nginx defaults, large enough to keep
// overhead reasonable for multi-GB uploads.
const CHUNK_SIZE = 6 * 1024 * 1024

export type VideoStatus = 'uploading' | 'pending' | 'processing' | 'ready' | 'failed'

/** Fila de videos (pipeline de ingesta/transcodificación HLS). */
export interface VideoRow {
  id: string
  leccion_id: string | null
  status: VideoStatus
  source_path: string | null
  hls_path: string | null
  poster_path: string | null
  duracion_seg: number | null
  error_msg: string | null
  created_by: string | null
  creado_en: string
  actualizado_en: string
}

/** Respuesta de la Edge Function hls-playlist-url. */
export interface Playback {
  master_url: string
  poster_url: string | null
  duracion_seg: number | null
  expires_in: number
}

export interface UploadVideoOpts {
  /** Fracción 0..1 del progreso de subida. */
  onProgress?: (fraccion: number) => void
}

export async function createVideoRow(leccionId: string): Promise<VideoRow> {
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

export async function uploadVideoFile(
  videoId: string,
  file: File,
  { onProgress }: UploadVideoOpts = {}
): Promise<string> {
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
      fingerprint: () => Promise.resolve(`tus-${videoId}-${file.name}-${file.size}`),
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

export async function markVideoPending(videoId: string, sourcePath: string): Promise<void> {
  const { error } = await supabase
    .from('videos')
    .update({ status: 'pending', source_path: sourcePath })
    .eq('id', videoId)
  if (error) throw error
}

export async function attachVideoToLeccion(leccionId: string, videoId: string): Promise<void> {
  const { error } = await supabase
    .from('lecciones')
    .update({ video_id: videoId, tipo_material: 'video' })
    .eq('id', leccionId)
  if (error) throw error
}

export async function retryVideo(videoId: string): Promise<void> {
  const { error } = await supabase
    .from('videos')
    .update({ status: 'pending', error_msg: null })
    .eq('id', videoId)
  if (error) throw error
}

export async function deleteVideo(videoId: string): Promise<void> {
  const { error } = await supabase.from('videos').delete().eq('id', videoId)
  if (error) throw error
}

export async function fetchVideo(videoId: string): Promise<VideoRow | null> {
  const { data, error } = await supabase.from('videos').select('*').eq('id', videoId).maybeSingle()
  if (error) throw error
  return data
}

export async function getPlayback(videoId: string): Promise<Playback> {
  const { data, error } = await supabase.functions.invoke('hls-playlist-url', {
    body: { video_id: videoId },
  })
  if (error) throw error
  return data
}

// Orchestrator the admin UI calls.
export async function uploadVideoForLeccion(
  leccionId: string,
  file: File,
  { onProgress }: UploadVideoOpts = {}
): Promise<string> {
  const row = await createVideoRow(leccionId)
  const objectName = await uploadVideoFile(row.id, file, { onProgress })
  await markVideoPending(row.id, objectName)
  await attachVideoToLeccion(leccionId, row.id)
  return row.id
}
