-- 013_verificar_constancia_rpc.sql
-- RPC pública para verificar una constancia por folio.
-- security definer + grant execute to anon: cualquier visitante puede
-- llamarla sin auth. Devuelve solo campos públicos (sin user_id ni curso_id).

create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio text,
  emitida_en timestamptz,
  hash_verif text,
  nombre_persona text,
  titulo_curso text
)
language sql
security definer
set search_path = public
as $$
  select
    co.folio,
    co.emitida_en,
    co.hash_verif,
    p.nombres_completos,
    cu.titulo
  from public.constancias co
  join public.perfiles p on p.id = co.user_id
  join public.cursos cu on cu.id = co.curso_id
  where co.folio = p_folio
  limit 1;
$$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;
