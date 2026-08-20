-- =========================================================================
-- Migration 072: avance por módulo
-- =========================================================================
-- Dos cosas:
--
-- (a) src/services/badgeEngine.js llama a curso_completado_por_usuario y a
--     modulo_completado_por_usuario. NINGUNA DE LAS DOS EXISTÍA en el esquema.
--     El cliente hace `const { data } = await supabase.rpc(...)` y devuelve
--     `data === true`: al fallar, data es null y el criterio evalúa false. Es
--     decir, las insignias de «completar curso» y «completar módulo» nunca se
--     desbloqueaban, y sin ningún error visible.
--
-- (b) El avance solo existía a nivel de curso. Esta migración añade la vista
--     que lo agrega por módulo, para el reproductor y el panel de instructor.
--
-- Nota de seguridad: las dos funciones reciben un p_user_id. Sin control, un
-- alumno podría consultar el avance de cualquier otro. Se restringen a uno
-- mismo, al instructor del curso y al administrador.
-- =========================================================================

create or replace function public.curso_completado_por_usuario(p_user_id uuid, p_curso_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_total int; v_hechas int;
begin
  if p_user_id <> auth.uid()
     and not public.is_instructor_de(p_curso_id)
     and auth.uid() is not null then
    raise exception 'no autorizado para consultar el avance de otra persona'
      using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = p_curso_id;

  if v_total = 0 then return false; end if;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where pr.user_id = p_user_id and pr.completado and m.curso_id = p_curso_id;

  return v_hechas >= v_total;
end $$;

create or replace function public.modulo_completado_por_usuario(p_user_id uuid, p_modulo_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_curso uuid; v_total int; v_hechas int;
begin
  select curso_id into v_curso from public.modulos where id = p_modulo_id;
  if v_curso is null then return false; end if;

  if p_user_id <> auth.uid()
     and not public.is_instructor_de(v_curso)
     and auth.uid() is not null then
    raise exception 'no autorizado para consultar el avance de otra persona'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.lecciones where modulo_id = p_modulo_id;
  if v_total = 0 then return false; end if;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  where pr.user_id = p_user_id and pr.completado and l.modulo_id = p_modulo_id;

  return v_hechas >= v_total;
end $$;

grant execute on function public.curso_completado_por_usuario(uuid, uuid)  to authenticated;
grant execute on function public.modulo_completado_por_usuario(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Vista de avance por módulo
-- ---------------------------------------------------------------------
-- Se filtra dentro de la vista, no por RLS: una vista corre con los permisos
-- de su dueño, así que sin este WHERE cualquiera vería el avance de todos.
-- Mismo criterio que las políticas de `progreso`: uno mismo, el instructor del
-- curso, o un administrador.
create or replace view public.v_progreso_modulo as
select
  i.user_id,
  m.curso_id,
  m.id                  as modulo_id,
  m.titulo              as modulo,
  m.orden               as modulo_orden,
  count(l.id)                                            as lecciones,
  count(*) filter (where pr.completado)                  as completadas,
  case when count(l.id) = 0 then 0
       else round(100.0 * count(*) filter (where pr.completado) / count(l.id))
  end                                                    as porcentaje,
  max(pr.actualizado_en)                                 as ultima_actividad
from public.inscripciones i
join public.modulos   m on m.curso_id = i.curso_id
join public.lecciones l on l.modulo_id = m.id
left join public.progreso pr on pr.leccion_id = l.id and pr.user_id = i.user_id
where i.user_id = auth.uid()
   or public.is_instructor_de(m.curso_id)
group by i.user_id, m.curso_id, m.id, m.titulo, m.orden;

comment on view public.v_progreso_modulo is
  'Avance por módulo y por persona. El filtro va DENTRO de la vista: una vista '
  'corre con los permisos de su dueño, así que sin él expondría el avance de '
  'todos los alumnos a cualquiera.';

grant select on public.v_progreso_modulo to authenticated;
