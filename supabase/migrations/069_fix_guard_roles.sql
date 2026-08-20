-- =========================================================================
-- Migration 069: corrige el blindaje de roles de la migración 057
-- =========================================================================
-- 057 hace:
--
--   revoke update (es_admin, es_instructor) on public.perfiles
--     from authenticated, anon;
--
-- y lo describe como "la defensa real". ES FALSO, y se comprobó en la
-- instalación de aprendo.mx: después de aplicar 057,
--
--   has_column_privilege('authenticated','public.perfiles','es_admin','UPDATE')
--
-- sigue devolviendo true. El motivo es que Supabase concede UPDATE a nivel de
-- TABLA sobre todo `public` a los roles anon/authenticated, y en PostgreSQL un
-- REVOKE de columna no anula un GRANT de tabla: mientras exista el privilegio
-- amplio, se aplica a todas las columnas.
--
-- Lo que sí bloquea la escalada —verificado en producción— es el trigger
-- perfiles_guard_roles, también de 057. Esta migración no cambia el
-- comportamiento: lo hace explícito, refuerza el trigger y deja constancia de
-- por qué el REVOKE no es suficiente, para que nadie lo retire creyendo que
-- basta con él.
--
-- NO se revoca el UPDATE de tabla: `authenticated` necesita poder actualizar
-- su propio perfil (nombre, teléfono, cargo) y un administrador necesita poder
-- marcar es_instructor desde el panel. Restringirlo por columnas obligaría a
-- mantener la lista de columnas editables en dos sitios y rompería el panel en
-- cuanto se añada una.
-- =========================================================================

-- El trigger es la defensa. Se recrea con dos mejoras:
--   * cubre también INSERT: sin esto, una fila podía nacer con es_admin=true
--     si algún día se abriera una política de INSERT sobre perfiles;
--   * mensaje uniforme, que src/lib/errors.ts ya traduce.
create or replace function public.perfiles_guard_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_previo      boolean := coalesce(old.es_admin, false);
  v_instructor_previo boolean := coalesce(old.es_instructor, false);
begin
  if tg_op = 'INSERT' then
    v_admin_previo := false;
    v_instructor_previo := false;
  end if;

  if coalesce(new.es_admin, false) is distinct from v_admin_previo
     or coalesce(new.es_instructor, false) is distinct from v_instructor_previo then
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
  before insert or update on public.perfiles
  for each row execute function public.perfiles_guard_roles();

comment on function public.perfiles_guard_roles() is
  'ÚNICA defensa efectiva contra la escalada de privilegios en perfiles. El '
  'revoke de columna de la migración 057 NO sirve: Supabase concede UPDATE a '
  'nivel de tabla y un revoke de columna no lo anula. No retirar este trigger.';
