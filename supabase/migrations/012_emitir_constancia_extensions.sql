-- 012_emitir_constancia_extensions.sql
-- Recrea _emitir_constancia_si_procede calificando explícitamente
-- extensions.gen_random_bytes (pgcrypto vive en el schema extensions
-- en Supabase, y el set search_path = public no lo incluía).
--
-- Sin este fix, completar la última lección de un curso lanzaba 42883
-- "function gen_random_bytes(integer) does not exist", lo que reverteía
-- la transacción entera de marcar_leccion_completada y dejaba sin
-- registrar el progreso.

create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_curso uuid; v_total int; v_hechas int;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_hechas >= v_total then
    insert into public.constancias (user_id, curso_id, folio, hash_verif)
    values (
      p_user,
      v_curso,
      'CON-' || to_char(now(),'YYYY') || '-' || upper(substr(v_curso::text,1,4)) || '-' || lpad((floor(random()*99999))::text,5,'0'),
      encode(extensions.gen_random_bytes(16), 'hex')
    )
    on conflict (user_id, curso_id) do nothing;
  end if;
end $$;
