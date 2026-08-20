-- =========================================================================
-- Migration 066: revocación y corrección de constancias
-- =========================================================================
-- No existía forma de anular una constancia emitida por error. La única vía
-- era un DELETE manual en psql, que deja al portador con un PDF y un QR que
-- responde "no existe": indistinguible de una falsificación.
--
-- Con esto, la verificación pública pasa a distinguir tres estados —vigente,
-- revocada, inexistente— en vez de dos.
-- =========================================================================

alter table public.constancias
  add column if not exists revocada_en    timestamptz,
  add column if not exists revocada_por   uuid references public.perfiles(id),
  add column if not exists motivo_revocacion text;

comment on column public.constancias.revocada_en is
  'Nula = vigente. La fila NUNCA se borra al revocar: el folio sigue en '
  'circulación y su verificación tiene que poder decir "revocada" en vez de '
  '"no existe". Ver migración 066.';

create index if not exists constancias_revocada_idx
  on public.constancias(revocada_en) where revocada_en is not null;

-- ---------------------------------------------------------------------
-- Revocar (solo administrador)
-- ---------------------------------------------------------------------
create or replace function public.revocar_constancia(p_folio text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_ya timestamptz;
begin
  if not public.is_admin() then
    raise exception 'solo un administrador puede revocar constancias'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'el motivo de la revocación es obligatorio' using errcode = '22023';
  end if;

  select id, revocada_en into v_id, v_ya
    from public.constancias where folio = p_folio;

  if v_id is null then
    raise exception 'no existe una constancia con folio %', p_folio using errcode = 'P0002';
  end if;
  if v_ya is not null then
    return jsonb_build_object('ok', true, 'ya_estaba_revocada', true, 'revocada_en', v_ya);
  end if;

  update public.constancias
     set revocada_en = now(),
         revocada_por = auth.uid(),
         motivo_revocacion = trim(p_motivo)
   where id = v_id;

  return jsonb_build_object('ok', true, 'ya_estaba_revocada', false, 'revocada_en', now());
end $$;

grant execute on function public.revocar_constancia(text, text) to authenticated;

-- Reactivar, para el caso de una revocación equivocada.
create or replace function public.reactivar_constancia(p_folio text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'solo un administrador puede reactivar constancias'
      using errcode = '42501';
  end if;

  update public.constancias
     set revocada_en = null, revocada_por = null, motivo_revocacion = null
   where folio = p_folio;

  if not found then
    raise exception 'no existe una constancia con folio %', p_folio using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.reactivar_constancia(text) to authenticated;

-- ---------------------------------------------------------------------
-- La verificación pública distingue los tres estados
-- ---------------------------------------------------------------------
-- Cambia la forma del retorno, así que hay que soltar la versión anterior.
drop function if exists public.verificar_constancia(text);

create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio          text,
  emitida_en     timestamptz,
  hash_verif     text,
  nombre_persona text,
  titulo_curso   text,
  estado         text,
  revocada_en    timestamptz,
  motivo_revocacion text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verificacion_rate_check();

  return query
    select
      co.folio,
      co.emitida_en,
      co.hash_verif,
      p.nombres_completos,
      cu.titulo,
      case when co.revocada_en is null then 'vigente' else 'revocada' end,
      co.revocada_en,
      co.motivo_revocacion
    from public.constancias co
    join public.perfiles p on p.id = co.user_id
    join public.cursos cu  on cu.id = co.curso_id
    where co.folio = p_folio
    limit 1;
end $$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;

comment on function public.verificar_constancia(text) is
  'Verificación pública por folio. Devuelve estado "vigente" o "revocada"; '
  'cero filas significa que el folio no existe. Limitada por tasa para evitar '
  'la enumeración del padrón (migración 061).';
