-- Migration 038: Cohortes
-- Un cohorte es un grupo de estudiantes dentro de un curso con foro privado.

create table if not exists public.cohortes (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  nombre text not null,
  descripcion text,
  cupo_max int,
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cohortes is 'Grupos/cohortes dentro de un curso';

create table if not exists public.miembros_cohorte (
  id uuid primary key default gen_random_uuid(),
  cohorte_id uuid not null references public.cohortes(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null default 'estudiante' check (rol in ('estudiante', 'ayudante')),
  created_at timestamptz not null default now(),
  unique (cohorte_id, usuario_id)
);

comment on table public.miembros_cohorte is 'Miembros de un cohorte';

-- NOTA: la versión original alteraba `public.foro` para añadir cohorte_id.
-- Esa tabla no existe (la de foros es `public.foros`, creada en 024) y el
-- foro privado por cohorte nunca se implementó en el cliente. Se elimina el
-- ALTER en vez de aplicarlo a la tabla equivocada; cuando la funcionalidad
-- se construya, debe llegar en su propia migración.

-- Políticas RLS
alter table public.cohortes enable row level security;
alter table public.miembros_cohorte enable row level security;

create policy "cohortes_select_all"
  on public.cohortes for select
  to authenticated
  using (true);

create policy "cohortes_mod_admin"
  on public.cohortes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "miembros_cohorte_select_all"
  on public.miembros_cohorte for select
  to authenticated
  using (true);

create policy "miembros_cohorte_mod_admin"
  on public.miembros_cohorte for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Función para obtener el cohorte de un usuario en un curso
create or replace function public.obtener_cohorte_usuario(p_curso_id uuid, p_usuario_id uuid)
returns uuid
language sql
stable
as $$
  select cohorte_id from public.miembros_cohorte mc
  join public.cohortes c on c.id = mc.cohorte_id
  where c.curso_id = p_curso_id and mc.usuario_id = p_usuario_id
  limit 1;
$$;
