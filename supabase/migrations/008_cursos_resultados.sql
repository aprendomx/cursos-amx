-- 008 — Resultados de aprendizaje como dato del curso.
--
-- La portada vende cursos con metadatos (nivel, duración, módulos) y nada que
-- diga qué sabrás hacer al terminar. El reequilibrio de la portada (change
-- portada-cursos-primero) necesita el dato antes que la tarjeta: esta columna
-- lo guarda y el panel lo edita junto al resto del curso.
--
-- Nullable a propósito: una instalación con cursos ya dados de alta no se
-- rompe ni se ve obligada a rellenarlo — sin el dato, la tarjeta se muestra
-- como hoy. El límite de 8 es cordura de portada, no bloqueo de datos.

alter table public.cursos
  add column if not exists resultados_aprendizaje text[]
    check (resultados_aprendizaje is null or cardinality(resultados_aprendizaje) <= 8);

comment on column public.cursos.resultados_aprendizaje is
  'Qué sabrá hacer quien termine el curso, en lenguaje de la persona. La portada lo muestra como «Al terminar sabrás…». Vacío = tarjeta solo con metadatos.';

-- ---------- Semilla: el curso tutorial no sale vacío ----------
-- La portada de ejemplo de una instalación nueva usa el tutorial como
-- vitrina; sin resultados predicaría con el ejemplo equivocado. UUID fijo,
-- reaplicable sin duplicar (el UPDATE es idempotente por naturaleza).
update public.cursos
   set resultados_aprendizaje = array[
     'Crear tu cuenta, inscribirte a un curso y llevar tu avance hasta la constancia.',
     'Usar el reproductor: video, lecturas, notas, foros y evaluaciones.',
     'Verificar la constancia de cualquier persona con su folio o código QR.',
     'Publicar y administrar cursos si te toca el rol de instructor o de administrador.'
   ]
 where id = 'a0000007-0000-4000-8000-000000000001';
