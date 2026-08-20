-- =========================================================================
-- Migration 068: límite de tasa compartido para las Edge Functions
-- =========================================================================
-- supabase/functions/_shared/rateLimit.ts era un Map en memoria del isolate:
--
--   * se reinicia en cada cold start (frecuentes en Deno Deploy y en el
--     runtime self-hosted, que recicla isolates);
--   * no comparte estado entre isolates, así que N isolates concurrentes
--     admiten N × MAX_REQUESTS peticiones;
--   * el fallback de IP era la cadena literal 'unknown' cuando no había
--     x-forwarded-for, metiendo a todos los clientes en el mismo cubo.
--
-- En la práctica no limitaba nada. Aquí va el contador compartido: una tabla,
-- accesible solo con service_role, que es lo que usan las Edge Functions.
--
-- Generaliza el mecanismo que la migración 061 introdujo para
-- verificar_constancia, que ahora delega aquí.
-- =========================================================================

create table if not exists public.rate_limit (
  scope          text not null,
  bucket         text not null,
  ventana_inicio timestamptz not null default now(),
  intentos       int not null default 0,
  primary key (scope, bucket)
);

comment on table public.rate_limit is
  'Contador de peticiones por (scope, bucket). scope = función o endpoint; '
  'bucket = IP o identificador de usuario. Sin políticas RLS: solo la RPC '
  'security definer la toca, y esa RPC solo la puede llamar service_role.';

alter table public.rate_limit enable row level security;

create index if not exists rate_limit_ventana_idx on public.rate_limit(ventana_inicio);

-- ---------------------------------------------------------------------
-- Comprobación atómica
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_check(
  p_scope       text,
  p_bucket      text,
  p_max         int  default 60,
  p_ventana_seg int  default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana  interval := make_interval(secs => greatest(p_ventana_seg, 1));
  v_bucket   text := coalesce(nullif(trim(p_bucket), ''), 'desconocido');
  v_inicio   timestamptz;
  v_intentos int;
begin
  -- El upsert hace el conteo y la rotación de ventana en UNA sentencia: dos
  -- peticiones simultáneas no pueden leer el mismo valor y escribir encima.
  insert into public.rate_limit (scope, bucket, ventana_inicio, intentos)
  values (p_scope, v_bucket, now(), 1)
  on conflict (scope, bucket) do update set
    ventana_inicio = case
      when public.rate_limit.ventana_inicio < now() - v_ventana
        then now() else public.rate_limit.ventana_inicio end,
    intentos = case
      when public.rate_limit.ventana_inicio < now() - v_ventana
        then 1 else public.rate_limit.intentos + 1 end
  returning ventana_inicio, intentos into v_inicio, v_intentos;

  -- Poda oportunista: sin esto la tabla crece con cada IP que pase por aquí.
  if random() < 0.005 then
    delete from public.rate_limit where ventana_inicio < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed',     v_intentos <= p_max,
    'remaining',   greatest(p_max - v_intentos, 0),
    'reset_at',    v_inicio + v_ventana,
    'retry_after', greatest(ceil(extract(epoch from (v_inicio + v_ventana - now())))::int, 1)
  );
end $$;

-- Solo service_role: las Edge Functions. Un cliente no debe poder consumir ni
-- inspeccionar los contadores de otros.
revoke all on function public.rate_limit_check(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- verificar_constancia pasa a usar el contador compartido
-- ---------------------------------------------------------------------
create or replace function public.verificacion_rate_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text;
  v_res jsonb;
begin
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  v_res := public.rate_limit_check(
    'verificar_constancia',
    coalesce(split_part(v_ip, ',', 1), 'global'),
    20, 60
  );

  if not (v_res ->> 'allowed')::boolean then
    raise exception 'demasiadas verificaciones, intenta en un minuto'
      using errcode = '53400';
  end if;
end $$;

-- La tabla propia de 061 queda obsoleta.
drop table if exists public.verificacion_rate;
