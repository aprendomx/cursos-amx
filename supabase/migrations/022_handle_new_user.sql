-- =========================================================
-- Migration 022: auto-crear public.perfiles al registrar usuario
-- =========================================================
-- Patrón canónico de Supabase: trigger en auth.users que copia los
-- datos del formulario (pasados como raw_user_meta_data desde
-- supabase.auth.signUp({ options: { data: {...} } })) a la tabla
-- public.perfiles. Corre con SECURITY DEFINER → bypassea RLS, por lo
-- que el registro no falla aunque la sesión aún no esté establecida o
-- la confirmación de correo esté activa.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si por cualquier razón ya existe (re-confirmación, doble trigger,
  -- migración manual), no rompemos el registro.
  insert into public.perfiles (
    id, nombres, apellido_paterno, apellido_materno,
    correo, telefono_movil, dependencia_id, cargo, aviso_privacidad
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Sin nombre'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Sin apellido'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono_movil',''),
    nullif(new.raw_user_meta_data->>'dependencia_id','')::int,
    nullif(new.raw_user_meta_data->>'cargo',''),
    coalesce((new.raw_user_meta_data->>'aviso_privacidad')::boolean, false)
  )
  on conflict (id) do update
    set nombres          = excluded.nombres,
        apellido_paterno = excluded.apellido_paterno,
        apellido_materno = excluded.apellido_materno,
        telefono_movil   = excluded.telefono_movil,
        dependencia_id   = excluded.dependencia_id,
        cargo            = excluded.cargo,
        aviso_privacidad = excluded.aviso_privacidad,
        actualizado_en   = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
