-- =========================================================
-- Migration 055: grabaciones y transcripciones de sesiones
-- =========================================================
--  * sesiones_grabaciones: metadatos de grabaciones Zoom
--    (almacenadas en Supabase Storage, URL referenciada aquí)
--  * sesiones_transcripciones: texto completo + segmentos
--    con índice GIN para full-text search en español
-- =========================================================

-- ---------- 1. Grabaciones ----------
CREATE TABLE IF NOT EXISTS public.sesiones_grabaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  url_grabacion   text NOT NULL,
  duracion_segundos int,
  tamano_mb       numeric(10,2),
  estado          text DEFAULT 'procesando' CHECK (estado IN ('procesando', 'lista', 'error')),
  creado_en       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grabaciones_sesion ON public.sesiones_grabaciones(sesion_id);

-- ---------- 2. Transcripciones ----------
CREATE TABLE IF NOT EXISTS public.sesiones_transcripciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  grabacion_id    uuid REFERENCES public.sesiones_grabaciones(id) ON DELETE SET NULL,
  texto_completo  text NOT NULL DEFAULT '',
  idioma          text DEFAULT 'es',
  segmentos       jsonb,
  costo_usd       numeric(10,4),
  estado          text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completada', 'error')),
  creado_en       timestamptz DEFAULT now(),
  UNIQUE(sesion_id)
);

CREATE INDEX IF NOT EXISTS idx_transcripciones_sesion ON public.sesiones_transcripciones(sesion_id);
CREATE INDEX IF NOT EXISTS idx_transcripciones_fts ON public.sesiones_transcripciones USING gin(to_tsvector('spanish', texto_completo));

-- ---------- 3. RLS ----------
ALTER TABLE public.sesiones_grabaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_transcripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grabaciones: inscrito leer" ON public.sesiones_grabaciones;
CREATE POLICY "grabaciones: inscrito leer"
  ON public.sesiones_grabaciones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.inscripciones i ON sv.curso_id = i.curso_id
      WHERE sv.id = sesiones_grabaciones.sesion_id AND i.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.cursos c ON sv.curso_id = c.id
      WHERE sv.id = sesiones_grabaciones.sesion_id AND c.instructor_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true)
  );

DROP POLICY IF EXISTS "transcripciones: inscrito leer" ON public.sesiones_transcripciones;
CREATE POLICY "transcripciones: inscrito leer"
  ON public.sesiones_transcripciones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.inscripciones i ON sv.curso_id = i.curso_id
      WHERE sv.id = sesiones_transcripciones.sesion_id AND i.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.cursos c ON sv.curso_id = c.id
      WHERE sv.id = sesiones_transcripciones.sesion_id AND c.instructor_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true)
  );

-- ---------- 4. Función RPC búsqueda full-text ----------
CREATE OR REPLACE FUNCTION public.buscar_transcripciones(p_query text)
RETURNS TABLE (
  sesion_id uuid,
  titulo text,
  snippet text,
  rank real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.sesion_id,
    sv.titulo,
    ts_headline('spanish', t.texto_completo, plainto_tsquery('spanish', p_query), 'MaxFragments=1,MaxWords=20,MinWords=5') AS snippet,
    ts_rank(to_tsvector('spanish', t.texto_completo), plainto_tsquery('spanish', p_query))::real AS rank
  FROM public.sesiones_transcripciones t
  JOIN public.sesiones_virtuales sv ON t.sesion_id = sv.id
  WHERE to_tsvector('spanish', t.texto_completo) @@ plainto_tsquery('spanish', p_query)
    AND t.estado = 'completada'
  ORDER BY rank DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_transcripciones(text) TO authenticated;
