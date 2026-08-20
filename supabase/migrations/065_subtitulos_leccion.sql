-- =========================================================================
-- Migration 065: subtítulos de lección (WCAG 2.1 §1.2.2, nivel A)
-- =========================================================================
-- Ninguno de los dos elementos <video> del reproductor llevaba <track>, y el
-- worker de transcodificación no generaba WebVTT. Es un incumplimiento de
-- nivel A —el más básico— y una obligación dura para el sector público.
--
-- Las sesiones grabadas ya tenían de dónde sacarlos
-- (sesiones_transcripciones.segmentos, producido por Whisper). Las lecciones
-- no tenían dónde guardarlos.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `lecciones`:
-- el reproductor carga la lista completa de lecciones del curso con
-- `lecciones?select=*` (src/composables/useLessonNavigation.ts). Una columna
-- de texto con el WebVTT viajaría entera para las 26 lecciones del curso en
-- la carga inicial, cuando solo hace falta la de la lección que se está
-- viendo. En tabla aparte, se pide bajo demanda.
--
-- Se guarda el WebVTT ya montado, no los segmentos: así una institución puede
-- subir subtítulos revisados por una persona, que es lo que el criterio pide
-- de verdad — una transcripción automática sin revisar rara vez es un
-- "equivalente al contenido hablado".
-- =========================================================================

create table if not exists public.leccion_subtitulos (
  leccion_id     uuid primary key references public.lecciones(id) on delete cascade,
  idioma         text not null default 'es',
  contenido_vtt  text not null,
  actualizado_en timestamptz not null default now()
);

comment on table public.leccion_subtitulos is
  'Pista de subtítulos WebVTT por lección, servida al reproductor como '
  '<track>. En tabla aparte para no viajar en la lista de lecciones. '
  'Ver src/lib/webvtt.js y docs/CUMPLIMIENTO.md.';

alter table public.leccion_subtitulos enable row level security;

-- Lectura: la misma que las lecciones, que ya es pública ("lecciones: leer").
drop policy if exists "subtitulos: leer" on public.leccion_subtitulos;
create policy "subtitulos: leer" on public.leccion_subtitulos
  for select using (true);

-- Escritura: administrador o instructor del curso al que pertenece la lección.
drop policy if exists "subtitulos: escribir" on public.leccion_subtitulos;
create policy "subtitulos: escribir" on public.leccion_subtitulos
  for all to authenticated
  using (public.is_instructor_de(public.curso_de_leccion(leccion_id)))
  with check (public.is_instructor_de(public.curso_de_leccion(leccion_id)));

create or replace function public.leccion_subtitulos_touch()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists leccion_subtitulos_set_actualizado on public.leccion_subtitulos;
create trigger leccion_subtitulos_set_actualizado
  before update on public.leccion_subtitulos
  for each row execute function public.leccion_subtitulos_touch();

-- ---------------------------------------------------------------------
-- Informe de conformidad
-- ---------------------------------------------------------------------
-- Es la consulta que responde "¿puedo declarar conformidad con WCAG 1.2.2?".
create or replace view public.v_lecciones_sin_subtitulos as
select
  c.id     as curso_id,
  c.titulo as curso,
  m.orden  as modulo_orden,
  l.id     as leccion_id,
  l.orden  as leccion_orden,
  l.titulo as leccion,
  l.duracion_seg
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
join public.cursos  c on c.id = m.curso_id
left join public.leccion_subtitulos s on s.leccion_id = l.id
where l.tipo_material = 'video'
  and (s.leccion_id is null or coalesce(s.contenido_vtt, '') = '')
order by c.titulo, m.orden, l.orden;

comment on view public.v_lecciones_sin_subtitulos is
  'Lecciones de video sin pista de subtítulos. Si devuelve filas, la '
  'instalación NO cumple WCAG 2.1 §1.2.2 (nivel A).';

grant select on public.v_lecciones_sin_subtitulos to authenticated;
