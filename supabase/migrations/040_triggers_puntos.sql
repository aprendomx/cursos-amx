-- =========================================================
-- Migration 040: Triggers y Vistas de Gamificación
-- =========================================================
--  * otorgar_puntos(): función security definer para insertar en log_puntos
--  * Triggers automáticos que otorgan puntos al completar lecciones,
--    aprobar evaluaciones y participar en foros.
--  * Vistas: v_puntos_usuario (suma total) y v_nivel_usuario (nivel actual).
-- =========================================================

-- ---------- Función para otorgar puntos ----------
create or replace function public.otorgar_puntos(
  p_usuario_id   uuid,
  p_fuente_tipo  text,
  p_fuente_id    uuid,
  p_puntos       int,
  p_descripcion  text default null
)
returns public.log_puntos
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.log_puntos;
begin
  insert into public.log_puntos (usuario_id, fuente_tipo, fuente_id, puntos, descripcion)
  values (p_usuario_id, p_fuente_tipo, p_fuente_id, p_puntos, p_descripcion)
  returning * into r;
  return r;
end $$;

grant execute on function public.otorgar_puntos(uuid, text, uuid, int, text) to authenticated;

-- ---------- Trigger: puntos por completar lección (10 pts) ----------
create or replace function public.trg_puntos_leccion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.completado is false and new.completado is true then
    perform public.otorgar_puntos(
      new.user_id,
      'leccion_completada',
      new.leccion_id,
      10,
      'Lección completada'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_puntos_leccion on public.progreso;
create trigger trg_puntos_leccion
  after update of completado on public.progreso
  for each row
  execute function public.trg_puntos_leccion_fn();

-- ---------- Trigger: puntos por aprobar evaluación (50 pts) ----------
-- Nota: la tabla real se llama intentos_evaluacion (aprobado boolean).
create or replace function public.trg_puntos_evaluacion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.aprobado is false and new.aprobado is true then
    perform public.otorgar_puntos(
      new.user_id,
      'quiz_aprobado',
      new.leccion_id,
      50,
      'Evaluación aprobada'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_puntos_evaluacion on public.intentos_evaluacion;
create trigger trg_puntos_evaluacion
  after update of aprobado on public.intentos_evaluacion
  for each row
  execute function public.trg_puntos_evaluacion_fn();

-- ---------- Trigger: puntos por crear hilo en foro (5 pts) ----------
create or replace function public.trg_puntos_foro_hilo_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.otorgar_puntos(
    new.autor_id,
    'foro_post',
    new.id,
    5,
    'Nuevo hilo en foro'
  );
  return new;
end $$;

drop trigger if exists trg_puntos_foro_hilo on public.foro_hilos;
create trigger trg_puntos_foro_hilo
  after insert on public.foro_hilos
  for each row
  execute function public.trg_puntos_foro_hilo_fn();

-- ---------- Trigger: puntos por responder en foro (5 pts) ----------
create or replace function public.trg_puntos_foro_resp_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.otorgar_puntos(
    new.autor_id,
    'foro_post',
    new.id,
    5,
    'Respuesta en foro'
  );
  return new;
end $$;

drop trigger if exists trg_puntos_foro_resp on public.foro_respuestas;
create trigger trg_puntos_foro_resp
  after insert on public.foro_respuestas
  for each row
  execute function public.trg_puntos_foro_resp_fn();

-- ---------- Vista: puntos totales por usuario ----------
create or replace view public.v_puntos_usuario as
select
  usuario_id,
  coalesce(sum(puntos), 0) as puntos_totales
from public.log_puntos
group by usuario_id;

comment on view public.v_puntos_usuario is 'Suma total de puntos acumulados por usuario';

-- ---------- Vista: nivel actual por usuario ----------
create or replace view public.v_nivel_usuario as
select
  pu.usuario_id,
  pu.puntos_totales,
  n.id   as nivel_id,
  n.nombre  as nivel_nombre,
  n.icono_svg as nivel_icono,
  n.color   as nivel_color
from public.v_puntos_usuario pu
left join lateral (
  select *
  from public.niveles
  where puntos_min <= pu.puntos_totales
  order by puntos_min desc
  limit 1
) n on true;

comment on view public.v_nivel_usuario is 'Nivel actual de cada usuario según sus puntos acumulados';

-- ---------- Grants sobre vistas ----------
grant select on public.v_puntos_usuario to authenticated;
grant select on public.v_nivel_usuario to authenticated;
