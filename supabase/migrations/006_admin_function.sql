-- ==========================================================
-- Fix robusto: usar funcion security definer para chequear
-- es_admin sin depender de RLS recursiva sobre perfiles.
-- ==========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select es_admin from public.perfiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- Cursos
drop policy if exists "cursos: admin" on public.cursos;
drop policy if exists "cursos: admin write" on public.cursos;
create policy "cursos: admin write"
  on public.cursos
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Modulos
drop policy if exists "modulos: admin" on public.modulos;
drop policy if exists "modulos: admin write" on public.modulos;
create policy "modulos: admin write"
  on public.modulos
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Lecciones
drop policy if exists "lecciones: admin" on public.lecciones;
drop policy if exists "lecciones: admin write" on public.lecciones;
create policy "lecciones: admin write"
  on public.lecciones
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
