-- 028_tiempo_curso.sql
-- Conteo de tiempo ACTIVO por curso y por usuario.
-- El tiempo lo acumula el frontend con heartbeats (pestaña visible + actividad)
-- y lo persiste vía el RPC registrar_tiempo_curso, que aplica un clamp
-- anti-inflación del lado servidor.

create table if not exists public.tiempo_curso (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.perfiles(id) on delete cascade,
  curso_id         uuid not null references public.cursos(id) on delete cascade,
  segundos_activos bigint not null default 0,
  actualizado_en   timestamptz not null default now(),
  unique (user_id, curso_id)
);
create index if not exists tiempo_curso_user_idx  on public.tiempo_curso(user_id);
create index if not exists tiempo_curso_curso_idx on public.tiempo_curso(curso_id);

alter table public.tiempo_curso enable row level security;

-- El usuario lee únicamente su propio tiempo.
drop policy if exists "tiempo propio lectura" on public.tiempo_curso;
create policy "tiempo propio lectura" on public.tiempo_curso
  for select using ((select auth.uid()) = user_id);

-- El administrador lee todo (para reportes).
drop policy if exists "tiempo admin lectura" on public.tiempo_curso;
create policy "tiempo admin lectura" on public.tiempo_curso
  for select using (
    (select es_admin from public.perfiles where id = (select auth.uid()))
  );

-- Sin policies de insert/update: la escritura SOLO ocurre vía el RPC
-- security definer de abajo, nunca por PostgREST directo.

-- RPC: incrementa el tiempo activo del usuario actual en un curso.
-- p_segundos se acota a [0, 120] para que un cliente manipulado no pueda
-- inflar el contador más allá de una ventana de flush razonable.
create or replace function public.registrar_tiempo_curso(p_curso_id uuid, p_segundos int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_secs int  := greatest(0, least(coalesce(p_segundos, 0), 120));
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;
  if v_secs = 0 then
    return;
  end if;

  insert into public.tiempo_curso (user_id, curso_id, segundos_activos, actualizado_en)
  values (v_user, p_curso_id, v_secs, now())
  on conflict (user_id, curso_id)
  do update set
    segundos_activos = public.tiempo_curso.segundos_activos + excluded.segundos_activos,
    actualizado_en   = now();
end;
$$;

grant execute on function public.registrar_tiempo_curso(uuid, int) to authenticated;
