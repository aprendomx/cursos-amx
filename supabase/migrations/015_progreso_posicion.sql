-- ==========================================================
-- Migration 015: actualizado_en column + guardar_posicion RPC
-- Video playback position tracking for HLS support
-- ==========================================================

-- Add actualizado_en timestamp to progreso table
-- (segundos_vistos already exists from 001_schema.sql)
alter table public.progreso
  add column if not exists actualizado_en timestamptz not null default now();

-- Atomic upsert RPC for video position tracking
-- Never decreases segundos_vistos (monotonic progress)
-- Called by player on throttled timeupdate (5s cadence)
-- Returns void to keep payload minimal
create or replace function public.guardar_posicion(
  p_leccion uuid,
  p_segundos int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  insert into public.progreso (user_id, leccion_id, segundos_vistos, actualizado_en, completado)
  values (auth.uid(), p_leccion, greatest(p_segundos, 0), now(), false)
  on conflict (user_id, leccion_id) do update
    set segundos_vistos = greatest(excluded.segundos_vistos, public.progreso.segundos_vistos),
        actualizado_en = now();
end $$;

-- RLS: only authenticated users can call guardar_posicion
revoke all on function public.guardar_posicion(uuid, int) from public;
grant execute on function public.guardar_posicion(uuid, int) to authenticated;
