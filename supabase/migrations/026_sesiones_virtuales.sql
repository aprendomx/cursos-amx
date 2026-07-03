-- =========================================================
-- Migration 026: aulas virtuales con Jitsi
-- =========================================================
-- Módulo 4 del plan LMS.
--
--  * sesiones_virtuales: sesiones de videoconferencia por curso
--    estado: programada → en_vivo → terminada
--  * El instructor crea/edita/borra las de sus cursos (RLS directa).
--  * Las transiciones de estado van por RPC:
--      iniciar_sesion_virtual()   genera jitsi_room_id 'lms-{uuid}'
--                                 server-side (único) y marca en_vivo
--      terminar_sesion_virtual()  marca terminada + grabacion_url
--  * Realtime: la tabla se publica para que los alumnos vean el
--    pase a "en vivo" sin recargar.
-- =========================================================

create table if not exists public.sesiones_virtuales (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  instructor_id uuid not null references public.perfiles(id),
  titulo        text not null check (char_length(titulo) between 1 and 200),
  programada_en timestamptz not null,
  jitsi_room_id text unique,
  estado        text not null default 'programada'
                  check (estado in ('programada','en_vivo','terminada')),
  grabacion_url text,
  iniciada_en   timestamptz,
  terminada_en  timestamptz,
  creado_en     timestamptz not null default now()
);
create index if not exists sesiones_virtuales_curso_idx
  on public.sesiones_virtuales(curso_id, estado, programada_en desc);

-- ---------- RLS ----------
alter table public.sesiones_virtuales enable row level security;

drop policy if exists "sesiones: leer" on public.sesiones_virtuales;
create policy "sesiones: leer"
  on public.sesiones_virtuales for select to authenticated
  using (public.esta_inscrito(curso_id) or public.is_instructor_de(curso_id));

drop policy if exists "sesiones: instructor crear" on public.sesiones_virtuales;
create policy "sesiones: instructor crear"
  on public.sesiones_virtuales for insert to authenticated
  with check (public.is_instructor_de(curso_id) and instructor_id = auth.uid());

drop policy if exists "sesiones: instructor editar" on public.sesiones_virtuales;
create policy "sesiones: instructor editar"
  on public.sesiones_virtuales for update to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));

drop policy if exists "sesiones: instructor borrar" on public.sesiones_virtuales;
create policy "sesiones: instructor borrar"
  on public.sesiones_virtuales for delete to authenticated
  using (public.is_instructor_de(curso_id));

-- ---------- RPCs de transición de estado ----------
create or replace function public.iniciar_sesion_virtual(p_sesion uuid)
returns public.sesiones_virtuales
language plpgsql security definer set search_path = public as $$
declare v_row public.sesiones_virtuales;
begin
  select * into v_row from public.sesiones_virtuales where id = p_sesion;
  if not found then
    raise exception 'sesión no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;
  if v_row.estado = 'terminada' then
    raise exception 'la sesión ya terminó';
  end if;

  update public.sesiones_virtuales
    set estado = 'en_vivo',
        iniciada_en = coalesce(iniciada_en, now()),
        jitsi_room_id = coalesce(jitsi_room_id, 'lms-' || gen_random_uuid())
    where id = p_sesion
    returning * into v_row;

  return v_row;
end $$;

create or replace function public.terminar_sesion_virtual(
  p_sesion        uuid,
  p_grabacion_url text default null
)
returns public.sesiones_virtuales
language plpgsql security definer set search_path = public as $$
declare v_row public.sesiones_virtuales;
begin
  select * into v_row from public.sesiones_virtuales where id = p_sesion;
  if not found then
    raise exception 'sesión no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;
  if v_row.estado <> 'en_vivo' then
    raise exception 'solo se puede terminar una sesión en vivo';
  end if;

  update public.sesiones_virtuales
    set estado = 'terminada',
        terminada_en = now(),
        grabacion_url = coalesce(p_grabacion_url, grabacion_url)
    where id = p_sesion
    returning * into v_row;

  return v_row;
end $$;

grant execute on function public.iniciar_sesion_virtual(uuid)        to authenticated;
grant execute on function public.terminar_sesion_virtual(uuid, text) to authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.sesiones_virtuales;
