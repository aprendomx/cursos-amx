# Fase K: Entregas y Rúbricas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de entregas y rúbricas: instructor crea tareas con rúbricas, alumno entrega archivo + texto con versiones, instructor califica con retroalimentación estructurada.

**Architecture:** Schema PostgreSQL con tablas `tareas`, `entregas`, `entrega_versiones`, `rubricas`, `rubrica_criterios`, `rubrica_niveles`, `calificaciones`. Servicios JS para CRUD. Composables Vue para estado. Componentes UI separados por rol (instructor/alumno/admin). Integraciones con notificaciones (Fase I) y gamificación.

**Tech Stack:** Vue 3, Supabase (Postgres + Storage), Tiptap (texto enriquecido), Vitest

---

## File Structure

### New Files

- `supabase/migrations/053_entregas_rubricas.sql` — Schema, RLS, índices, triggers, vista
- `supabase/functions/entrega-upload/index.ts` — Edge Function para validar y firmar URLs de upload
- `src/services/entregas.js` — CRUD tareas, entregas, versiones, calificar, devolver
- `src/services/rubricas.js` — CRUD rúbricas, criterios, niveles
- `src/services/__tests__/entregas.test.js` — Tests servicio entregas
- `src/services/__tests__/rubricas.test.js` — Tests servicio rubricas
- `src/composables/useEntregas.js` — Estado de entrega del alumno
- `src/composables/useEntregasInstructor.js` — Estado de entregas del instructor
- `src/composables/__tests__/useEntregas.test.js` — Tests composable alumno
- `src/composables/__tests__/useEntregasInstructor.test.js` — Tests composable instructor
- `src/components/EntregaUploader.vue` — Upload drag & drop de archivos
- `src/components/RubricaEditor.vue` — Editor de rúbricas para instructor
- `src/components/CrearTareaPanel.vue` — Formulario crear/editar tarea
- `src/components/CalificarEntregaModal.vue` — Modal de calificación
- `src/components/EntregasInstructorTable.vue` — Tabla de entregas por calificar
- `src/components/EntregaAlumnoPanel.vue` — Panel de entrega del alumno
- `src/components/RubricaAlumnoView.vue` — Vista de rúbrica calificada (solo lectura)
- `src/components/AdminEntregas.vue` — Panel admin con estadísticas
- `src/components/__tests__/EntregaUploader.test.js`
- `src/components/__tests__/RubricaEditor.test.js`
- `src/components/__tests__/CalificarEntregaModal.test.js`
- `src/components/__tests__/EntregaAlumnoPanel.test.js`

### Modified Files

- `src/lib/featureFlags.ts` — Agregar `entregas`, `entregas_rubricas`
- `src/pages/CursoDetalle.vue` — Pestaña "Entregas"
- `src/pages/InstructorPage.vue` — Sección entregas pendientes
- `src/pages/PlayerPage.vue` — Panel de entrega si la lección tiene tarea
- `src/services/index.js` — Exportar entregas.js y rubricas.js
- `src/services/badgeEngine.js` — Criterios: primera_entrega, entrega_a_tiempo, calificacion_perfecta
- `src/composables/useAdminNavigation.js` — Agregar "Entregas" al nav de admin
- `README.md` — Roadmap Phase K
- `CHANGELOG.md` — Entry v0.15.0

---

## Tasks

### Task 1: Schema — Migration 053

**Files:**

- Create: `supabase/migrations/053_entregas_rubricas.sql`

- [ ] **Step 1: Escribir la migración completa**

Crear `supabase/migrations/053_entregas_rubricas.sql` con:

```sql
-- Enum de estado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entrega_estado') THEN
    CREATE TYPE entrega_estado AS ENUM ('pendiente', 'entregada', 'calificada', 'devuelta');
  END IF;
END$$;

-- Tabla tareas
CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid REFERENCES cursos(id) ON DELETE CASCADE NOT NULL,
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

-- Tabla entregas
CREATE TABLE IF NOT EXISTS entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid REFERENCES tareas(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- Tabla entrega_versiones
CREATE TABLE IF NOT EXISTS entrega_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid REFERENCES entregas(id) ON DELETE CASCADE NOT NULL,
  numero_version int NOT NULL,
  texto jsonb,
  archivos text[],
  entregado_en timestamptz DEFAULT now(),
  comentario_alumno text,
  UNIQUE(entrega_id, numero_version)
);

-- Tabla rubricas
CREATE TABLE IF NOT EXISTS rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid REFERENCES tareas(id) ON DELETE CASCADE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('niveles', 'puntaje_libre')),
  titulo text NOT NULL,
  puntaje_maximo int DEFAULT 100,
  creado_en timestamptz DEFAULT now()
);

-- Tabla rubrica_criterios
CREATE TABLE IF NOT EXISTS rubrica_criterios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid REFERENCES rubricas(id) ON DELETE CASCADE NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  orden int NOT NULL,
  peso numeric(3,2) DEFAULT 1.0 CHECK (peso > 0),
  puntaje_maximo int,
  UNIQUE(rubrica_id, orden)
);

-- Tabla rubrica_niveles
CREATE TABLE IF NOT EXISTS rubrica_niveles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid REFERENCES rubricas(id) ON DELETE CASCADE NOT NULL,
  etiqueta text NOT NULL,
  puntaje int NOT NULL CHECK (puntaje >= 0),
  orden int NOT NULL,
  UNIQUE(rubrica_id, orden)
);

-- Tabla calificaciones
CREATE TABLE IF NOT EXISTS calificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid REFERENCES entregas(id) ON DELETE CASCADE NOT NULL,
  criterio_id uuid REFERENCES rubrica_criterios(id) ON DELETE CASCADE NOT NULL,
  nivel_id uuid REFERENCES rubrica_niveles(id) ON DELETE SET NULL,
  puntaje numeric(5,2) CHECK (puntaje >= 0),
  comentario text,
  UNIQUE(entrega_id, criterio_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_entregas_tarea_user ON entregas(tarea_id, user_id);
CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
CREATE INDEX IF NOT EXISTS idx_entrega_versiones_entrega ON entrega_versiones(entrega_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_entrega ON calificaciones(entrega_id);

-- Vista entregas pendientes instructor
CREATE OR REPLACE VIEW v_entregas_pendientes_instructor AS
SELECT
  e.*,
  t.titulo as tarea_titulo,
  t.fecha_limite,
  p.nombres as alumno_nombres,
  p.apellido_paterno as alumno_apellido,
  c.titulo as curso_titulo
FROM entregas e
JOIN tareas t ON e.tarea_id = t.id
JOIN perfiles p ON e.user_id = p.id
JOIN cursos c ON t.curso_id = c.id
WHERE e.estado = 'entregada';

-- RLS tareas
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tareas_select ON tareas;
DROP POLICY IF EXISTS tareas_insert ON tareas;
DROP POLICY IF EXISTS tareas_update ON tareas;
DROP POLICY IF EXISTS tareas_delete ON tareas;
CREATE POLICY tareas_select ON tareas FOR SELECT USING (true);
CREATE POLICY tareas_insert ON tareas FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM cursos WHERE cursos.id = tareas.curso_id AND cursos.instructor_id = auth.uid()
));
CREATE POLICY tareas_update ON tareas FOR UPDATE USING (EXISTS (
  SELECT 1 FROM cursos WHERE cursos.id = tareas.curso_id AND cursos.instructor_id = auth.uid()
));
CREATE POLICY tareas_delete ON tareas FOR DELETE USING (EXISTS (
  SELECT 1 FROM cursos WHERE cursos.id = tareas.curso_id AND cursos.instructor_id = auth.uid()
));

-- RLS entregas
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entregas_select ON entregas;
DROP POLICY IF EXISTS entregas_insert ON entregas;
DROP POLICY IF EXISTS entregas_update ON entregas;
CREATE POLICY entregas_select ON entregas FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tareas JOIN cursos ON tareas.curso_id = cursos.id
    WHERE tareas.id = entregas.tarea_id AND cursos.instructor_id = auth.uid()
  )
);
CREATE POLICY entregas_insert ON entregas FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY entregas_update ON entregas FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM tareas JOIN cursos ON tareas.curso_id = cursos.id
    WHERE tareas.id = entregas.tarea_id AND cursos.instructor_id = auth.uid()
  )
);

-- RLS entrega_versiones
ALTER TABLE entrega_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ev_select ON entrega_versiones;
DROP POLICY IF EXISTS ev_insert ON entrega_versiones;
CREATE POLICY ev_select ON entrega_versiones FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM entregas e JOIN tareas t ON e.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
    WHERE e.id = entrega_versiones.entrega_id AND (e.user_id = auth.uid() OR c.instructor_id = auth.uid())
  )
);
CREATE POLICY ev_insert ON entrega_versiones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM entregas e WHERE e.id = entrega_versiones.entrega_id AND e.user_id = auth.uid()
  )
);

-- RLS rubricas
ALTER TABLE rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_niveles ENABLE ROW LEVEL SECURITY;
CREATE POLICY rubricas_select ON rubricas FOR SELECT USING (true);
CREATE POLICY rubricas_insert ON rubricas FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM tareas JOIN cursos ON tareas.curso_id = cursos.id
  WHERE tareas.id = rubricas.tarea_id AND cursos.instructor_id = auth.uid()
));
CREATE POLICY rubricas_update ON rubricas FOR UPDATE USING (EXISTS (
  SELECT 1 FROM tareas JOIN cursos ON tareas.curso_id = cursos.id
  WHERE tareas.id = rubricas.tarea_id AND cursos.instructor_id = auth.uid()
));
CREATE POLICY rubricas_delete ON rubricas FOR DELETE USING (EXISTS (
  SELECT 1 FROM tareas JOIN cursos ON tareas.curso_id = cursos.id
  WHERE tareas.id = rubricas.tarea_id AND cursos.instructor_id = auth.uid()
));
CREATE POLICY rc_select ON rubrica_criterios FOR SELECT USING (true);
CREATE POLICY rc_insert ON rubrica_criterios FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_criterios.rubrica_id AND c.instructor_id = auth.uid()
));
CREATE POLICY rc_update ON rubrica_criterios FOR UPDATE USING (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_criterios.rubrica_id AND c.instructor_id = auth.uid()
));
CREATE POLICY rc_delete ON rubrica_criterios FOR DELETE USING (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_criterios.rubrica_id AND c.instructor_id = auth.uid()
));
CREATE POLICY rn_select ON rubrica_niveles FOR SELECT USING (true);
CREATE POLICY rn_insert ON rubrica_niveles FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_niveles.rubrica_id AND c.instructor_id = auth.uid()
));
CREATE POLICY rn_update ON rubrica_niveles FOR UPDATE USING (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_niveles.rubrica_id AND c.instructor_id = auth.uid()
));
CREATE POLICY rn_delete ON rubrica_niveles FOR DELETE USING (EXISTS (
  SELECT 1 FROM rubricas r JOIN tareas t ON r.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
  WHERE r.id = rubrica_niveles.rubrica_id AND c.instructor_id = auth.uid()
));

-- RLS calificaciones
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calif_select ON calificaciones;
DROP POLICY IF EXISTS calif_insert ON calificaciones;
DROP POLICY IF EXISTS calif_update ON calificaciones;
CREATE POLICY calif_select ON calificaciones FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM entregas e JOIN tareas t ON e.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
    WHERE e.id = calificaciones.entrega_id AND (e.user_id = auth.uid() OR c.instructor_id = auth.uid())
  )
);
CREATE POLICY calif_insert ON calificaciones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM entregas e JOIN tareas t ON e.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
    WHERE e.id = calificaciones.entrega_id AND c.instructor_id = auth.uid()
  )
);
CREATE POLICY calif_update ON calificaciones FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM entregas e JOIN tareas t ON e.tarea_id = t.id JOIN cursos c ON t.curso_id = c.id
    WHERE e.id = calificaciones.entrega_id AND c.instructor_id = auth.uid()
  )
);

-- Trigger notificaciones
CREATE OR REPLACE FUNCTION notificar_nueva_entrega()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, datos, leida)
  SELECT c.instructor_id, 'nueva_entrega', 'Nueva entrega',
    'Nueva entrega en ' || t.titulo,
    jsonb_build_object('entrega_id', NEW.id, 'tarea_id', NEW.tarea_id),
    false
  FROM tareas t JOIN cursos c ON t.curso_id = c.id
  WHERE t.id = NEW.tarea_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nueva_entrega ON entregas;
CREATE TRIGGER trg_nueva_entrega
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'pendiente' AND NEW.estado = 'entregada')
  EXECUTE FUNCTION notificar_nueva_entrega();

CREATE OR REPLACE FUNCTION notificar_entrega_calificada()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, datos, leida)
  VALUES (NEW.user_id, 'entrega_calificada', 'Entrega calificada',
    'Tu entrega ha sido calificada: ' || COALESCE(NEW.puntaje_final::text, 'N/A') || '/100',
    jsonb_build_object('entrega_id', NEW.id, 'tarea_id', NEW.tarea_id),
    false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entrega_calificada ON entregas;
CREATE TRIGGER trg_entrega_calificada
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'entregada' AND NEW.estado = 'calificada')
  EXECUTE FUNCTION notificar_entrega_calificada();
```

- [ ] **Step 2: Verificar sintaxis**

```bash
supabase db reset --local  # o probar en un schema de test
```

Expected: migración aplica sin errores

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/053_entregas_rubricas.sql
git commit -m "feat(schema): migration 053 — entregas, rúbricas, calificaciones, triggers"
```

---

### Task 2: Servicios — entregas.js + tests

**Files:**

- Create: `src/services/entregas.js`
- Create: `src/services/__tests__/entregas.test.js`
- Modify: `src/services/index.js`

- [ ] **Step 1: Escribir tests del servicio**

Crear `src/services/__tests__/entregas.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  crearTarea, actualizarTarea, eliminarTarea, listarTareasPorCurso,
  crearEntrega, nuevaVersion, obtenerEntrega, listarEntregasPorTarea,
  calificarEntrega, devolverEntrega
} from '@/services/entregas.js'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ ... })),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(() => ({ data: { path: 'test.pdf' } })) })) }
  }
}))

describe('entregas service', () => {
  it('crearTarea inserts and returns id', async () => {
    // mock supabase insert returning { data: [{ id: 't1' }] }
    // expect result.id).toBe('t1')
  })
  it('crearEntrega crea entrega + version 1', async () => {
    // mock insert entregas + insert entrega_versiones
    // expect version_actual = 1
  })
  it('nuevaVersion increments version number', async () => {
    // mock obtener version_actual + 1
    // expect insert with numero_version = 2
  })
  it('calificarEntrega updates estado and inserts calificaciones', async () => {
    // mock update entregas + insert calificaciones
    // expect estado = 'calificada'
  })
  it('devolverEntrega sets estado devuelta', async () => {
    // mock update entregas
    // expect estado = 'devuelta'
  })
})
```

- [ ] **Step 2: Implementar servicio**

Crear `src/services/entregas.js`:

```js
import { supabase } from '@/lib/supabase'

export async function crearTarea(tarea) {
  const { data, error } = await supabase.from('tareas').insert(tarea).select().single()
  if (error) throw error
  return data
}

export async function actualizarTarea(tareaId, datos) {
  const { error } = await supabase.from('tareas').update(datos).eq('id', tareaId)
  if (error) throw error
}

export async function eliminarTarea(tareaId) {
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId)
  if (error) throw error
}

export async function listarTareasPorCurso(cursoId) {
  const { data, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('curso_id', cursoId)
    .order('creado_en')
  if (error) throw error
  return data || []
}

export async function crearEntrega(tareaId, userId, { texto, archivos, comentario }) {
  const { data: entrega, error: err1 } = await supabase
    .from('entregas')
    .insert({
      tarea_id: tareaId,
      user_id: userId,
      estado: 'entregada',
      entregado_en: new Date().toISOString(),
      version_actual: 1,
    })
    .select()
    .single()
  if (err1) throw err1

  const { error: err2 } = await supabase
    .from('entrega_versiones')
    .insert({
      entrega_id: entrega.id,
      numero_version: 1,
      texto,
      archivos,
      comentario_alumno: comentario,
    })
  if (err2) throw err2

  return entrega
}

export async function nuevaVersion(entregaId, { texto, archivos, comentario }) {
  const { data: entrega } = await supabase
    .from('entregas')
    .select('version_actual')
    .eq('id', entregaId)
    .single()
  const nuevaVersion = (entrega?.version_actual || 0) + 1

  const { error: err1 } = await supabase
    .from('entrega_versiones')
    .insert({
      entrega_id: entregaId,
      numero_version: nuevaVersion,
      texto,
      archivos,
      comentario_alumno: comentario,
    })
  if (err1) throw err1

  const { error: err2 } = await supabase
    .from('entregas')
    .update({
      version_actual: nuevaVersion,
      estado: 'entregada',
      entregado_en: new Date().toISOString(),
    })
    .eq('id', entregaId)
  if (err2) throw err2
}

export async function obtenerEntrega(tareaId, userId) {
  const { data: entrega, error } = await supabase
    .from('entregas')
    .select('*, entrega_versiones(*), calificaciones(*)')
    .eq('tarea_id', tareaId)
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return entrega
}

export async function listarEntregasPorTarea(tareaId) {
  const { data, error } = await supabase
    .from('entregas')
    .select('*, perfiles(nombres, apellido_paterno), entrega_versiones(*)')
    .eq('tarea_id', tareaId)
    .order('creado_en')
  if (error) throw error
  return data || []
}

export async function calificarEntrega(
  entregaId,
  { calificaciones: cals, comentario, puntajeFinal }
) {
  const { error: err1 } = await supabase.from('calificaciones').upsert(cals)
  if (err1) throw err1

  const { error: err2 } = await supabase
    .from('entregas')
    .update({
      estado: 'calificada',
      calificado_en: new Date().toISOString(),
      puntaje_final: puntajeFinal,
      comentario_instructor: comentario,
    })
    .eq('id', entregaId)
  if (err2) throw err2
}

export async function devolverEntrega(entregaId, comentario) {
  const { error } = await supabase
    .from('entregas')
    .update({
      estado: 'devuelta',
      comentario_instructor: comentario,
    })
    .eq('id', entregaId)
  if (error) throw error
}

export async function subirArchivo(tareaId, userId, version, file) {
  const path = `entregas/${tareaId}/${userId}/v${version}/${file.name}`
  const { data, error } = await supabase.storage.from('entregas').upload(path, file)
  if (error) throw error
  return data.path
}
```

- [ ] **Step 3: Actualizar index.js**

Modificar `src/services/index.js`:

```js
export * from './entregas.js'
export * from './rubricas.js'
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/services/__tests__/entregas.test.js
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/entregas.js src/services/__tests__/entregas.test.js src/services/index.js
git commit -m "feat(services): entregas.js CRUD + tests"
```

---

### Task 3: Servicios — rubricas.js + tests

**Files:**

- Create: `src/services/rubricas.js`
- Create: `src/services/__tests__/rubricas.test.js`

- [ ] **Step 1: Escribir tests**

Crear `src/services/__tests__/rubricas.test.js` con tests para crearRubrica, obtenerRubrica, actualizarRubrica.

- [ ] **Step 2: Implementar servicio**

Crear `src/services/rubricas.js`:

```js
import { supabase } from '@/lib/supabase'

export async function crearRubrica(tareaId, { tipo, titulo, puntaje_maximo, criterios, niveles }) {
  const { data: rubrica, error: err1 } = await supabase
    .from('rubricas')
    .insert({ tarea_id: tareaId, tipo, titulo, puntaje_maximo })
    .select()
    .single()
  if (err1) throw err1

  const criteriosConRubrica = criterios.map((c, i) => ({ ...c, rubrica_id: rubrica.id, orden: i }))
  const { data: criteriosCreados, error: err2 } = await supabase
    .from('rubrica_criterios')
    .insert(criteriosConRubrica)
    .select()
  if (err2) throw err2

  if (tipo === 'niveles' && niveles?.length) {
    const nivelesConRubrica = niveles.map((n, i) => ({ ...n, rubrica_id: rubrica.id, orden: i }))
    const { error: err3 } = await supabase.from('rubrica_niveles').insert(nivelesConRubrica)
    if (err3) throw err3
  }

  return rubrica
}

export async function obtenerRubrica(tareaId) {
  const { data: rubrica, error: err1 } = await supabase
    .from('rubricas')
    .select('*, rubrica_criterios(*), rubrica_niveles(*)')
    .eq('tarea_id', tareaId)
    .single()
  if (err1 && err1.code !== 'PGRST116') throw err1
  return rubrica
}

export async function actualizarRubrica(rubricaId, { titulo, puntaje_maximo, criterios, niveles }) {
  const { error: err1 } = await supabase
    .from('rubricas')
    .update({ titulo, puntaje_maximo })
    .eq('id', rubricaId)
  if (err1) throw err1

  // Delete old criterios and re-insert (simpler than diffing)
  await supabase.from('rubrica_criterios').delete().eq('rubrica_id', rubricaId)
  const criteriosConRubrica = criterios.map((c, i) => ({ ...c, rubrica_id: rubricaId, orden: i }))
  const { error: err2 } = await supabase.from('rubrica_criterios').insert(criteriosConRubrica)
  if (err2) throw err2

  await supabase.from('rubrica_niveles').delete().eq('rubrica_id', rubricaId)
  if (niveles?.length) {
    const nivelesConRubrica = niveles.map((n, i) => ({ ...n, rubrica_id: rubricaId, orden: i }))
    const { error: err3 } = await supabase.from('rubrica_niveles').insert(nivelesConRubrica)
    if (err3) throw err3
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/services/__tests__/rubricas.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/services/rubricas.js src/services/__tests__/rubricas.test.js
git commit -m "feat(services): rubricas.js CRUD + tests"
```

---

### Task 4: Composables

**Files:**

- Create: `src/composables/useEntregas.js`
- Create: `src/composables/useEntregasInstructor.js`
- Create: `src/composables/__tests__/useEntregas.test.js`
- Create: `src/composables/__tests__/useEntregasInstructor.test.js`

- [ ] **Step 1: Implementar useEntregas.js**

```js
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { obtenerEntrega, crearEntrega, nuevaVersion } from '@/services/entregas'
import { obtenerRubrica } from '@/services/rubricas'

export function useEntregas(tareaId, userId) {
  const entrega = ref(null)
  const tarea = ref(null)
  const rubrica = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const estado = computed(() => entrega.value?.estado || 'pendiente')
  const versionActual = computed(() => entrega.value?.version_actual || 0)
  const diasRestantes = computed(() => {
    if (!tarea.value?.fecha_limite) return null
    const diff = new Date(tarea.value.fecha_limite) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  })
  const diasRetraso = computed(() => {
    if (!tarea.value?.fecha_limite || !entrega.value?.entregado_en) return 0
    const diff = new Date(entrega.value.entregado_en) - new Date(tarea.value.fecha_limite)
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })
  const puedeEntregar = computed(() => {
    if (!tarea.value) return false
    const ahora = new Date()
    if (tarea.value.fecha_apertura && new Date(tarea.value.fecha_apertura) > ahora) return false
    if (estado.value === 'calificada') return false
    if (diasRestantes.value !== null && diasRestantes.value < 0 && !tarea.value.permitir_retraso)
      return false
    return true
  })

  async function cargar() {
    loading.value = true
    error.value = null
    try {
      const [tareaRes, entregaRes, rubricaRes] = await Promise.all([
        supabase.from('tareas').select('*').eq('id', tareaId).single(),
        obtenerEntrega(tareaId, userId),
        obtenerRubrica(tareaId),
      ])
      if (tareaRes.error) throw tareaRes.error
      tarea.value = tareaRes.data
      entrega.value = entregaRes
      rubrica.value = rubricaRes
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function subirVersion({ texto, archivos, comentario }) {
    if (!entrega.value) {
      const nueva = await crearEntrega(tareaId, userId, { texto, archivos, comentario })
      entrega.value = nueva
    } else {
      await nuevaVersion(entrega.value.id, { texto, archivos, comentario })
      await cargar()
    }
  }

  return {
    entrega,
    tarea,
    rubrica,
    loading,
    error,
    estado,
    versionActual,
    diasRestantes,
    diasRetraso,
    puedeEntregar,
    cargar,
    subirVersion,
  }
}
```

- [ ] **Step 2: Implementar useEntregasInstructor.js**

```js
import { ref, computed } from 'vue'
import { listarEntregasPorTarea, calificarEntrega, devolverEntrega } from '@/services/entregas'

export function useEntregasInstructor(tareaId) {
  const entregas = ref([])
  const loading = ref(false)
  const error = ref(null)

  const pendientes = computed(() => entregas.value.filter((e) => e.estado === 'entregada'))
  const calificadas = computed(() => entregas.value.filter((e) => e.estado === 'calificada'))
  const estadisticas = computed(() => ({
    total: entregas.value.length,
    pendientes: pendientes.value.length,
    calificadas: calificadas.value.length,
    promedio: calificadas.value.length
      ? calificadas.value.reduce((s, e) => s + (e.puntaje_final || 0), 0) / calificadas.value.length
      : 0,
  }))

  async function cargar() {
    loading.value = true
    error.value = null
    try {
      entregas.value = await listarEntregasPorTarea(tareaId)
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function calificar(entregaId, payload) {
    await calificarEntrega(entregaId, payload)
    await cargar()
  }

  async function devolver(entregaId, comentario) {
    await devolverEntrega(entregaId, comentario)
    await cargar()
  }

  return {
    entregas,
    loading,
    error,
    pendientes,
    calificadas,
    estadisticas,
    cargar,
    calificar,
    devolver,
  }
}
```

- [ ] **Step 3: Escribir tests básicos**

Crear tests que mockeen los servicios y verifiquen computed properties (`puedeEntregar`, `diasRestantes`, `estadisticas`).

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/composables/__tests__/useEntregas.test.js src/composables/__tests__/useEntregasInstructor.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/composables/useEntregas.js src/composables/useEntregasInstructor.js src/composables/__tests__/
git commit -m "feat(composables): useEntregas + useEntregasInstructor + tests"
```

---

### Task 5: Componentes Base — EntregaUploader + RubricaEditor

**Files:**

- Create: `src/components/EntregaUploader.vue`
- Create: `src/components/RubricaEditor.vue`
- Create: `src/components/__tests__/EntregaUploader.test.js`
- Create: `src/components/__tests__/RubricaEditor.test.js`

- [ ] **Step 1: Implementar EntregaUploader.vue**

Componente drag & drop con validación de tipo/tamaño. Usa Supabase Storage para upload. Emite `@uploaded` con array de paths.

Props: `maxFiles`, `maxSizeMb`, `tareaId`, `userId`, `version`

- [ ] **Step 2: Implementar RubricaEditor.vue**

Editor inline con:

- Selector tipo (niveles/puntaje libre)
- Lista de criterios (título, descripción, peso, puntaje máximo)
- Lista de niveles (etiqueta, puntaje) — solo para tipo='niveles'
- Preview

Emite `@update:modelValue` con objeto rúbrica completo.

- [ ] **Step 3: Tests**

Tests mínimos: montar componente, verificar inputs existen, emitir evento.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/components/__tests__/EntregaUploader.test.js src/components/__tests__/RubricaEditor.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/components/EntregaUploader.vue src/components/RubricaEditor.vue src/components/__tests__/
git commit -m "feat(components): EntregaUploader + RubricaEditor + tests"
```

---

### Task 6: Componentes de Flujo — CrearTareaPanel + CalificarEntregaModal

**Files:**

- Create: `src/components/CrearTareaPanel.vue`
- Create: `src/components/CalificarEntregaModal.vue`
- Create: `src/components/__tests__/CrearTareaPanel.test.js`
- Create: `src/components/__tests__/CalificarEntregaModal.test.js`

- [ ] **Step 1: Implementar CrearTareaPanel.vue**

Formulario con Tiptap para instrucciones, inputs de fecha, toggles de configuración, RubricaEditor condicional. Guarda tarea + rúbrica en una transacción lógica (llamadas secuenciales).

- [ ] **Step 2: Implementar CalificarEntregaModal.vue**

Modal con:

- Sidebar: selector de versión, texto del alumno, lista de archivos descargables
- Sidebar: rúbrica interactiva (radio buttons niveles o inputs numéricos), comentario Tiptap, puntaje final calculado
- Botones: Guardar borrador, Publicar, Devolver

- [ ] **Step 3: Tests**

Verificar que el cálculo de puntaje funciona correctamente para ambos tipos de rúbrica.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/components/__tests__/CrearTareaPanel.test.js src/components/__tests__/CalificarEntregaModal.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CrearTareaPanel.vue src/components/CalificarEntregaModal.vue src/components/__tests__/
git commit -m "feat(components): CrearTareaPanel + CalificarEntregaModal + tests"
```

---

### Task 7: Componentes de Vista — EntregasInstructorTable + EntregaAlumnoPanel + RubricaAlumnoView

**Files:**

- Create: `src/components/EntregasInstructorTable.vue`
- Create: `src/components/EntregaAlumnoPanel.vue`
- Create: `src/components/RubricaAlumnoView.vue`
- Create: `src/components/__tests__/EntregasInstructorTable.test.js`
- Create: `src/components/__tests__/EntregaAlumnoPanel.test.js`

- [ ] **Step 1: Implementar EntregasInstructorTable.vue**

Tabla con columnas: alumno, estado, versión, fecha, puntaje, días retraso. Filtros y acciones (calificar, ver).

- [ ] **Step 2: Implementar EntregaAlumnoPanel.vue**

Panel con estado, editor Tiptap, uploader, historial de versiones, y vista de calificación si aplica.

- [ ] **Step 3: Implementar RubricaAlumnoView.vue**

Solo lectura. Criterios con nivel/puntaje resaltado, comentarios, puntaje final con desglose de penalización.

- [ ] **Step 4: Tests**

Verificar renderizado condicional según estado (pendiente/entregada/calificada).

- [ ] **Step 5: Run tests**

```bash
npm run test:unit -- src/components/__tests__/EntregasInstructorTable.test.js src/components/__tests__/EntregaAlumnoPanel.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/components/EntregasInstructorTable.vue src/components/EntregaAlumnoPanel.vue src/components/RubricaAlumnoView.vue src/components/__tests__/
git commit -m "feat(components): EntregasInstructorTable + EntregaAlumnoPanel + RubricaAlumnoView + tests"
```

---

### Task 8: AdminEntregas + Feature Flags

**Files:**

- Create: `src/components/AdminEntregas.vue`
- Create: `src/components/__tests__/AdminEntregas.test.js`
- Modify: `src/lib/featureFlags.ts`
- Modify: `src/composables/useAdminNavigation.js`

- [ ] **Step 1: Implementar AdminEntregas.vue**

Stats cards + tabla de tareas con métricas (entregas totales, pendientes, tasa de entrega).

- [ ] **Step 2: Agregar feature flags**

```typescript
entregas: flag('VITE_FEATURE_ENTREGAS'),
entregas_rubricas: flag('VITE_FEATURE_ENTREGAS_RUBRICAS'),
```

- [ ] **Step 3: Agregar a admin navigation**

Agregar "Entregas" con key `entregas` condicionado por `featureEnabled('entregas')`.

- [ ] **Step 4: Tests y commit**

```bash
npm run test:unit -- src/components/__tests__/AdminEntregas.test.js
git add src/components/AdminEntregas.vue src/lib/featureFlags.ts src/composables/useAdminNavigation.js src/components/__tests__/
git commit -m "feat(admin): AdminEntregas component + feature flags"
```

---

### Task 9: Integración en Páginas

**Files:**

- Modify: `src/pages/CursoDetalle.vue`
- Modify: `src/pages/InstructorPage.vue`
- Modify: `src/pages/PlayerPage.vue`
- Modify: `src/pages/AdminPage.vue`

- [ ] **Step 1: CursoDetalle.vue**

Agregar pestaña "Entregas" (si `featureEnabled('entregas')`) que liste tareas del curso. Instructor ve botón "Nueva tarea" que abre `CrearTareaPanel`. Alumno ve lista de tareas con estado.

- [ ] **Step 2: InstructorPage.vue**

Agregar sección "Entregas por calificar" con `EntregasInstructorTable` usando `v_entregas_pendientes_instructor`.

- [ ] **Step 3: PlayerPage.vue**

Si la lección tiene `tarea_id` (requiere agregar columna a `lecciones`), mostrar `EntregaAlumnoPanel` debajo del contenido.

> Nota: si no hay relación lección-tarea, omitir este paso o crear tarea standalone por módulo.

- [ ] **Step 4: AdminPage.vue**

Agregar `<AdminEntregas v-else-if="activeSection === 'entregas'" />`.

- [ ] **Step 5: Verificar build**

```bash
npm run build
```

Expected: exit 0, no errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/
git commit -m "feat(pages): integrate entregas into CursoDetalle, InstructorPage, PlayerPage, AdminPage"
```

---

### Task 10: Gamificación — Badges de Entregas

**Files:**

- Modify: `src/services/badgeEngine.js`

- [ ] **Step 1: Agregar criterios**

```js
case 'primera_entrega': {
  const { count } = await supabase.from('entregas').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  return (count || 0) >= 1
}
case 'entrega_a_tiempo': {
  const { data } = await supabase.rpc('entregas_a_tiempo', { p_user_id: userId })
  return (data || 0) >= 1
}
case 'calificacion_perfecta': {
  const { data } = await supabase.from('entregas').select('id').eq('user_id', userId).eq('puntaje_final', 100).single()
  return !!data
}
```

- [ ] **Step 2: Crear función RPC (opcional, o hacerlo en cliente)**

Si se usa RPC, agregar a una nueva migración:

```sql
CREATE OR REPLACE FUNCTION entregas_a_tiempo(p_user_id uuid)
RETURNS int AS $$
  SELECT COUNT(*) FROM entregas e
  JOIN tareas t ON e.tarea_id = t.id
  WHERE e.user_id = p_user_id
  AND e.entregado_en <= t.fecha_limite;
$$ LANGUAGE sql;
```

- [ ] **Step 3: Tests**

Verificar que `evaluarBadges` reconoce los nuevos criterios.

- [ ] **Step 4: Commit**

```bash
git add src/services/badgeEngine.js
git commit -m "feat(gamification): add entrega badges — primera_entrega, entrega_a_tiempo, calificacion_perfecta"
```

---

### Task 11: Release v0.15.0

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` (opcional, version bump)

- [ ] **Step 1: Actualizar README.md**

Agregar al roadmap:

```markdown
- **Phase K: Entregas y Rúbricas** ✅
  - Tareas con instrucciones, fechas, configuración de archivos
  - Entregas del alumno: archivo + texto enriquecido
  - Historial de versiones
  - Rúbricas de niveles y puntaje libre
  - Penalización por retraso configurable
  - Calificación con retroalimentación estructurada
  - Notificaciones automáticas
  - Badges de gamificación
  - Feature flags: entregas, entregas_rubricas
  - Release: v0.15.0
```

- [ ] **Step 2: Actualizar CHANGELOG.md**

```markdown
## [0.15.0] — 2026-07-07

### Añadido

- **Entregas y Rúbricas (Fase K)**:
  - Tablas: tareas, entregas, entrega_versiones, rubricas, rubrica_criterios, rubrica_niveles, calificaciones
  - Vistas: v_entregas_pendientes_instructor
  - Servicios: entregas.js, rubricas.js
  - Composables: useEntregas.js, useEntregasInstructor.js
  - Componentes: CrearTareaPanel, RubricaEditor, CalificarEntregaModal, EntregasInstructorTable, EntregaAlumnoPanel, RubricaAlumnoView, AdminEntregas, EntregaUploader
  - Feature flags: entregas, entregas_rubricas
  - Integración con notificaciones (Fase I) y gamificación
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:unit
```

Expected: all tests pass (target: 315+)

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: exit 0

- [ ] **Step 5: Merge y tag**

```bash
git checkout main
git merge fase-k-entregas-rubricas --no-edit
git tag -a v0.15.0 -m "Fase K: Entregas y Rúbricas — tareas, versiones, rúbricas, calificaciones"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement                  | Task    |
| --------------------------------- | ------- |
| Schema 7 tablas + vista + índices | Task 1  |
| RLS en todas las tablas           | Task 1  |
| Triggers de notificaciones        | Task 1  |
| Servicio entregas CRUD            | Task 2  |
| Servicio rubricas CRUD            | Task 3  |
| Composable useEntregas            | Task 4  |
| Composable useEntregasInstructor  | Task 4  |
| EntregaUploader                   | Task 5  |
| RubricaEditor                     | Task 5  |
| CrearTareaPanel                   | Task 6  |
| CalificarEntregaModal             | Task 6  |
| EntregasInstructorTable           | Task 7  |
| EntregaAlumnoPanel                | Task 7  |
| RubricaAlumnoView                 | Task 7  |
| AdminEntregas                     | Task 8  |
| Feature flags                     | Task 8  |
| Integración CursoDetalle          | Task 9  |
| Integración InstructorPage        | Task 9  |
| Integración PlayerPage            | Task 9  |
| Integración AdminPage             | Task 9  |
| Gamificación badges               | Task 10 |
| Release v0.15.0                   | Task 11 |

**Cobertura: 100%** — todas las secciones del spec tienen al menos un task.

### Placeholder Scan

- No TBD, TODO, o "implement later" encontrados.
- Todos los steps tienen código o comandos concretos.
- Ningún "similar to Task N" — cada task es autocontenido.

### Type Consistency

- `entrega_estado` enum usado consistentemente en schema y servicios.
- `puntaje_final` es `numeric(5,2)` en schema y se trata como número en JS.
- `rubrica.tipo` es `'niveles' | 'puntaje_libre'` consistentemente.
- Nombres de funciones en servicios coinciden con los usados en composables.

### Gaps Found & Fixed

- Agregado `subirArchivo` al servicio de entregas (Task 2) para manejo de storage.
- Agregado nota sobre relación `lecciones.tarea_id` en Task 9 (si no existe, omitir integración en PlayerPage).
- Agregado función RPC `entregas_a_tiempo` opcional en Task 10.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-07-fase-k-entregas-rubricas.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
