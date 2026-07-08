-- Migration 053: Entregas, Rúbricas y Calificaciones (Fase K)
-- ============================================================

-- 1. Enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entrega_estado') THEN
    CREATE TYPE entrega_estado AS ENUM ('pendiente', 'entregada', 'calificada', 'devuelta');
  END IF;
END$$;

-- 2. Table: tareas
CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  modulo_id uuid REFERENCES modulos(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  instrucciones jsonb,
  fecha_apertura timestamptz,
  fecha_limite timestamptz,
  maximo_archivos int DEFAULT 5 CHECK (maximo_archivos > 0 AND maximo_archivos <= 10),
  peso_maximo_mb int DEFAULT 10 CHECK (peso_maximo_mb > 0 AND peso_maximo_mb <= 100),
  permitir_retraso boolean DEFAULT false,
  penalizacion_retraso_pct int DEFAULT 0 CHECK (penalizacion_retraso_pct >= 0 AND penalizacion_retraso_pct <= 100),
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now()
);

-- 3. Table: entregas
CREATE TABLE IF NOT EXISTS entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado entrega_estado NOT NULL DEFAULT 'pendiente',
  entregado_en timestamptz,
  calificado_en timestamptz,
  calificado_por uuid REFERENCES auth.users(id),
  puntaje_final numeric(5,2) CHECK (puntaje_final >= 0 AND puntaje_final <= 100),
  comentario_instructor jsonb,
  version_actual int DEFAULT 0,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now(),
  UNIQUE(tarea_id, user_id)
);

-- 4. Table: entrega_versiones
CREATE TABLE IF NOT EXISTS entrega_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  numero_version int NOT NULL,
  texto jsonb,
  archivos text[],
  entregado_en timestamptz DEFAULT now(),
  comentario_alumno text,
  UNIQUE(entrega_id, numero_version)
);

-- 5. Table: rubricas
CREATE TABLE IF NOT EXISTS rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('niveles', 'puntaje_libre')),
  titulo text NOT NULL,
  puntaje_maximo int DEFAULT 100,
  creado_en timestamptz DEFAULT now()
);

-- 6. Table: rubrica_criterios
CREATE TABLE IF NOT EXISTS rubrica_criterios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid NOT NULL REFERENCES rubricas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  orden int NOT NULL,
  peso numeric(3,2) DEFAULT 1.0 CHECK (peso > 0),
  puntaje_maximo int,
  UNIQUE(rubrica_id, orden)
);

-- 7. Table: rubrica_niveles
CREATE TABLE IF NOT EXISTS rubrica_niveles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid NOT NULL REFERENCES rubricas(id) ON DELETE CASCADE,
  etiqueta text NOT NULL,
  puntaje int NOT NULL CHECK (puntaje >= 0),
  orden int NOT NULL,
  UNIQUE(rubrica_id, orden)
);

-- 8. Table: calificaciones
CREATE TABLE IF NOT EXISTS calificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  criterio_id uuid NOT NULL REFERENCES rubrica_criterios(id) ON DELETE CASCADE,
  nivel_id uuid REFERENCES rubrica_niveles(id) ON DELETE SET NULL,
  puntaje numeric(5,2) CHECK (puntaje >= 0),
  comentario text,
  UNIQUE(entrega_id, criterio_id)
);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_entregas_tarea_user ON entregas(tarea_id, user_id);
CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
CREATE INDEX IF NOT EXISTS idx_entrega_versiones_entrega ON entrega_versiones(entrega_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_entrega ON calificaciones(entrega_id);

-- 10. View: v_entregas_pendientes_instructor
CREATE OR REPLACE VIEW v_entregas_pendientes_instructor AS
SELECT
  e.id AS entrega_id,
  e.tarea_id,
  e.user_id,
  e.estado,
  e.entregado_en,
  t.titulo AS tarea_titulo,
  t.curso_id,
  c.titulo AS curso_titulo,
  p.nombres AS alumno_nombres,
  p.apellidos AS alumno_apellidos,
  p.email AS alumno_email
FROM entregas e
JOIN tareas t ON t.id = e.tarea_id
JOIN cursos c ON c.id = t.curso_id
JOIN perfiles p ON p.id = e.user_id
WHERE e.estado = 'entregada';

-- 11. RLS
-- Enable RLS on all tables
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrega_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_niveles ENABLE ROW LEVEL SECURITY;
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;

-- Helper function: is_instructor_of_course(curso_id)
CREATE OR REPLACE FUNCTION is_instructor_of_course(p_curso_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM cursos
    WHERE id = p_curso_id AND instructor_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: is_instructor_of_entrega(entrega_id)
CREATE OR REPLACE FUNCTION is_instructor_of_entrega(p_entrega_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM entregas e
    JOIN tareas t ON t.id = e.tarea_id
    WHERE e.id = p_entrega_id AND t.curso_id IN (
      SELECT id FROM cursos WHERE instructor_id = auth.uid()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- tareas policies
DROP POLICY IF EXISTS tareas_select_public ON tareas;
CREATE POLICY tareas_select_public ON tareas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tareas_insert_instructor ON tareas;
CREATE POLICY tareas_insert_instructor ON tareas
  FOR INSERT TO authenticated WITH CHECK (is_instructor_of_course(curso_id));

DROP POLICY IF EXISTS tareas_update_instructor ON tareas;
CREATE POLICY tareas_update_instructor ON tareas
  FOR UPDATE TO authenticated USING (is_instructor_of_course(curso_id));

DROP POLICY IF EXISTS tareas_delete_instructor ON tareas;
CREATE POLICY tareas_delete_instructor ON tareas
  FOR DELETE TO authenticated USING (is_instructor_of_course(curso_id));

-- entregas policies
DROP POLICY IF EXISTS entregas_select_own_or_instructor ON entregas;
CREATE POLICY entregas_select_own_or_instructor ON entregas
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR is_instructor_of_entrega(id)
  );

DROP POLICY IF EXISTS entregas_insert_own ON entregas;
CREATE POLICY entregas_insert_own ON entregas
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS entregas_update_instructor ON entregas;
CREATE POLICY entregas_update_instructor ON entregas
  FOR UPDATE TO authenticated USING (is_instructor_of_entrega(id));

DROP POLICY IF EXISTS entregas_update_own ON entregas;
CREATE POLICY entregas_update_own ON entregas
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- entrega_versiones policies
DROP POLICY IF EXISTS entrega_versiones_select_own_or_instructor ON entrega_versiones;
CREATE POLICY entrega_versiones_select_own_or_instructor ON entrega_versiones
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = entrega_versiones.entrega_id
      AND (e.user_id = auth.uid() OR is_instructor_of_entrega(e.id))
    )
  );

DROP POLICY IF EXISTS entrega_versiones_insert_own ON entrega_versiones;
CREATE POLICY entrega_versiones_insert_own ON entrega_versiones
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = entrega_versiones.entrega_id
      AND e.user_id = auth.uid()
    )
  );

-- rubricas policies
DROP POLICY IF EXISTS rubricas_select_public ON rubricas;
CREATE POLICY rubricas_select_public ON rubricas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubricas_insert_instructor ON rubricas;
CREATE POLICY rubricas_insert_instructor ON rubricas
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubricas_update_instructor ON rubricas;
CREATE POLICY rubricas_update_instructor ON rubricas
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubricas_delete_instructor ON rubricas;
CREATE POLICY rubricas_delete_instructor ON rubricas
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- rubrica_criterios policies
DROP POLICY IF EXISTS rubrica_criterios_select_public ON rubrica_criterios;
CREATE POLICY rubrica_criterios_select_public ON rubrica_criterios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubrica_criterios_insert_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_insert_instructor ON rubrica_criterios
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_criterios_update_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_update_instructor ON rubrica_criterios
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_criterios_delete_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_delete_instructor ON rubrica_criterios
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- rubrica_niveles policies
DROP POLICY IF EXISTS rubrica_niveles_select_public ON rubrica_niveles;
CREATE POLICY rubrica_niveles_select_public ON rubrica_niveles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubrica_niveles_insert_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_insert_instructor ON rubrica_niveles
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_niveles_update_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_update_instructor ON rubrica_niveles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_niveles_delete_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_delete_instructor ON rubrica_niveles
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- calificaciones policies
DROP POLICY IF EXISTS calificaciones_select_own_or_instructor ON calificaciones;
CREATE POLICY calificaciones_select_own_or_instructor ON calificaciones
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id
      AND (e.user_id = auth.uid() OR is_instructor_of_entrega(e.id))
    )
  );

DROP POLICY IF EXISTS calificaciones_insert_instructor ON calificaciones;
CREATE POLICY calificaciones_insert_instructor ON calificaciones
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id AND is_instructor_of_entrega(e.id)
    )
  );

DROP POLICY IF EXISTS calificaciones_update_instructor ON calificaciones;
CREATE POLICY calificaciones_update_instructor ON calificaciones
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id AND is_instructor_of_entrega(e.id)
    )
  );

-- 12. Trigger: trg_nueva_entrega (notify instructor when student submits)
CREATE OR REPLACE FUNCTION fn_trg_nueva_entrega()
RETURNS trigger AS $$
DECLARE
  v_curso_id uuid;
  v_instructor_id uuid;
  v_curso_titulo text;
  v_tarea_titulo text;
BEGIN
  SELECT t.curso_id, c.titulo, t.titulo
  INTO v_curso_id, v_curso_titulo, v_tarea_titulo
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.tarea_id;

  SELECT instructor_id INTO v_instructor_id
  FROM cursos WHERE id = v_curso_id;

  INSERT INTO notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  VALUES (
    v_instructor_id,
    'nueva_entrega',
    'Nueva entrega recibida',
    format('El alumno ha entregado la tarea "%s" del curso "%s".', v_tarea_titulo, v_curso_titulo),
    jsonb_build_object(
      'entrega_id', NEW.id,
      'tarea_id', NEW.tarea_id,
      'curso_id', (SELECT curso_id FROM tareas WHERE id = NEW.tarea_id),
      'alumno_id', NEW.user_id
    ),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_nueva_entrega ON entregas;
CREATE TRIGGER trg_nueva_entrega
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'pendiente' AND NEW.estado = 'entregada')
  EXECUTE FUNCTION fn_trg_nueva_entrega();

-- 13. Trigger: trg_entrega_calificada (notify student when graded)
CREATE OR REPLACE FUNCTION fn_trg_entrega_calificada()
RETURNS trigger AS $$
DECLARE
  v_tarea_titulo text;
  v_curso_titulo text;
BEGIN
  SELECT t.titulo, c.titulo
  INTO v_tarea_titulo, v_curso_titulo
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.tarea_id;

  INSERT INTO notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  VALUES (
    NEW.user_id,
    'entrega_calificada',
    'Tu entrega ha sido calificada',
    format('La tarea "%s" del curso "%s" ha sido calificada.', v_tarea_titulo, v_curso_titulo),
    jsonb_build_object(
      'entrega_id', NEW.id,
      'tarea_id', NEW.tarea_id,
      'curso_id', (SELECT curso_id FROM tareas WHERE id = NEW.tarea_id),
      'puntaje_final', NEW.puntaje_final
    ),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_entrega_calificada ON entregas;
CREATE TRIGGER trg_entrega_calificada
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'entregada' AND NEW.estado = 'calificada')
  EXECUTE FUNCTION fn_trg_entrega_calificada();
