-- =========================================================
-- Migration 053: Entregas y Rúbricas (Fase K)
-- =========================================================
--  * tareas: asignaciones creadas por instructores
--  * entregas: una por alumno por tarea
--  * entrega_versiones: cada intento de entrega
--  * rubricas: rúbrica asociada a una tarea
--  * rubrica_criterios: criterios individuales
--  * rubrica_niveles: niveles cualitativos (solo tipo='niveles')
--  * calificaciones: calificación por criterio por entrega
--  * Vistas, índices, RLS y triggers de notificación
-- =========================================================

-- Renombra tablas legacy de la migración 037 para evitar conflictos
alter table if exists public.asignaciones_rubrica rename to asignaciones_rubrica_legacy;
alter table if exists public.rubricas rename to rubricas_legacy;


-- ==========================================================
-- Step 1 — Enum y tipos
-- ==========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_entrega') then
    create type estado_entrega as enum ('pendiente', 'entregada', 'calificada', 'devuelta');
  end if;
end $$;


-- ==========================================================
-- Step 2 — Tablas base
-- ==========================================================

-- ---------- Tareas ----------
create table if not exists public.tareas (
  id                      uuid primary key default gen_random_uuid(),
  curso_id                uuid not null references public.cursos(id) on delete cascade,
  modulo_id               uuid references public.modulos(id) on delete set null,
  titulo                  text not null,
  instrucciones           jsonb,
  fecha_apertura          timestamptz,
  fecha_limite            timestamptz,
  maximo_archivos         int not null default 5 check (maximo_archivos between 1 and 10),
  peso_maximo_mb          int not null default 10 check (peso_maximo_mb between 1 and 100),
  permitir_retraso        boolean not null default false,
  penalizacion_retraso_pct int not null default 0 check (penalizacion_retraso_pct between 0 and 100),
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

comment on table public.tareas is 'Asignaciones creadas por instructores';
comment on column public.tareas.instrucciones is 'Contenido Tiptap en formato JSONB';


-- ---------- Entregas ----------
create table if not exists public.entregas (
  id                      uuid primary key default gen_random_uuid(),
  tarea_id                uuid not null references public.tareas(id) on delete cascade,
  user_id                 uuid not null references public.perfiles(id) on delete cascade,
  estado                  estado_entrega not null default 'pendiente',
  entregado_en            timestamptz,
  calificado_en           timestamptz,
  calificado_por          uuid references public.perfiles(id) on delete set null,
  puntaje_final           numeric(5,2) check (puntaje_final between 0 and 100),
  comentario_instructor   jsonb,
  version_actual          int not null default 0,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),
  unique (tarea_id, user_id)
);

comment on table public.entregas is 'Entrega única por alumno por tarea';
comment on column public.entregas.comentario_instructor is 'Comentario del instructor en formato Tiptap JSONB';


-- ---------- Versiones de entrega ----------
create table if not exists public.entrega_versiones (
  id              uuid primary key default gen_random_uuid(),
  entrega_id      uuid not null references public.entregas(id) on delete cascade,
  numero_version  int not null,
  texto           jsonb,
  archivos        text[] not null default '{}',
  entregado_en    timestamptz not null default now(),
  comentario_alumno text,
  unique (entrega_id, numero_version)
);

comment on table public.entrega_versiones is 'Cada intento de entrega por parte del alumno';
comment on column public.entrega_versiones.texto is 'Contenido Tiptap en formato JSONB';


-- ---------- Rúbricas ----------
create table if not exists public.rubricas (
  id              uuid primary key default gen_random_uuid(),
  tarea_id        uuid not null references public.tareas(id) on delete cascade,
  tipo            text not null check (tipo in ('niveles', 'puntaje_libre')),
  titulo          text not null,
  puntaje_maximo  int not null default 100,
  creado_en       timestamptz not null default now()
);

comment on table public.rubricas is 'Rúbrica asociada a una tarea (evaluación con criterios)';


-- ---------- Criterios de rúbrica ----------
create table if not exists public.rubrica_criterios (
  id              uuid primary key default gen_random_uuid(),
  rubrica_id      uuid not null references public.rubricas(id) on delete cascade,
  titulo          text not null,
  descripcion     text,
  orden           int not null,
  peso            numeric(3,2) not null default 1.0 check (peso > 0),
  puntaje_maximo  int not null,
  unique (rubrica_id, orden)
);

comment on table public.rubrica_criterios is 'Criterios individuales de una rúbrica';


-- ---------- Niveles de rúbrica ----------
create table if not exists public.rubrica_niveles (
  id          uuid primary key default gen_random_uuid(),
  rubrica_id  uuid not null references public.rubricas(id) on delete cascade,
  etiqueta    text not null,
  puntaje     int not null check (puntaje >= 0),
  orden       int not null,
  unique (rubrica_id, orden)
);

comment on table public.rubrica_niveles is 'Niveles cualitativos de desempeño (solo para tipo=niveles)';


-- ---------- Calificaciones ----------
create table if not exists public.calificaciones (
  id          uuid primary key default gen_random_uuid(),
  entrega_id  uuid not null references public.entregas(id) on delete cascade,
  criterio_id uuid not null references public.rubrica_criterios(id) on delete cascade,
  nivel_id    uuid references public.rubrica_niveles(id) on delete set null,
  puntaje     numeric(5,2) not null check (puntaje >= 0),
  comentario  text,
  unique (entrega_id, criterio_id)
);

comment on table public.calificaciones is 'Calificación por criterio por entrega';


-- ==========================================================
-- Step 3 — Índices
-- ==========================================================

create index if not exists idx_entregas_tarea_user
  on public.entregas(tarea_id, user_id);

create index if not exists idx_entregas_estado
  on public.entregas(estado);

create index if not exists idx_entrega_versiones_entrega
  on public.entrega_versiones(entrega_id, numero_version);

create index if not exists idx_calificaciones_entrega
  on public.calificaciones(entrega_id);


-- ==========================================================
-- Step 4 — Vista para instructores
-- ==========================================================

create or replace view public.v_entregas_pendientes_instructor as
select
  e.id as entrega_id,
  e.tarea_id,
  t.titulo as tarea_titulo,
  t.curso_id,
  c.titulo as curso_titulo,
  e.user_id,
  p.nombres_completos as alumno_nombre,
  e.entregado_en,
  e.estado
from public.entregas e
join public.tareas t on t.id = e.tarea_id
join public.cursos c on c.id = t.curso_id
join public.perfiles p on p.id = e.user_id
where e.estado = 'entregada';


-- ==========================================================
-- Step 5 — RLS
-- ==========================================================

-- ---------- tareas ----------
alter table public.tareas enable row level security;

drop policy if exists "tareas: select public" on public.tareas;
create policy "tareas: select public"
  on public.tareas for select to authenticated
  using (true);

drop policy if exists "tareas: write instructor" on public.tareas;
create policy "tareas: write instructor"
  on public.tareas for all to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));


-- ---------- entregas ----------
alter table public.entregas enable row level security;

drop policy if exists "entregas: select own or instructor" on public.entregas;
create policy "entregas: select own or instructor"
  on public.entregas for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_instructor_de((select curso_id from public.tareas where id = entregas.tarea_id))
  );

drop policy if exists "entregas: insert own" on public.entregas;
create policy "entregas: insert own"
  on public.entregas for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "entregas: update instructor" on public.entregas;
create policy "entregas: update instructor"
  on public.entregas for update to authenticated
  using (public.is_instructor_de((select curso_id from public.tareas where id = entregas.tarea_id)))
  with check (public.is_instructor_de((select curso_id from public.tareas where id = entregas.tarea_id)));


-- ---------- entrega_versiones ----------
alter table public.entrega_versiones enable row level security;

drop policy if exists "entrega_versiones: select own or instructor" on public.entrega_versiones;
create policy "entrega_versiones: select own or instructor"
  on public.entrega_versiones for select to authenticated
  using (
    exists (
      select 1 from public.entregas e
      where e.id = entrega_versiones.entrega_id
      and (
        e.user_id = auth.uid()
        or public.is_instructor_de((select curso_id from public.tareas where id = e.tarea_id))
      )
    )
  );

drop policy if exists "entrega_versiones: insert own" on public.entrega_versiones;
create policy "entrega_versiones: insert own"
  on public.entrega_versiones for insert to authenticated
  with check (
    exists (
      select 1 from public.entregas e
      where e.id = entrega_versiones.entrega_id
      and e.user_id = auth.uid()
    )
  );


-- ---------- rubricas ----------
alter table public.rubricas enable row level security;

drop policy if exists "rubricas: select public" on public.rubricas;
create policy "rubricas: select public"
  on public.rubricas for select to authenticated
  using (true);

drop policy if exists "rubricas: write instructor" on public.rubricas;
create policy "rubricas: write instructor"
  on public.rubricas for all to authenticated
  using (public.is_instructor_de((select curso_id from public.tareas where id = rubricas.tarea_id)))
  with check (public.is_instructor_de((select curso_id from public.tareas where id = rubricas.tarea_id)));


-- ---------- rubrica_criterios ----------
alter table public.rubrica_criterios enable row level security;

drop policy if exists "rubrica_criterios: select public" on public.rubrica_criterios;
create policy "rubrica_criterios: select public"
  on public.rubrica_criterios for select to authenticated
  using (true);

drop policy if exists "rubrica_criterios: write instructor" on public.rubrica_criterios;
create policy "rubrica_criterios: write instructor"
  on public.rubrica_criterios for all to authenticated
  using (public.is_instructor_de((select t.curso_id from public.rubricas r join public.tareas t on t.id = r.tarea_id where r.id = rubrica_criterios.rubrica_id)))
  with check (public.is_instructor_de((select t.curso_id from public.rubricas r join public.tareas t on t.id = r.tarea_id where r.id = rubrica_criterios.rubrica_id)));


-- ---------- rubrica_niveles ----------
alter table public.rubrica_niveles enable row level security;

drop policy if exists "rubrica_niveles: select public" on public.rubrica_niveles;
create policy "rubrica_niveles: select public"
  on public.rubrica_niveles for select to authenticated
  using (true);

drop policy if exists "rubrica_niveles: write instructor" on public.rubrica_niveles;
create policy "rubrica_niveles: write instructor"
  on public.rubrica_niveles for all to authenticated
  using (public.is_instructor_de((select t.curso_id from public.rubricas r join public.tareas t on t.id = r.tarea_id where r.id = rubrica_niveles.rubrica_id)))
  with check (public.is_instructor_de((select t.curso_id from public.rubricas r join public.tareas t on t.id = r.tarea_id where r.id = rubrica_niveles.rubrica_id)));


-- ---------- calificaciones ----------
alter table public.calificaciones enable row level security;

drop policy if exists "calificaciones: select own or instructor" on public.calificaciones;
create policy "calificaciones: select own or instructor"
  on public.calificaciones for select to authenticated
  using (
    exists (
      select 1 from public.entregas e
      where e.id = calificaciones.entrega_id
      and (
        e.user_id = auth.uid()
        or public.is_instructor_de((select curso_id from public.tareas where id = e.tarea_id))
      )
    )
  );

drop policy if exists "calificaciones: write instructor" on public.calificaciones;
create policy "calificaciones: write instructor"
  on public.calificaciones for all to authenticated
  using (public.is_instructor_de((select t.curso_id from public.entregas e join public.tareas t on t.id = e.tarea_id where e.id = calificaciones.entrega_id)))
  with check (public.is_instructor_de((select t.curso_id from public.entregas e join public.tareas t on t.id = e.tarea_id where e.id = calificaciones.entrega_id)));


-- ==========================================================
-- Step 6 — Triggers de notificación
-- ==========================================================

-- ---------- trg_nueva_entrega ----------
create or replace function public.trg_nueva_entrega_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_id     uuid;
  v_tarea_titulo text;
  r              record;
begin
  if old.estado = 'pendiente' and new.estado = 'entregada' then
    select t.curso_id, t.titulo into v_curso_id, v_tarea_titulo
    from public.tareas t where t.id = new.tarea_id;

    for r in
      select ci.user_id as instructor_id
      from public.cursos_instructores ci
      where ci.curso_id = v_curso_id
    loop
      perform public.crear_notificacion(
        r.instructor_id,
        'nueva_entrega',
        'Nueva entrega: ' || coalesce(v_tarea_titulo, 'Tarea'),
        'Un alumno ha entregado la tarea "' || coalesce(v_tarea_titulo, 'Sin título') || '"',
        jsonb_build_object(
          'entrega_id', new.id,
          'tarea_id', new.tarea_id,
          'curso_id', v_curso_id,
          'alumno_id', new.user_id
        ),
        'in_app'
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nueva_entrega on public.entregas;
create trigger trg_nueva_entrega
  after update of estado on public.entregas
  for each row
  execute function public.trg_nueva_entrega_fn();


-- ---------- trg_entrega_calificada ----------
create or replace function public.trg_entrega_calificada_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_id     uuid;
  v_tarea_titulo text;
begin
  if old.estado = 'entregada' and new.estado = 'calificada' then
    select t.curso_id, t.titulo into v_curso_id, v_tarea_titulo
    from public.tareas t where t.id = new.tarea_id;

    perform public.crear_notificacion(
      new.user_id,
      'entrega_calificada',
      'Entrega calificada: ' || coalesce(v_tarea_titulo, 'Tarea'),
      'Tu entrega para "' || coalesce(v_tarea_titulo, 'Sin título') || '" ha sido calificada con ' || coalesce(new.puntaje_final::text, '0') || '/100',
      jsonb_build_object(
        'entrega_id', new.id,
        'tarea_id', new.tarea_id,
        'curso_id', v_curso_id,
        'puntaje', new.puntaje_final
      ),
      'in_app'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_entrega_calificada on public.entregas;
create trigger trg_entrega_calificada
  after update of estado on public.entregas
  for each row
  execute function public.trg_entrega_calificada_fn();
