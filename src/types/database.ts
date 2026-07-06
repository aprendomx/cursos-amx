export interface Dependencia {
  id: number
  nombre: string
  siglas?: string
  tipo?: 'federal' | 'estatal' | 'municipal' | 'autonomo' | 'otro'
  activa?: boolean
  creado_en?: string
}

export interface Perfil {
  id: string
  nombres: string
  apellido_paterno: string
  apellido_materno?: string
  nombres_completos?: string
  correo: string
  telefono_movil?: string
  dependencia_id?: number
  cargo?: string
  es_admin?: boolean
  es_instructor?: boolean
  aviso_privacidad?: boolean
  creado_en?: string
  actualizado_en?: string
  dependencias?: Dependencia
}

export interface Curso {
  id: string
  slug: string
  titulo: string
  descripcion?: string
  imagen_portada?: string
  nivel?: 'Fundamental' | 'Intermedio' | 'Avanzado'
  duracion_min?: number
  publicado?: boolean
  creado_en?: string
}

export interface Modulo {
  id: string
  curso_id: string
  orden: number
  titulo: string
  descripcion?: string
  requiere_previo?: boolean
  imagen?: string
  lecciones?: Leccion[]
}

export type TipoMaterial = 'video' | 'lectura' | 'examen' | 'recurso'

export interface Leccion {
  id: string
  modulo_id: string
  orden: number
  titulo: string
  url_youtube?: string
  tipo_material: TipoMaterial
  duracion_seg?: number
  video_id?: string
  documento_path?: string
  documento_tipo?: string
  contenido?: Record<string, unknown>
  requiere_entrega?: boolean
  entrega_tipos?: string[]
  entrega_max_mb?: number
  modulos?: { titulo: string; orden: number; curso_id: string }
}

export interface Inscripcion {
  id: string
  user_id: string
  curso_id: string
  inscrito_en?: string
}

export interface Progreso {
  id: string
  user_id: string
  leccion_id: string
  completado?: boolean
  completado_en?: string
  segundos_vistos?: number
}

export interface Comentario {
  id: string
  user_id: string
  leccion_id: string
  contenido: string
  destacado?: boolean
  creado_en?: string
  perfiles?: {
    nombres?: string
    apellido_paterno?: string
    dependencias?: { siglas?: string }
  }
}

export interface Constancia {
  id: string
  user_id: string
  curso_id: string
  folio: string
  emitida_en?: string
  hash_verif?: string
}

export type Database = {
  public: {
    Tables: {
      dependencias: { Row: Dependencia }
      perfiles: { Row: Perfil }
      cursos: { Row: Curso }
      modulos: { Row: Modulo }
      lecciones: { Row: Leccion }
      inscripciones: { Row: Inscripcion }
      progreso: { Row: Progreso }
      comentarios: { Row: Comentario }
      constancias: { Row: Constancia }
    }
  }
}
