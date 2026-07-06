-- Migration 037: Sistema de rúbricas
-- Una rúbrica es un conjunto de criterios con niveles de desempeño.

create table if not exists public.rubricas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  criterios jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rubricas is 'Rúbricas de evaluación (criterios + niveles)';
comment on column public.rubricas.criterios is 'Array de {nombre, descripcion, niveles:[{puntaje, descripcion}]}';

-- Asignación de rúbrica a evaluación, pregunta o curso
-- Se permite asignar a nivel de evaluación (ensayos) o a nivel de pregunta individual
create table if not exists public.asignaciones_rubrica (
  id uuid primary key default gen_random_uuid(),
  rubrica_id uuid not null references public.rubricas(id) on delete cascade,
  evaluacion_id uuid references public.evaluaciones(id) on delete cascade,
  pregunta_id uuid references public.preguntas(id) on delete cascade,
  curso_id uuid references public.cursos(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chk_asignacion_objetivo check (
    numnonnulls(evaluacion_id, pregunta_id, curso_id) = 1
  )
);

comment on table public.asignaciones_rubrica is 'Vincula una rúbrica a evaluación, pregunta o curso';

-- Puntajes de rúbrica por intento de evaluación
-- Se guarda como JSONB: [{criterio_index, nivel_index, puntaje, comentario}]
alter table public.resultados_evaluacion
add column if not exists rubrica_scores jsonb;

comment on column public.resultados_evaluacion.rubrica_scores is 'Puntajes de rúbrica por criterio (solo para evaluaciones con rúbrica)';

-- Políticas RLS
alter table public.rubricas enable row level security;
alter table public.asignaciones_rubrica enable row level security;

create policy "rubricas_select_all"
  on public.rubricas for select
  to authenticated
  using (true);

create policy "rubricas_mod_admin"
  on public.rubricas for all
  to authenticated
  using (exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  ))
  with check (exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  ));

create policy "asignaciones_rubrica_select_all"
  on public.asignaciones_rubrica for select
  to authenticated
  using (true);

create policy "asignaciones_rubrica_mod_admin"
  on public.asignaciones_rubrica for all
  to authenticated
  using (exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  ))
  with check (exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  ));

-- Trigger updated_at
select dbdev.install('abcdefghijklmnopqrstuvwxyz012345');
-- (Si no existe la extensión, se omite; se manejará en aplicación)
