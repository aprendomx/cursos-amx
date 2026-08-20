-- ==========================================================
-- OPCIONAL — Desinstalar el curso tutorial
-- ==========================================================
-- Quita "Cómo usar Cursos AMX" (migración 056) de una instalación donde no
-- se quiera. NO es una migración: scripts/migrate.sh no lo aplica.
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/tutorial_uninstall.sql
--
-- OJO: borra en cascada los módulos, lecciones, inscripciones, progreso,
-- comentarios, intentos de evaluación y CONSTANCIAS de este curso. Si alguien
-- ya obtuvo su constancia del tutorial, su folio deja de verificarse.
--
-- Alternativa reversible y casi siempre preferible — sacarlo del catálogo sin
-- destruir nada, que además conserva las constancias ya emitidas:
--
--     update public.cursos set publicado = false
--      where id = 'a0000007-0000-4000-8000-000000000001';
--
-- Si vuelves a correr la migración 056 después de este borrado, el curso se
-- siembra otra vez con los mismos identificadores, pero el progreso y las
-- constancias que se borraron aquí no regresan.
-- ==========================================================

begin;

-- Las constancias referencian el curso sin ON DELETE CASCADE: van primero.
delete from public.constancias
 where curso_id = 'a0000007-0000-4000-8000-000000000001';

-- El resto (módulos, lecciones, inscripciones, progreso, comentarios,
-- intentos, entregas, foros…) cae en cascada desde el curso.
delete from public.cursos
 where id = 'a0000007-0000-4000-8000-000000000001';

commit;
