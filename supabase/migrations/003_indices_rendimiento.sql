-- 003 — Índices para los filtros que la aplicación usa de verdad.
--
-- Salieron de un diagnóstico sobre producción (27-08-2026): estas tablas solo
-- tenían índice por su clave primaria y por el par único, que no sirve cuando
-- se filtra por la SEGUNDA columna del par ni por fecha. Con 26 filas no se
-- nota; con datos reales son recorridos secuenciales en las pantallas más
-- consultadas del panel.
--
-- Se crean sin CONCURRENTLY a propósito: scripts/migrate.sh ejecuta cada
-- migración dentro de una transacción, y CONCURRENTLY no puede correr ahí.
-- Sobre las tablas actuales es instantáneo; una instalación con millones de
-- filas debería crearlos a mano con CONCURRENTLY antes de aplicar esta.

-- ---------------------------------------------------------------------
-- inscripciones: `unique (user_id, curso_id)` cubre los filtros por usuario,
-- pero no los que van por curso solo — que son los del panel de instructor
-- (alumnos del curso, conteo de inscritos) y los del detalle de curso.
create index if not exists inscripciones_curso_idx
  on public.inscripciones (curso_id);

-- Altas por rango de fechas: el panel de administración y los informes
-- agrupan por mes sobre esta columna.
create index if not exists inscripciones_inscrito_en_idx
  on public.inscripciones (inscrito_en);

-- ---------------------------------------------------------------------
-- constancias: mismo caso. Se consultan por curso (tasa de aprobación) y se
-- ordenan por fecha de emisión descendente (últimas emitidas).
create index if not exists constancias_curso_idx
  on public.constancias (curso_id);

create index if not exists constancias_emitida_en_idx
  on public.constancias (emitida_en desc);

-- ---------------------------------------------------------------------
-- progreso: ya existe `(user_id)`, pero la consulta que domina el reproductor
-- y el detalle de curso es «lecciones COMPLETADAS de este usuario». Un índice
-- parcial es más pequeño —solo indexa las filas completadas— y al incluir
-- leccion_id permite resolver esa consulta sin tocar la tabla.
create index if not exists progreso_completadas_idx
  on public.progreso (user_id, leccion_id)
  where completado;

-- Rango de fechas sobre lecciones completadas: informes de actividad.
create index if not exists progreso_completado_en_idx
  on public.progreso (completado_en)
  where completado;

comment on index public.progreso_completadas_idx is
  'Parcial: solo filas completadas. Cubre la consulta de progreso por usuario del reproductor y del detalle de curso.';
