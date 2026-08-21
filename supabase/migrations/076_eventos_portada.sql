-- 076: eventos de portada — el canal de ingesta anónima.
--
-- La portada se va a reequilibrar (el curso vende, la constancia cierra) y esa
-- decisión debe poder evaluarse con datos propios: cuántas personas pasan del
-- hero a un curso, del curso al detalle y del detalle al registro. Quienes
-- recorren ese embudo son visitantes SIN sesión, así que el canal existente no
-- sirve: video_eventos exige usuario autenticado.
--
-- El diseño repite el de la otra superficie pública anónima que ya existe, la
-- verificación de constancias (068): RPC con SECURITY DEFINER, lista blanca,
-- límite por IP con el contador compartido, y una tabla que el rol anónimo no
-- puede leer. Anónimo ESCRIBE por la puerta estrecha; solo administración LEE.

create table if not exists public.portada_eventos (
  id         bigint generated always as identity primary key,
  evento     text not null,
  -- Sección de origen y posición de la tarjeta: lo mínimo para el embudo.
  seccion    text,
  posicion   int,
  -- Identificador de visita generado en el navegador, aleatorio, sin relación
  -- con la persona. Permite contar recorridos, no identificar a nadie.
  visita     uuid,
  creado_en  timestamptz not null default now(),
  -- La lista blanca vive como restricción, no solo en la RPC: aunque alguien
  -- consiguiera otra vía de inserción, no puede inventar eventos.
  constraint portada_eventos_evento_valido check (
    evento in (
      'portada_hero_cta',
      'portada_curso_click',
      'curso_detalle_visto',
      'registro_iniciado',
      'registro_completado',
      'leccion_probada',
      'registro_desde_leccion'
    )
  ),
  constraint portada_eventos_seccion_corta check (seccion is null or length(seccion) <= 40),
  constraint portada_eventos_posicion_sana check (posicion is null or posicion between 0 and 999)
);

comment on table public.portada_eventos is
  'Embudo de la portada: eventos anónimos, sin datos personales. Ingesta solo por registrar_evento_portada().';

alter table public.portada_eventos enable row level security;

-- Nadie inserta directo: ni anon ni authenticated. La única puerta es la RPC,
-- que es donde vive el límite por IP.
create policy "portada_eventos: admin lee"
  on public.portada_eventos for select to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()));

create index if not exists portada_eventos_semana_idx
  on public.portada_eventos (evento, creado_en);

-- ---------------------------------------------------------------------

create or replace function public.registrar_evento_portada(
  p_evento   text,
  p_seccion  text default null,
  p_posicion int  default null,
  p_visita   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text;
  v_res jsonb;
begin
  -- Límite por IP con el contador compartido (068). 120 eventos/minuto por IP
  -- es holgado para navegación real y estrecho para una inundación.
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  v_res := public.rate_limit_check(
    'evento_portada',
    coalesce(split_part(v_ip, ',', 1), 'global'),
    120, 60
  );

  if not (v_res ->> 'allowed')::boolean then
    -- Silencio deliberado: un evento de analítica jamás debe romper la página
    -- ni darle a un abusador la confirmación de que el límite existe.
    return;
  end if;

  insert into public.portada_eventos (evento, seccion, posicion, visita)
  values (p_evento, left(p_seccion, 40), p_posicion, p_visita);
exception when check_violation then
  -- Evento fuera de la lista blanca: se descarta sin ruido, por lo mismo.
  return;
end $$;

revoke all on function public.registrar_evento_portada(text, text, int, uuid)
  from public;
grant execute on function public.registrar_evento_portada(text, text, int, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- La pregunta que este canal existe para responder: ¿dónde se cae la gente?

create or replace view public.v_embudo_portada
with (security_invoker = true) as
select
  date_trunc('week', creado_en)::date as semana,
  count(*) filter (where evento = 'portada_hero_cta')      as hero_cta,
  count(*) filter (where evento = 'portada_curso_click')   as curso_click,
  count(*) filter (where evento = 'curso_detalle_visto')   as detalle_visto,
  count(*) filter (where evento = 'registro_iniciado')     as registro_iniciado,
  count(*) filter (where evento = 'registro_completado')   as registro_completado,
  count(*) filter (where evento = 'leccion_probada')       as leccion_probada,
  count(*) filter (where evento = 'registro_desde_leccion') as registro_desde_leccion
from public.portada_eventos
group by 1
order by 1 desc;

comment on view public.v_embudo_portada is
  'Embudo semanal de la portada. security_invoker: hereda la RLS de la tabla, así que solo administración ve datos.';
