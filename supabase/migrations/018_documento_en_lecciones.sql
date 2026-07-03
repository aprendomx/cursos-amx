-- supabase/migrations/018_documento_en_lecciones.sql
-- Add documento_path and documento_tipo columns to lecciones table,
-- and create get_documento_acceso RPC for authorized document retrieval.

create type public.documento_tipo as enum ('pdf','imagen');

alter table public.lecciones
  add column documento_path text,
  add column documento_tipo public.documento_tipo;

-- Authorization RPC: returns documento_path only if the caller is admin
-- or enrolled in the lesson's course AND documento_path is not null.
create or replace function public.get_documento_acceso(p_leccion_id uuid)
returns table(documento_path text, documento_tipo public.documento_tipo, titulo text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_curso uuid;
  v_is_admin boolean;
  v_inscrito boolean;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select es_admin into v_is_admin from public.perfiles where id = v_user;

  select m.curso_id into v_curso
    from public.lecciones l
    join public.modulos m on m.id = l.modulo_id
    where l.id = p_leccion_id;

  if v_curso is null then
    raise exception 'no encontrado' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_admin, false) then
    select exists(
      select 1 from public.inscripciones
      where user_id = v_user and curso_id = v_curso
    ) into v_inscrito;
    if not v_inscrito then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  return query
    select l.documento_path, l.documento_tipo, l.titulo
    from public.lecciones l
    where l.id = p_leccion_id and l.documento_path is not null;
end $$;

revoke all on function public.get_documento_acceso(uuid) from public;
grant execute on function public.get_documento_acceso(uuid) to authenticated;
