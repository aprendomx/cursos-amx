-- =========================================================================
-- Migration 057: blindaje de roles en perfiles + RLS en dependencias
-- =========================================================================
-- Cierra dos huecos que permitían escalada de privilegios y escritura
-- anónima al catálogo:
--
--  (1) `perfiles: actualizar el propio` (001_schema.sql:183) restringe la
--      FILA, no las COLUMNAS. es_admin y es_instructor viven en esa fila,
--      así que cualquier usuario autenticado podía volverse administrador
--      con un PATCH /rest/v1/perfiles?id=eq.<su-uuid>.
--
--  (2) public.dependencias nunca recibió `enable row level security`, con
--      lo que su política de lectura (003) era inerte y la tabla quedaba
--      expuesta a los GRANT por defecto del schema public.
-- =========================================================================

-- ---------------------------------------------------------------------
-- (1) perfiles: los campos de rol solo los cambia un administrador
-- ---------------------------------------------------------------------

-- OJO: este revoke NO es suficiente por sí solo, aunque lo parezca.
-- Supabase concede UPDATE a nivel de TABLA sobre todo `public` a los roles
-- anon/authenticated, y en PostgreSQL un revoke de COLUMNA no anula un grant
-- de TABLA. Se conserva como capa adicional, pero la defensa efectiva es el
-- trigger de más abajo. Ver la migración 069, que lo documenta y lo refuerza.
revoke update (es_admin, es_instructor) on public.perfiles from authenticated, anon;

-- DEFENSA EFECTIVA. Es lo único que bloquea de verdad la escalada, verificado
-- en producción. No lo retires pensando que basta con el revoke de arriba.
create or replace function public.perfiles_guard_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.es_admin is distinct from old.es_admin
     or new.es_instructor is distinct from old.es_instructor then
    -- auth.uid() nulo = no hay sesión de PostgREST: es el propio backend
    -- (migraciones, worker, service_role, psql del operador). Se permite.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'no autorizado para modificar es_admin/es_instructor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists perfiles_guard_roles on public.perfiles;
create trigger perfiles_guard_roles
  before update on public.perfiles
  for each row execute function public.perfiles_guard_roles();

-- ---------------------------------------------------------------------
-- (2) dependencias: habilitar RLS (la política de lectura ya viene de 003)
-- ---------------------------------------------------------------------
alter table public.dependencias enable row level security;

-- Catálogo: lo lee cualquiera (lo necesita el formulario de registro, que
-- se llena antes de tener sesión), lo escribe solo un administrador.
drop policy if exists "dependencias: leer" on public.dependencias;
create policy "dependencias: leer" on public.dependencias
  for select using (true);

drop policy if exists "dependencias: admin escribir" on public.dependencias;
create policy "dependencias: admin escribir" on public.dependencias
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
