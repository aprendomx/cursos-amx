-- =========================================================================
-- Migration 061: folio no enumerable + límite de tasa en la verificación
-- =========================================================================
-- El folio se generaba así (012_emitir_constancia_extensions.sql:38):
--
--   'CON-' || YYYY || '-' || upper(substr(curso_id,1,4)) || '-' ||
--   lpad(floor(random()*99999), 5, '0')
--
-- Tres problemas:
--
--  (a) ENUMERABLE. El año es obvio y el prefijo del curso es público (va en
--      la URL /curso/:id). Solo quedan 100 000 sufijos. La RPC pública
--      verificar_constancia() —concedida a anon, sin límite de tasa— devuelve
--      nombre completo y curso. 100 000 peticiones = padrón de egresados.
--
--  (b) NO CRIPTOGRÁFICO. random() es un PRNG predecible, no pgcrypto.
--
--  (c) COLISIONES. `folio` es unique, pero el ON CONFLICT apunta a
--      (user_id, curso_id). Con 100 000 valores, la probabilidad de colisión
--      pasa del 50% hacia la constancia ~372 (paradoja del cumpleaños). Una
--      colisión lanzaba unique_violation sin capturar DENTRO de
--      marcar_leccion_completada, revirtiendo también el registro del
--      progreso: el alumno terminaba el curso, no obtenía constancia y perdía
--      la marca de la última lección.
--
-- Los folios YA EMITIDOS no se tocan: están impresos y en circulación. Esta
-- migración solo cambia cómo se generan los nuevos.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Generación de folio: 48 bits de pgcrypto, agrupados para teclear
-- ---------------------------------------------------------------------
create or replace function public.generar_folio_constancia()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  -- CON-2026-A3F1-9B2C-7D04 · 6 bytes = 2.8e14 combinaciones.
  -- Hexadecimal a propósito: sin las letras O/I/L, que se confunden al
  -- transcribir un folio a mano desde un PDF impreso.
  select 'CON-' || to_char(now(), 'YYYY') || '-' ||
         upper(
           substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
         )
  from (select encode(extensions.gen_random_bytes(6), 'hex') as h) s;
$$;

revoke all on function public.generar_folio_constancia() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Emisión con reintento ante colisión
-- ---------------------------------------------------------------------
create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso  uuid;
  v_total  int;
  v_hechas int;
  v_intento int := 0;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m   on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  if v_curso is null then return; end if;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_total = 0 or v_hechas < v_total then
    return;
  end if;

  -- Ya la tiene: nada que hacer (y nunca se le cambia el folio).
  if exists (select 1 from public.constancias
              where user_id = p_user and curso_id = v_curso) then
    return;
  end if;

  -- Reintento acotado: una colisión de folio es astronómicamente improbable
  -- con 48 bits, pero si ocurre NO debe tumbar la transacción que la llamó.
  loop
    v_intento := v_intento + 1;
    begin
      insert into public.constancias (user_id, curso_id, folio, hash_verif)
      values (
        p_user,
        v_curso,
        public.generar_folio_constancia(),
        encode(extensions.gen_random_bytes(16), 'hex')
      )
      on conflict (user_id, curso_id) do nothing;
      return;
    exception when unique_violation then
      if v_intento >= 5 then
        raise warning 'no se pudo generar folio único para % / % tras % intentos',
          p_user, v_curso, v_intento;
        return;   -- se prefiere no emitir a revertir el progreso del alumno
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Límite de tasa de la verificación pública
-- ---------------------------------------------------------------------
create table if not exists public.verificacion_rate (
  bucket         text primary key,
  ventana_inicio timestamptz not null default now(),
  intentos       int not null default 0
);

alter table public.verificacion_rate enable row level security;
-- Sin políticas a propósito: solo escribe la función security definer.
comment on table public.verificacion_rate is
  'Contador por IP para verificar_constancia(). Sin políticas RLS: solo la '
  'RPC security definer la toca. Ver migración 061.';

create or replace function public.verificacion_rate_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_bucket   text;
  v_ventana  interval := interval '1 minute';
  v_max      int := 20;
  v_inicio   timestamptz;
  v_intentos int;
begin
  -- PostgREST expone las cabeceras de la petición en request.headers.
  -- Si no hay IP (llamada interna, o un proxy que no la reenvía) se cae a un
  -- bucket global: sigue frenando la enumeración masiva, que es el objetivo.
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_bucket := coalesce(split_part(v_ip, ',', 1), 'global');

  insert into public.verificacion_rate (bucket, ventana_inicio, intentos)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update set
    ventana_inicio = case
      when public.verificacion_rate.ventana_inicio < now() - v_ventana
        then now() else public.verificacion_rate.ventana_inicio end,
    intentos = case
      when public.verificacion_rate.ventana_inicio < now() - v_ventana
        then 1 else public.verificacion_rate.intentos + 1 end
  returning ventana_inicio, intentos into v_inicio, v_intentos;

  if v_intentos > v_max then
    raise exception 'demasiadas verificaciones, intenta en un minuto'
      using errcode = '53400';
  end if;

  -- Poda oportunista: sin esto la tabla crece con cada IP que pase por aquí.
  if random() < 0.01 then
    delete from public.verificacion_rate
     where ventana_inicio < now() - interval '1 hour';
  end if;
end $$;

revoke all on function public.verificacion_rate_check() from public, anon, authenticated;

-- Se mantiene la firma de retorno: VerificarPage.vue consume estos campos.
create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio          text,
  emitida_en     timestamptz,
  hash_verif     text,
  nombre_persona text,
  titulo_curso   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verificacion_rate_check();

  return query
    select co.folio, co.emitida_en, co.hash_verif, p.nombres_completos, cu.titulo
    from public.constancias co
    join public.perfiles p on p.id = co.user_id
    join public.cursos cu  on cu.id = co.curso_id
    where co.folio = p_folio
    limit 1;
end $$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;
