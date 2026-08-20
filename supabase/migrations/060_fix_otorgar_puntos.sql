-- =========================================================================
-- Migration 060: corregir otorgar_puntos (bug de runtime en 040)
-- =========================================================================
-- 040_triggers_puntos.sql declara `p_fuente_id text`, pero la columna
-- public.log_puntos.fuente_id es `uuid` (039_gamificacion.sql), y los cuatro
-- triggers le pasan un uuid (new.leccion_id / new.id).
--
-- PostgreSQL no convierte uuid -> text implícitamente al resolver funciones,
-- así que la llamada del trigger fallaba con:
--     function public.otorgar_puntos(uuid, unknown, uuid, integer, unknown)
--     does not exist
--
-- Efecto en producción: `trg_puntos_leccion` corre AFTER UPDATE OF completado
-- sobre `progreso`, y NO consulta el feature flag de gamificación. Como el
-- reproductor siempre crea la fila de progreso antes (guardar_posicion),
-- completar una lección es siempre un UPDATE: es decir, COMPLETAR CUALQUIER
-- LECCIÓN devolvía error. La migración 040 se aplica sin problema — el fallo
-- es de ejecución, por eso ninguna prueba de esquema lo veía.
--
-- Se corrige la firma (uuid) y se recrean los triggers que la referencian.
-- =========================================================================

drop function if exists public.otorgar_puntos(uuid, text, text, int, text);

create or replace function public.otorgar_puntos(
  p_usuario_id  uuid,
  p_fuente_tipo text,
  p_fuente_id   uuid default null,
  p_puntos      int  default 0,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_usuario_id <> auth.uid() and not public.is_admin() then
    raise exception 'No autorizado para otorgar puntos a este usuario'
      using errcode = '42501';
  end if;

  if p_fuente_tipo not in (
    'leccion_completada', 'quiz_aprobado', 'foro_post', 'entrega_tiempo',
    'badge_desbloqueado', 'login_diario', 'streak'
  ) then
    raise exception 'Tipo de fuente no válido: %', p_fuente_tipo;
  end if;

  insert into public.log_puntos (usuario_id, fuente_tipo, fuente_id, puntos, descripcion)
  values (p_usuario_id, p_fuente_tipo, p_fuente_id, p_puntos, p_descripcion)
  on conflict (usuario_id, fuente_tipo, fuente_id) where fuente_id is not null
    do nothing;
end $$;

grant execute on function public.otorgar_puntos(uuid, text, uuid, int, text) to authenticated;

-- Los triggers guardan la referencia por OID de función, pero sus cuerpos
-- resuelven otorgar_puntos por nombre en cada ejecución. Se recrean para que
-- queden compilados contra la firma nueva y para dejar constancia de cuáles
-- estaban afectados.
create or replace function public.trg_puntos_leccion_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.completado is false and new.completado is true then
    perform public.otorgar_puntos(
      new.user_id, 'leccion_completada', new.leccion_id, 10, 'Lección completada');
  end if;
  return new;
end $$;
