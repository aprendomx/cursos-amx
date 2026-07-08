-- =========================================================
-- Migration 051: Sistema de Notificaciones (Fase I)
-- =========================================================
--  * notificaciones: cola principal de notificaciones
--  * notificacion_plantillas: plantillas por tipo de evento
--  * email_configuracion: configuración singleton de email
--  * notificacion_preferencias: preferencias por usuario
--  * anuncios: anuncios publicados por instructores
--  * Triggers para 7 eventos automáticos
--  * Funciones cron para deadlines, alertas de riesgo y SLA
--  * Jobs pg_cron para ejecutar workers
-- =========================================================
--
-- ── Enum values actually used in this migration ──
--   canal:   'in_app', 'email', 'push', 'sms'
--   estado:  'pendiente', 'enviado', 'fallido', 'cancelado'
--   proveedor (email): 'sendgrid', 'mailgun', 'smtp', 'aws_ses'
--
--   NOTE: badge_usuarios.usuario_id references auth.users(id)
--         while notificaciones.usuario_id references perfiles(id).
--         They are expected to hold the same UUID, but this is a
--         latent FK mismatch that should be resolved in a future
--         migration (e.g., add a surrogate perfiles.id or unify
--         the badge table reference).
-- =========================================================

-- pg_cron es requerido para los jobs programados
create extension if not exists pg_cron;
-- pg_net es requerido para que el cron job llame al Edge Function vía HTTP
create extension if not exists pg_net;


-- ==========================================================
-- Step 1 — Tablas base
-- ==========================================================

-- ---------- Notificaciones ----------
create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  tipo        text not null,
  titulo      text not null,
  cuerpo      text,
  datos       jsonb not null default '{}',
  canal       text not null default 'in_app' check (canal in ('in_app','email','push','sms')),
  estado      text not null default 'pendiente' check (estado in ('pendiente','enviado','fallido','cancelado')),
  leido       boolean not null default false,
  enviado_en  timestamptz,
  creado_en   timestamptz not null default now()
);

create index if not exists notificaciones_usuario_idx
  on public.notificaciones(usuario_id, creado_en desc);
create index if not exists notificaciones_estado_idx
  on public.notificaciones(estado) where estado = 'pendiente';
create index if not exists notificaciones_tipo_idx
  on public.notificaciones(tipo);

comment on table public.notificaciones is 'Cola principal de notificaciones del LMS';
comment on column public.notificaciones.datos is 'Payload JSONB con contexto específico del evento';
comment on column public.notificaciones.canal is 'Canal de entrega: in_app, email, push, sms';
comment on column public.notificaciones.estado is 'Estado de entrega: pendiente, enviado, fallido, cancelado';

alter table public.notificaciones enable row level security;

drop policy if exists "notificaciones: usuario ve las propias" on public.notificaciones;
create policy "notificaciones: usuario ve las propias"
  on public.notificaciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "notificaciones: admin ve todas" on public.notificaciones;
create policy "notificaciones: admin ve todas"
  on public.notificaciones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Plantillas de notificación ----------
create table if not exists public.notificacion_plantillas (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null unique,
  asunto          text,
  titulo_template text not null,
  cuerpo_template text not null,
  canal_default   text not null default 'in_app' check (canal_default in ('in_app','email','push','sms')),
  activa          boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on table public.notificacion_plantillas is 'Plantillas de notificación por tipo de evento';

alter table public.notificacion_plantillas enable row level security;

drop policy if exists "plantillas: lectura publica" on public.notificacion_plantillas;
create policy "plantillas: lectura publica"
  on public.notificacion_plantillas for select to authenticated
  using (true);

drop policy if exists "plantillas: admin escribe" on public.notificacion_plantillas;
create policy "plantillas: admin escribe"
  on public.notificacion_plantillas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Configuración de email (singleton) ----------
create table if not exists public.email_configuracion (
  id                int primary key default 1 check (id = 1),
  proveedor         text not null check (proveedor in ('sendgrid','mailgun','smtp','aws_ses','resend')),
  api_key           text,
  remitente_email   text not null default 'noreply@cursos-amx.local',
  remitente_nombre  text not null default 'Cursos AMX',
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

comment on table public.email_configuracion is 'Configuración singleton del proveedor de email';

alter table public.email_configuracion enable row level security;

drop policy if exists "email_config: admin" on public.email_configuracion;
create policy "email_config: admin"
  on public.email_configuracion for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.email_configuracion (id, proveedor, remitente_email, remitente_nombre)
values (1, 'resend', 'noreply@cursos-amx.local', 'Cursos AMX')
on conflict (id) do nothing;


-- ---------- Preferencias de notificación por usuario ----------
create table if not exists public.notificacion_preferencias (
  usuario_id      uuid primary key references public.perfiles(id) on delete cascade,
  silenciados     text[] not null default '{}',
  canal_default   text not null default 'in_app' check (canal_default in ('in_app','email','push','sms')),
  updated_at      timestamptz not null default now()
);

comment on table public.notificacion_preferencias is 'Preferencias de notificación por usuario (tipos silenciados, canal default)';

alter table public.notificacion_preferencias enable row level security;

drop policy if exists "preferencias: usuario propio" on public.notificacion_preferencias;
create policy "preferencias: usuario propio"
  on public.notificacion_preferencias for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "preferencias: admin" on public.notificacion_preferencias;
create policy "preferencias: admin"
  on public.notificacion_preferencias for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Anuncios de instructor ----------
create table if not exists public.anuncios (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  titulo        text not null,
  cuerpo        text,
  instructor_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en     timestamptz not null default now()
);

create index if not exists anuncios_curso_idx
  on public.anuncios(curso_id, creado_en desc);

comment on table public.anuncios is 'Anuncios publicados por instructores para los cursos';

alter table public.anuncios enable row level security;

drop policy if exists "anuncios: leer inscritos" on public.anuncios;
create policy "anuncios: leer inscritos"
  on public.anuncios for select to authenticated
  using (
    public.esta_inscrito(curso_id)
    or public.is_instructor_de(curso_id)
    or public.is_admin()
  );

drop policy if exists "anuncios: instructor escribe" on public.anuncios;
create policy "anuncios: instructor escribe"
  on public.anuncios for all to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));


-- ==========================================================
-- Step 2 — Plantillas default
-- ==========================================================

insert into public.notificacion_plantillas (tipo, asunto, titulo_template, cuerpo_template, canal_default)
values
  ('curso_asignado',       'Nuevo curso asignado',           'Nuevo curso asignado',                     'Se te ha asignado al curso {{curso_titulo}}.',                               'in_app'),
  ('evaluacion_calificada','Evaluación calificada',          'Evaluación calificada',                    'Tu evaluación "{{evaluacion_titulo}}" fue calificada con {{calificacion}}.','in_app'),
  ('badge_desbloqueado',   'Nuevo badge',                    'Badge desbloqueado',                       'Desbloqueaste el badge "{{badge_nombre}}" y ganaste {{puntos}} puntos.',    'in_app'),
  ('foro_respuesta',       'Nueva respuesta en foro',        'Nueva respuesta en tu hilo',               'Hay una nueva respuesta en tu hilo del foro.',                               'in_app'),
  ('certificacion_lista',  'Certificación lista',            'Tu certificación está lista',              'Tu constancia para "{{curso_titulo}}" está disponible.',                     'in_app'),
  ('deadline_proximo',     'Deadline próximo',               'Evaluación por cerrar',                    'Tienes una evaluación que cierra pronto: "{{evaluacion_titulo}}".',          'email'),
  ('reporte_listo',        'Reporte listo',                  'Reporte listo',                            'Tu reporte "{{reporte_nombre}}" ha finalizado correctamente.',               'in_app'),
  ('alerta_riesgo',        'Alerta de riesgo',               'Estudiante con bajo progreso',             'Un estudiante tiene bajo progreso en el curso.',                              'in_app'),
  ('sla_respuesta',        'SLA de respuesta',               'Evaluaciones pendientes de calificar',     'Hay evaluaciones pendientes de calificar por más de 3 días.',               'in_app')
on conflict (tipo) do nothing;


-- ==========================================================
-- Step 3 — Función helper y triggers
-- ==========================================================

-- Helper para insertar notificaciones desde triggers respetando preferencias
create or replace function public.crear_notificacion(
  p_usuario_id uuid,
  p_tipo       text,
  p_titulo     text,
  p_cuerpo     text,
  p_datos      jsonb default '{}',
  p_canal      text default 'in_app'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_pref     public.notificacion_preferencias;
begin
  -- Si el usuario silenció este tipo, no crear notificación
  select * into v_pref
  from public.notificacion_preferencias
  where usuario_id = p_usuario_id;

  if found and p_tipo = any(v_pref.silenciados) then
    return null;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
  values (p_usuario_id, p_tipo, p_titulo, p_cuerpo, p_datos, coalesce(v_pref.canal_default, p_canal))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_notificacion(uuid, text, text, text, jsonb, text) to authenticated;


-- ---------- 1. curso_asignado ----------
create or replace function public.trg_notif_curso_asignado_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_titulo text;
begin
  select titulo into v_curso_titulo from public.cursos where id = new.curso_id;

  perform public.crear_notificacion(
    new.user_id,
    'curso_asignado',
    'Nuevo curso asignado',
    'Se te ha asignado al curso: ' || coalesce(v_curso_titulo, 'Sin título'),
    jsonb_build_object('curso_id', new.curso_id, 'inscripcion_id', new.id),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_curso_asignado on public.inscripciones;
create trigger trg_notif_curso_asignado
  after insert on public.inscripciones
  for each row
  execute function public.trg_notif_curso_asignado_fn();


-- ---------- 2. evaluacion_calificada ----------
create or replace function public.trg_notif_eval_calificada_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lec_titulo text;
begin
  if old.aprobado is false and new.aprobado is true then
    select titulo into v_lec_titulo from public.lecciones where id = new.leccion_id;

    perform public.crear_notificacion(
      new.user_id,
      'evaluacion_calificada',
      'Evaluación aprobada',
      'Aprobaste la evaluación "' || coalesce(v_lec_titulo, 'Sin título') || '" con ' || new.puntaje || '/100',
      jsonb_build_object('leccion_id', new.leccion_id, 'curso_id', new.curso_id, 'puntaje', new.puntaje),
      'in_app'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_eval_calificada on public.intentos_evaluacion;
create trigger trg_notif_eval_calificada
  after update of aprobado on public.intentos_evaluacion
  for each row
  execute function public.trg_notif_eval_calificada_fn();


-- ---------- 3. badge_desbloqueado ----------
-- NOTE: new.usuario_id comes from badge_usuarios.usuario_id which references
-- auth.users(id), while notificaciones.usuario_id references perfiles(id).
-- They are expected to hold the same UUID, but this is a latent FK mismatch.
create or replace function public.trg_notif_badge_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge_nombre text;
  v_badge_puntos int;
begin
  select nombre, puntos_otorga into v_badge_nombre, v_badge_puntos
  from public.badges where id = new.badge_id;

  perform public.crear_notificacion(
    new.usuario_id,
    'badge_desbloqueado',
    'Badge desbloqueado: ' || coalesce(v_badge_nombre, 'Nuevo logro'),
    'Desbloqueaste el badge "' || coalesce(v_badge_nombre, 'Nuevo logro') || '" y ganaste ' || coalesce(v_badge_puntos::text, '0') || ' puntos.',
    jsonb_build_object('badge_id', new.badge_id, 'badge_nombre', v_badge_nombre, 'puntos', v_badge_puntos),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_badge on public.badge_usuarios;
create trigger trg_notif_badge
  after insert on public.badge_usuarios
  for each row
  execute function public.trg_notif_badge_fn();


-- ---------- 4. foro_respuesta ----------
create or replace function public.trg_notif_foro_resp_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hilo_autor  uuid;
  v_foro_titulo text;
  v_curso_id    uuid;
begin
  select fh.autor_id, f.titulo, f.curso_id
  into v_hilo_autor, v_foro_titulo, v_curso_id
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  where fh.id = new.hilo_id;

  if v_hilo_autor is not null and v_hilo_autor <> new.autor_id then
    perform public.crear_notificacion(
      v_hilo_autor,
      'foro_respuesta',
      'Nueva respuesta en tu hilo',
      'Alguien respondió en tu hilo del foro "' || coalesce(v_foro_titulo, 'Foro') || '"',
      jsonb_build_object('hilo_id', new.hilo_id, 'respuesta_id', new.id, 'curso_id', v_curso_id, 'autor_id', new.autor_id),
      'in_app'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_foro_resp on public.foro_respuestas;
create trigger trg_notif_foro_resp
  after insert on public.foro_respuestas
  for each row
  execute function public.trg_notif_foro_resp_fn();


-- ---------- 5. anuncio_instructor ----------
create or replace function public.trg_notif_anuncio_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select user_id from public.inscripciones where curso_id = new.curso_id
  loop
    perform public.crear_notificacion(
      r.user_id,
      'anuncio_instructor',
      'Anuncio: ' || new.titulo,
      coalesce(new.cuerpo, 'Tu instructor publicó un nuevo anuncio.'),
      jsonb_build_object('curso_id', new.curso_id, 'anuncio_id', new.id, 'instructor_id', new.instructor_id),
      'in_app'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notif_anuncio on public.anuncios;
create trigger trg_notif_anuncio
  after insert on public.anuncios
  for each row
  execute function public.trg_notif_anuncio_fn();


-- ---------- 6. certificacion_lista ----------
-- (adaptado: la constancia se genera al completar todas las lecciones)
create or replace function public.trg_notif_certificacion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_titulo text;
begin
  select titulo into v_curso_titulo from public.cursos where id = new.curso_id;

  perform public.crear_notificacion(
    new.user_id,
    'certificacion_lista',
    'Certificación lista',
    'Tu constancia para "' || coalesce(v_curso_titulo, 'el curso') || '" está disponible.',
    jsonb_build_object('curso_id', new.curso_id, 'constancia_id', new.id, 'folio', new.folio),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_certificacion on public.constancias;
create trigger trg_notif_certificacion
  after insert on public.constancias
  for each row
  execute function public.trg_notif_certificacion_fn();


-- ---------- 7. reporte_listo ----------
create or replace function public.trg_notif_reporte_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id     uuid;
  v_reporte_nombre text;
begin
  if old.estado <> 'exitoso' and new.estado = 'exitoso' then
    select rp.usuario_id, rp.nombre into v_usuario_id, v_reporte_nombre
    from public.reportes_programados rp
    where rp.id = new.programado_id;

    if v_usuario_id is not null then
      perform public.crear_notificacion(
        v_usuario_id,
        'reporte_listo',
        'Reporte listo: ' || coalesce(v_reporte_nombre, 'Reporte'),
        'Tu reporte programado ha finalizado correctamente.',
        jsonb_build_object('reporte_historial_id', new.id, 'programado_id', new.programado_id, 'resultado', new.resultado_resumen),
        'in_app'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_reporte on public.reportes_historial;
create trigger trg_notif_reporte
  after update of estado on public.reportes_historial
  for each row
  execute function public.trg_notif_reporte_fn();


-- ==========================================================
-- Step 4 — Funciones cron
-- ==========================================================

-- ---------- Deadline próximo ----------
create or replace function public.notificar_deadlines_proximos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stub: no existe columna fecha_cierre en lecciones/evaluaciones.
  -- Cuando se implementen deadlines, buscar evaluaciones que cierren en <24h
  -- donde el alumno no ha completado un intento, e insertar notificación.
  null;
end;
$$;

grant execute on function public.notificar_deadlines_proximos() to authenticated;


-- ---------- Alertas de riesgo ----------
create or replace function public.notificar_alertas_riesgo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    with lecciones_por_curso as (
      select m.curso_id, count(l.id) as total
      from public.lecciones l
      join public.modulos m on m.id = l.modulo_id
      group by m.curso_id
    ),
    progreso_por_usuario_curso as (
      select p.user_id, m.curso_id, count(p.leccion_id) as completadas
      from public.progreso p
      join public.lecciones l on l.id = p.leccion_id
      join public.modulos m on m.id = l.modulo_id
      where p.completado
      group by p.user_id, m.curso_id
    ),
    riesgo as (
      select
        i.user_id as estudiante_id,
        i.curso_id,
        coalesce(ppu.completadas, 0)::numeric / nullif(lpc.total, 0) * 100 as pct
      from public.inscripciones i
      join lecciones_por_curso lpc on lpc.curso_id = i.curso_id
      left join progreso_por_usuario_curso ppu
        on ppu.user_id = i.user_id and ppu.curso_id = i.curso_id
      where i.inscrito_en < now() - interval '7 days'
        and coalesce(ppu.completadas, 0)::numeric / nullif(lpc.total, 0) < 0.5
    )
    select
      r2.estudiante_id,
      r2.curso_id,
      r2.pct,
      ci.user_id as instructor_id
    from riesgo r2
    join public.cursos_instructores ci on ci.curso_id = r2.curso_id
    where not exists (
      select 1 from public.notificaciones n
      where n.usuario_id = ci.user_id
        and n.tipo = 'alerta_riesgo'
        and n.datos->>'estudiante_id' = r2.estudiante_id::text
        and n.datos->>'curso_id' = r2.curso_id::text
        and n.creado_en > now() - interval '7 days'
    )
  loop
    perform public.crear_notificacion(
      r.instructor_id,
      'alerta_riesgo',
      'Alerta de riesgo: estudiante con bajo progreso',
      'Un estudiante tiene ' || round(r.pct, 1) || '% de progreso en el curso.',
      jsonb_build_object('estudiante_id', r.estudiante_id, 'curso_id', r.curso_id, 'pct_progreso', round(r.pct, 1)),
      'in_app'
    );
  end loop;
end;
$$;

grant execute on function public.notificar_alertas_riesgo() to authenticated;


-- ---------- SLA respuesta ----------
create or replace function public.notificar_sla_respuesta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stub: las evaluaciones en este schema son auto-calificadas.
  -- Cuando exista calificación manual, buscar intentos con estado
  -- "pendiente_calificacion" creados hace >3 días e insertar notificación.
  null;
end;
$$;

grant execute on function public.notificar_sla_respuesta() to authenticated;


-- ==========================================================
-- Step 5 — Cron jobs
-- ==========================================================

do $$
begin
  perform cron.unschedule('notifications-worker');
  perform cron.unschedule('deadline-proximo');
  perform cron.unschedule('alerta-riesgo');
  perform cron.unschedule('sla-respuesta');
exception when others then
  null;
end $$;

select cron.schedule('notifications-worker', '* * * * *', $$
  select net.http_get(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/notifications-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'))
  );
$$);
select cron.schedule('deadline-proximo',     '0 8 * * *', 'select public.notificar_deadlines_proximos()');
select cron.schedule('alerta-riesgo',        '0 9 * * *', 'select public.notificar_alertas_riesgo()');
select cron.schedule('sla-respuesta',        '0 9 * * *', 'select public.notificar_sla_respuesta()');
