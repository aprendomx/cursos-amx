-- =========================================================
-- Migration 054: sesiones virtuales unificadas — calendario,
-- RSVP, Zoom / Jitsi dual, notificaciones
-- =========================================================
-- ADAPTA la tabla existente (migración 026) sin perder datos.
--  * Añade campos nuevos: modulo_id, descripcion, fin, plataforma,
--    zoom_meeting_id, zoom_join_url
--  * Conserva columnas legacy: programada_en, instructor_id,
--    jitsi_room_id, estado, grabacion_url, iniciada_en, terminada_en
--  * Nuevas tablas: sesiones_rsvp, zoom_configuracion
--  * Vista unificada: v_calendario_curso
--  * Trigger: notificar_nueva_sesion
-- =========================================================

-- ---------- 1. Tipos enumerados ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_plataforma') THEN
    CREATE TYPE tipo_plataforma AS ENUM ('jitsi', 'zoom');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_rsvp') THEN
    CREATE TYPE estado_rsvp AS ENUM ('confirmado', 'cancelado', 'asistio', 'no_asistio');
  END IF;
END$$;

-- ---------- 2. ALTER sesiones_virtuales existente ----------
ALTER TABLE public.sesiones_virtuales
  ADD COLUMN IF NOT EXISTS modulo_id      uuid REFERENCES public.modulos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descripcion    text,
  ADD COLUMN IF NOT EXISTS fin            timestamptz,
  ADD COLUMN IF NOT EXISTS plataforma     tipo_plataforma DEFAULT 'jitsi',
  ADD COLUMN IF NOT EXISTS zoom_meeting_id  text,
  ADD COLUMN IF NOT EXISTS zoom_join_url    text;

-- Backfill: sesiones existentes sin plataforma explícita son Jitsi
UPDATE public.sesiones_virtuales
  SET plataforma = 'jitsi'
  WHERE plataforma IS NULL;

-- Índice adicional para consultas por curso + inicio
CREATE INDEX IF NOT EXISTS idx_sesiones_curso_inicio
  ON public.sesiones_virtuales(curso_id, programada_en);

-- ---------- 3. Tabla RSVP ----------
CREATE TABLE IF NOT EXISTS public.sesiones_rsvp (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado        estado_rsvp NOT NULL DEFAULT 'confirmado',
  confirmado_en timestamptz DEFAULT now(),
  asistio_en    timestamptz,
  UNIQUE(sesion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_rsvp_sesion ON public.sesiones_rsvp(sesion_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_rsvp_user   ON public.sesiones_rsvp(user_id);

-- ---------- 4. Tabla Zoom Configuración ----------
CREATE TABLE IF NOT EXISTS public.zoom_configuracion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL,
  client_secret text NOT NULL,
  account_id    text NOT NULL,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  creado_en     timestamptz DEFAULT now()
);

-- ---------- 5. Vista v_calendario_curso ----------
CREATE OR REPLACE VIEW public.v_calendario_curso AS
SELECT 'sesion' AS tipo,
       sv.id,
       sv.titulo,
       sv.programada_en AS fecha,
       sv.fin,
       sv.curso_id,
       sv.plataforma::text AS extra
FROM public.sesiones_virtuales sv
UNION ALL
SELECT 'tarea_deadline' AS tipo,
       t.id,
       t.titulo,
       t.fecha_limite AS fecha,
       NULL AS fin,
       t.curso_id,
       NULL AS extra
FROM public.tareas t
WHERE t.fecha_limite IS NOT NULL
UNION ALL
SELECT 'curso_fecha' AS tipo,
       c.id,
       c.titulo,
       c.fecha_inicio AS fecha,
       c.fecha_fin AS fin,
       c.id AS curso_id,
       NULL AS extra
FROM public.cursos c
WHERE c.fecha_inicio IS NOT NULL
UNION ALL
SELECT 'anuncio' AS tipo,
       a.id,
       a.titulo,
       a.creado_en AS fecha,
       NULL AS fin,
       a.curso_id,
       NULL AS extra
FROM public.anuncios a;

-- ---------- 6. RLS sesiones_rsvp ----------
ALTER TABLE public.sesiones_rsvp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rsvp: leer" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: leer"
  ON public.sesiones_rsvp FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.cursos c ON sv.curso_id = c.id
      WHERE sv.id = sesiones_rsvp.sesion_id
        AND c.instructor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "rsvp: insertar propio" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: insertar propio"
  ON public.sesiones_rsvp FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rsvp: actualizar propio" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: actualizar propio"
  ON public.sesiones_rsvp FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ---------- 7. RLS zoom_configuracion (solo admin) ----------
ALTER TABLE public.zoom_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zoomcfg: admin leer" ON public.zoom_configuracion;
CREATE POLICY "zoomcfg: admin leer"
  ON public.zoom_configuracion FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true));

DROP POLICY IF EXISTS "zoomcfg: admin actualizar" ON public.zoom_configuracion;
CREATE POLICY "zoomcfg: admin actualizar"
  ON public.zoom_configuracion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true));

-- ---------- 8. Trigger notificación nueva sesión ----------
CREATE OR REPLACE FUNCTION public.notificar_nueva_sesion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  SELECT i.user_id,
         'nueva_sesion',
         'Nueva sesión programada',
         format('Se programó "%s" para el %s',
                NEW.titulo,
                to_char(NEW.programada_en, 'DD/MM/YYYY HH24:MI')),
         jsonb_build_object('sesion_id', NEW.id, 'curso_id', NEW.curso_id),
         false
  FROM public.inscripciones i
  WHERE i.curso_id = NEW.curso_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nueva_sesion ON public.sesiones_virtuales;
CREATE TRIGGER trg_nueva_sesion
  AFTER INSERT ON public.sesiones_virtuales
  FOR EACH ROW EXECUTE FUNCTION public.notificar_nueva_sesion();

-- ---------- 9. Actualizar RLS de sesiones_virtuales (mantener existentes + añadir admin) ----------
-- Las políticas de la migración 026 ya existen; no las tocamos para no romper
-- la app en producción.  El campo 'plataforma' y 'zoom_meeting_id' heredan
-- las mismas reglas de visibilidad porque están en la misma tabla.

-- ---------- 10. Realtime para RSVP ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones_rsvp;
