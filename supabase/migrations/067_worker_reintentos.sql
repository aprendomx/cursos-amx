-- =========================================================================
-- Migration 067: reintentos de los jobs de video
-- =========================================================================
-- runJob() mandaba cualquier excepción directo a status='failed', que es un
-- estado terminal: un corte de red al descargar el origen mataba el job de
-- forma definitiva y hacía falta intervención manual para reencolarlo.
-- =========================================================================

alter table public.videos
  add column if not exists intentos int not null default 0,
  add column if not exists ultimo_error_en timestamptz;

comment on column public.videos.intentos is
  'Veces que se ha intentado transcodificar. El worker reencola hasta '
  'JOB_MAX_RETRIES antes de marcar failed definitivamente.';

-- Jobs que fallaron de forma definitiva: es la consulta para el operador.
create or replace view public.v_videos_fallidos as
select v.id, v.leccion_id, l.titulo as leccion, v.intentos,
       v.error_msg, v.ultimo_error_en, v.creado_en
from public.videos v
left join public.lecciones l on l.id = v.leccion_id
where v.status = 'failed'
order by v.ultimo_error_en desc nulls last;

grant select on public.v_videos_fallidos to authenticated;
