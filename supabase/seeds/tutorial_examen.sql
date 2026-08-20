-- ==========================================================
-- OPCIONAL — Examen final del curso tutorial
-- ==========================================================
-- NO es una migración: vive fuera de supabase/migrations/ a propósito, para
-- que scripts/migrate.sh no lo aplique solo.
--
-- Requisito: la instalación debe tener las evaluaciones encendidas
--
--     VITE_FEATURE_EVALUACIONES=true   (en el .env de la raíz, y recompilar)
--
-- Sin ese flag el panel de evaluación no se monta: la lección se vería vacía,
-- sería imposible de completar y bloquearía la constancia del curso tutorial
-- para todo alumno nuevo. Por eso el examen no va en la migración 056.
--
-- Aplicar:
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/tutorial_examen.sql
--
-- Quitar solo el examen (deja el resto del curso intacto):
--     delete from public.lecciones
--      where id = 'c0000007-0803-4000-8000-000000000001';
--
-- Idempotente: reaplicarlo reescribe las preguntas sin duplicarlas.
-- ==========================================================

begin;

-- ---------- Lección tipo examen ----------
insert into public.lecciones
  (id, modulo_id, orden, titulo, tipo_material, duracion_seg,
   eval_puntaje_minimo, eval_max_intentos)
values
  ('c0000007-0803-4000-8000-000000000001', 'b0000007-0008-4000-8000-000000000001', 3,
   'Evaluación final del tutorial', 'examen', 900, 70, 3)
on conflict (id) do update set
  modulo_id           = excluded.modulo_id,
  orden               = excluded.orden,
  titulo              = excluded.titulo,
  tipo_material       = excluded.tipo_material,
  duracion_seg        = excluded.duracion_seg,
  eval_puntaje_minimo = excluded.eval_puntaje_minimo,
  eval_max_intentos   = excluded.eval_max_intentos;

-- Se reescriben las preguntas desde cero (las opciones caen por cascada).
-- Los intentos ya registrados de los alumnos NO se tocan.
delete from public.preguntas
 where leccion_id = 'c0000007-0803-4000-8000-000000000001';

-- ---------- Preguntas ----------
-- Solo tipos básicos (opción única, opción múltiple, verdadero/falso): los
-- tipos avanzados dependen del toggle 'advanced_quizzes', apagado de fábrica,
-- y las de ensayo dejarían la lección pendiente de revisión manual, lo que
-- impediría emitir la constancia sola.
insert into public.preguntas (id, leccion_id, orden, tipo, enunciado) values
  ('d0000007-0001-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 1, 'opcion_unica',
   '¿Qué se necesita para poder reproducir el video de un curso?'),
  ('d0000007-0002-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 2, 'verdadero_falso',
   'La constancia se solicita al administrador, que la emite manualmente.'),
  ('d0000007-0003-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 3, 'opcion_unica',
   '¿En qué momento se emite tu constancia de un curso?'),
  ('d0000007-0004-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 4, 'opcion_multiple',
   '¿Cuáles de estas son formas válidas que puede tomar una lección? (marca todas las que apliquen)'),
  ('d0000007-0005-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 5, 'opcion_unica',
   '¿Cuál es la diferencia entre un instructor y un administrador?'),
  ('d0000007-0006-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 6, 'verdadero_falso',
   'Apagar un módulo de la plataforma borra los datos que ese módulo había generado.'),
  ('d0000007-0007-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 7, 'opcion_unica',
   'En una pregunta de opción múltiple, ¿qué pasa si marcas dos de las tres opciones correctas?'),
  ('d0000007-0008-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 8, 'opcion_unica',
   'Ya entregaste una tarea y subes otra vez el archivo, ahora corregido. ¿Qué ocurre?'),
  ('d0000007-0009-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 9, 'opcion_multiple',
   '¿Qué datos aparecen en una constancia? (marca todas las que apliquen)'),
  ('d0000007-000a-4000-8000-000000000001', 'c0000007-0803-4000-8000-000000000001', 10, 'verdadero_falso',
   'Al abrir un examen, el navegador recibe las preguntas pero nunca cuál opción es la correcta.');

-- ---------- Opciones ----------
insert into public.pregunta_opciones (pregunta_id, orden, texto, es_correcta) values
  -- 1
  ('d0000007-0001-4000-8000-000000000001', 1, 'Estar inscrito en ese curso', true),
  ('d0000007-0001-4000-8000-000000000001', 2, 'Tener una cuenta, aunque no estés inscrito', false),
  ('d0000007-0001-4000-8000-000000000001', 3, 'Haber terminado el curso anterior del catálogo', false),
  ('d0000007-0001-4000-8000-000000000001', 4, 'Nada: los videos son públicos', false),
  -- 2
  ('d0000007-0002-4000-8000-000000000001', 1, 'Verdadero', false),
  ('d0000007-0002-4000-8000-000000000001', 2, 'Falso', true),
  -- 3
  ('d0000007-0003-4000-8000-000000000001', 1, 'Al completar la última lección que te faltaba del curso', true),
  ('d0000007-0003-4000-8000-000000000001', 2, 'Al inscribirte, y se va llenando conforme avanzas', false),
  ('d0000007-0003-4000-8000-000000000001', 3, 'Al cierre del mes, en un proceso por lotes', false),
  ('d0000007-0003-4000-8000-000000000001', 4, 'Cuando el instructor la autoriza una por una', false),
  -- 4
  ('d0000007-0004-4000-8000-000000000001', 1, 'Video (subido a la plataforma o de YouTube)', true),
  ('d0000007-0004-4000-8000-000000000001', 2, 'Documento PDF o imagen', true),
  ('d0000007-0004-4000-8000-000000000001', 3, 'Texto escrito en la propia plataforma', true),
  ('d0000007-0004-4000-8000-000000000001', 4, 'Evaluación con preguntas', true),
  ('d0000007-0004-4000-8000-000000000001', 5, 'Un hilo de foro', false),
  -- 5
  ('d0000007-0005-4000-8000-000000000001', 1, 'El instructor solo puede sobre los cursos que tiene asignados; el administrador, sobre toda la instalación', true),
  ('d0000007-0005-4000-8000-000000000001', 2, 'Son lo mismo, con distinto nombre en pantalla', false),
  ('d0000007-0005-4000-8000-000000000001', 3, 'El instructor no puede calificar entregas', false),
  ('d0000007-0005-4000-8000-000000000001', 4, 'El administrador no puede editar cursos', false),
  -- 6
  ('d0000007-0006-4000-8000-000000000001', 1, 'Verdadero', false),
  ('d0000007-0006-4000-8000-000000000001', 2, 'Falso', true),
  -- 7
  ('d0000007-0007-4000-8000-000000000001', 1, 'Se cuenta como incorrecta: hay que marcarlas todas y ninguna de más', true),
  ('d0000007-0007-4000-8000-000000000001', 2, 'Se otorgan dos tercios del punto', false),
  ('d0000007-0007-4000-8000-000000000001', 3, 'Se cuenta como correcta si no marcaste ninguna equivocada', false),
  ('d0000007-0007-4000-8000-000000000001', 4, 'La pregunta se anula', false),
  -- 8
  ('d0000007-0008-4000-8000-000000000001', 1, 'Se registra una versión nueva y la anterior queda archivada', true),
  ('d0000007-0008-4000-8000-000000000001', 2, 'Se rechaza: no se puede entregar dos veces', false),
  ('d0000007-0008-4000-8000-000000000001', 3, 'Se borra la anterior sin dejar rastro', false),
  ('d0000007-0008-4000-8000-000000000001', 4, 'Se guardan las dos y el instructor elige cuál calificar', false),
  -- 9
  ('d0000007-0009-4000-8000-000000000001', 1, 'Tu nombre completo', true),
  ('d0000007-0009-4000-8000-000000000001', 2, 'El nombre del curso y la fecha de emisión', true),
  ('d0000007-0009-4000-8000-000000000001', 3, 'Un folio único y un código QR de verificación', true),
  ('d0000007-0009-4000-8000-000000000001', 4, 'Tu calificación promedio en las evaluaciones', false),
  ('d0000007-0009-4000-8000-000000000001', 5, 'Tu correo electrónico', false),
  -- 10
  ('d0000007-000a-4000-8000-000000000001', 1, 'Verdadero', true),
  ('d0000007-000a-4000-8000-000000000001', 2, 'Falso', false);

commit;
