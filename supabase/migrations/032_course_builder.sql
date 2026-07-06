-- 032_course_builder.sql
-- Constructor visual v2: orden fraccional, contenido enriquecido y RPCs de reorder.
-- Ver docs/superpowers/specs/2026-07-04-constructor-visual-design.md §14.

-- 1) Quitar los unique (curso_id, orden) / (modulo_id, orden): incompatibles
--    con reorden incremental (hoy obligan al truco de orden negativo del editor).
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'u'
      and conrelid in ('public.modulos'::regclass, 'public.lecciones'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2) Orden fraccional
alter table public.modulos
  alter column orden type double precision using orden::double precision;
alter table public.lecciones
  alter column orden type double precision using orden::double precision;

create index if not exists idx_modulos_curso_orden on public.modulos (curso_id, orden);
create index if not exists idx_lecciones_modulo_orden on public.lecciones (modulo_id, orden);

-- 3) Contenido enriquecido (JSON de Tiptap). Una lección de texto es
--    tipo_material = 'lectura' + contenido no nulo (no se amplía el enum).
alter table public.lecciones add column if not exists contenido jsonb;

-- 4) RPC: reorden masivo de módulos. Valida permiso sobre TODOS los módulos
--    del lote antes de aplicar (atómico).
create or replace function public.reordenar_modulos(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(items) it
    where (it->>'orden') is null
       or not ((it->>'orden') ~ '^-?[0-9]+(\.[0-9]+)?$')
  ) then
    raise exception 'orden inválido en items' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.modulos m on m.id = (item->>'id')::uuid
  where m.id is null
     or not public.is_instructor_de(m.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado para reordenar estos módulos'
      using errcode = '42501';
  end if;

  update public.modulos m
  set orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where m.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_modulos(jsonb) from public;
grant execute on function public.reordenar_modulos(jsonb) to authenticated;

-- 5) RPC: reorden masivo de lecciones (permite mover entre módulos del MISMO
--    curso; rechaza mover a módulos de cursos ajenos).
create or replace function public.reordenar_lecciones(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(items) it
    where (it->>'orden') is null
       or not ((it->>'orden') ~ '^-?[0-9]+(\.[0-9]+)?$')
  ) then
    raise exception 'orden inválido en items' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.lecciones l on l.id = (item->>'id')::uuid
  left join public.modulos mo on mo.id = l.modulo_id
  left join public.modulos md on md.id = (item->>'modulo_id')::uuid
  where l.id is null
     or md.id is null
     or md.curso_id <> mo.curso_id
     or not public.is_instructor_de(mo.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado o lote inválido para reordenar lecciones'
      using errcode = '42501';
  end if;

  update public.lecciones l
  set modulo_id = (item->>'modulo_id')::uuid,
      orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where l.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_lecciones(jsonb) from public;
grant execute on function public.reordenar_lecciones(jsonb) to authenticated;

-- 6) Feature flag runtime (apagado por default; se enciende por SQL/service-role)
insert into public.feature_toggles (key, enabled)
values ('visual_builder', false)
on conflict (key) do nothing;
