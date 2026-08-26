-- 002 — Hábito y recompensa: racha diaria derivada y notas por lección.
--
-- Autorizada en la fase 0 de docs/propuesta-visual-aprendo.md. Dos piezas:
--
-- 1) RACHA. No se persiste nada nuevo: los «días activos» se DERIVAN de la
--    actividad que ya se registra (lecciones completadas, eventos de video,
--    intentos de evaluación, foros). Cero escrituras nuevas significa cero
--    mantenimiento de un contador que se desincroniza.
--
--    El corte de día se hace en la zona horaria de la plataforma y no en UTC:
--    con date(timestamptz) a secas, estudiar de 18:00 a 23:59 hora de México
--    (UTC−6) contaba como el día SIGUIENTE y una racha honesta era imposible.
--
--    Además se define public.streak_dias_usuario, que badgeEngine.js invoca
--    desde siempre para el badge «Constante — 7 días consecutivos» y que
--    hasta hoy no existía en el esquema: el badge era inalcanzable.
--
-- 2) NOTAS POR LECCIÓN, con el segundo del video en que se tomaron
--    (`segundo_video`, mismo patrón que video_eventos.tiempo_video). RLS de
--    dueño en las cuatro operaciones: las notas son privadas.

-- ---------------------------------------------------------------------
-- Zona horaria de la plataforma. Una sola definición: quien despliegue en
-- otro huso cambia solo esta función.

create or replace function public.zona_horaria_plataforma()
returns text language sql immutable as $$
  select 'America/Mexico_City'
$$;

-- ---------------------------------------------------------------------
-- Días con actividad de una persona, en fecha local de la plataforma.
--
-- security definer y no una vista con security_invoker: las fuentes tienen
-- políticas que dejan leer a administración e instructores filas ajenas, y
-- una vista heredaría esa mezcla. La función fija el contrato — solo la
-- propia persona (o un admin) puede pedir los días de un user_id — y lee las
-- fuentes como dueño, así que la racha no se apaga si un módulo (foros) se
-- cierra después por feature flag: tu actividad pasada sigue contando.

create or replace function public.dias_activos_usuario(p_user_id uuid)
returns table (fecha date)
language sql stable security definer set search_path = public as $$
  select distinct dia from (
    select (p.completado_en at time zone public.zona_horaria_plataforma())::date as dia
    from public.progreso p
    where p.user_id = p_user_id and p.completado and p.completado_en is not null
    union all
    select (v.creado_en at time zone public.zona_horaria_plataforma())::date
    from public.video_eventos v
    where v.user_id = p_user_id
    union all
    select (i.creado_en at time zone public.zona_horaria_plataforma())::date
    from public.intentos_evaluacion i
    where i.user_id = p_user_id
    union all
    select (h.creado_en at time zone public.zona_horaria_plataforma())::date
    from public.foro_hilos h
    where h.autor_id = p_user_id
    union all
    select (r.creado_en at time zone public.zona_horaria_plataforma())::date
    from public.foro_respuestas r
    where r.autor_id = p_user_id
  ) t
  where dia is not null
    and (p_user_id = auth.uid() or public.is_admin())
$$;

revoke all on function public.dias_activos_usuario(uuid) from public;
grant execute on function public.dias_activos_usuario(uuid) to authenticated;

comment on function public.dias_activos_usuario(uuid) is
  'Días (fecha local de la plataforma) con actividad registrada. Solo la propia persona o un admin.';

-- ---------------------------------------------------------------------
-- Racha: días consecutivos terminando hoy o ayer (ayer, porque a las 00:01
-- de un día sin actividad todavía no has «roto» nada: te queda el día entero
-- para continuarla), y la mejor racha histórica.

create or replace function public.racha_usuario(p_user_id uuid)
returns table (racha_actual int, mejor_racha int, activo_hoy boolean)
language sql stable security definer set search_path = public as $$
  with dias as (
    select fecha, row_number() over (order by fecha) as rn
    from public.dias_activos_usuario(p_user_id)
  ),
  -- Gaps and islands: fecha - rn es constante dentro de cada tramo de días
  -- consecutivos. (rn::int: row_number devuelve bigint y `date - bigint` no
  -- existe como operador.)
  islas as (
    select count(*)::int as largo, max(fecha) as fin
    from dias
    group by fecha - rn::int
  ),
  hoy as (
    select (now() at time zone public.zona_horaria_plataforma())::date as d
  )
  select
    coalesce((select largo from islas, hoy where fin >= hoy.d - 1 order by fin desc limit 1), 0),
    coalesce((select max(largo) from islas), 0),
    exists (select 1 from dias, hoy where fecha = hoy.d)
$$;

revoke all on function public.racha_usuario(uuid) from public;
grant execute on function public.racha_usuario(uuid) to authenticated;

comment on function public.racha_usuario(uuid) is
  'Racha actual (viva si hubo actividad hoy o ayer), mejor racha y si hoy ya cuenta.';

-- ---------------------------------------------------------------------
-- El contrato que badgeEngine.js ya invoca (criterio streak_dias del badge
-- «Constante»): ¿lleva esta persona al menos p_dias consecutivos?

create or replace function public.streak_dias_usuario(p_user_id uuid, p_dias int)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.racha_actual >= p_dias from public.racha_usuario(p_user_id) r),
    false
  )
$$;

revoke all on function public.streak_dias_usuario(uuid, int) from public;
grant execute on function public.streak_dias_usuario(uuid, int) to authenticated;

comment on function public.streak_dias_usuario(uuid, int) is
  'true si la racha actual alcanza p_dias. Lo consume badgeEngine.js (badge «Constante»).';

-- ---------------------------------------------------------------------
-- Notas por lección, con marca de tiempo de video opcional.

create table public.notas_leccion (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  leccion_id     uuid not null references public.lecciones(id) on delete cascade,
  contenido      text not null check (char_length(contenido) between 1 and 4000),
  -- Segundo del video al tomar la nota. Nullable: las lecciones de lectura o
  -- examen no tienen línea de tiempo. Mismo patrón que video_eventos.tiempo_video.
  segundo_video  int check (segundo_video >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index notas_leccion_usuario_idx
  on public.notas_leccion(user_id, leccion_id, creado_en desc);

create or replace function public.notas_leccion_touch_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

create trigger notas_leccion_set_actualizado_en before update on public.notas_leccion
  for each row execute function public.notas_leccion_touch_actualizado_en();

alter table public.notas_leccion enable row level security;

-- Privadas: ni instructores ni administración. Una nota es un cuaderno
-- personal, no una entrega.
create policy "notas: leer propias" on public.notas_leccion
  for select to authenticated using (auth.uid() = user_id);
create policy "notas: crear propias" on public.notas_leccion
  for insert to authenticated with check (auth.uid() = user_id);
create policy "notas: editar propias" on public.notas_leccion
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notas: borrar propias" on public.notas_leccion
  for delete to authenticated using (auth.uid() = user_id);

comment on table public.notas_leccion is
  'Notas personales por lección, con el segundo del video en que se tomaron. Privadas por RLS.';
