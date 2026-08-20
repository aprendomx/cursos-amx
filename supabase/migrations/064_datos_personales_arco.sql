-- =========================================================================
-- Migration 064: derechos ARCO y retención (LFPDPPP)
-- =========================================================================
-- El proyecto recaba datos personales de alumnos —nombre, correo, teléfono
-- móvil, dependencia, cargo— y registra un booleano `aviso_privacidad` en el
-- alta. Hasta aquí no existía:
--
--   * ninguna vía de ACCESO ni portabilidad (el titular no podía obtener sus
--     datos ni siquiera manualmente sin que alguien escribiera SQL);
--   * ninguna vía de CANCELACIÓN;
--   * ningún plazo de conservación: lrs_statements, video_eventos,
--     tiempo_curso y log_puntos crecían indefinidamente.
--
-- Esta migración aporta el mecanismo. La institución sigue teniendo que
-- decidir la base de licitud, redactar su aviso y fijar el plazo:
-- ver docs/CUMPLIMIENTO.md.
--
-- NOTA SOBRE LA CANCELACIÓN Y LAS CONSTANCIAS
-- Una constancia emitida es un documento en circulación: si se borra la fila,
-- el folio impreso deja de verificar y el titular queda con un papel
-- indistinguible de una falsificación. Por eso la baja ANONIMIZA el perfil y
-- CONSERVA la constancia, sustituyendo el nombre por una leyenda. Es una
-- decisión discutible y la institución puede querer otra: `eliminar_mis_datos`
-- acepta p_conservar_constancias := false para el borrado duro.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. ACCESO / portabilidad
-- ---------------------------------------------------------------------
create or replace function public.exportar_mis_datos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generado_en', now(),
    'titular', (
      select to_jsonb(p) - 'id'
      from public.perfiles p where p.id = v_user
    ),
    'dependencia', (
      select d.nombre from public.perfiles p
      join public.dependencias d on d.id = p.dependencia_id
      where p.id = v_user
    ),
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'curso', c.titulo, 'inscrito_en', i.inscrito_en))
      from public.inscripciones i
      join public.cursos c on c.id = i.curso_id
      where i.user_id = v_user), '[]'::jsonb),
    'progreso', coalesce((
      select jsonb_agg(jsonb_build_object(
        'leccion', l.titulo, 'completado', pr.completado,
        'completado_en', pr.completado_en, 'segundos_vistos', pr.segundos_vistos))
      from public.progreso pr
      join public.lecciones l on l.id = pr.leccion_id
      where pr.user_id = v_user), '[]'::jsonb),
    'constancias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'folio', co.folio, 'curso', c.titulo, 'emitida_en', co.emitida_en))
      from public.constancias co
      join public.cursos c on c.id = co.curso_id
      where co.user_id = v_user), '[]'::jsonb),
    'evaluaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'leccion', l.titulo, 'intento', ie.numero,
        'puntaje', ie.puntaje, 'aprobado', ie.aprobado, 'fecha', ie.creado_en))
      from public.intentos_evaluacion ie
      join public.lecciones l on l.id = ie.leccion_id
      where ie.user_id = v_user), '[]'::jsonb),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contenido', cm.contenido, 'creado_en', cm.creado_en))
      from public.comentarios cm where cm.user_id = v_user), '[]'::jsonb),
    'tiempo_por_curso', coalesce((
      select jsonb_agg(jsonb_build_object(
        'curso', c.titulo, 'segundos_activos', t.segundos_activos))
      from public.tiempo_curso t
      join public.cursos c on c.id = t.curso_id
      where t.user_id = v_user), '[]'::jsonb)
  ) into v_out;

  return v_out;
end $$;

grant execute on function public.exportar_mis_datos() to authenticated;

comment on function public.exportar_mis_datos() is
  'Derecho de ACCESO y portabilidad (LFPDPPP). Devuelve en JSON todos los '
  'datos personales del titular autenticado. Ver docs/CUMPLIMIENTO.md.';

-- ---------------------------------------------------------------------
-- 2. CANCELACIÓN
-- ---------------------------------------------------------------------
create table if not exists public.bajas_titular (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,                  -- sin FK: sobrevive al borrado del perfil
  solicitada_en  timestamptz not null default now(),
  constancias_conservadas int not null default 0,
  motivo         text
);

alter table public.bajas_titular enable row level security;
comment on table public.bajas_titular is
  'Bitácora de bajas ejercidas por los titulares. Sin políticas RLS: solo la '
  'RPC security definer escribe, y solo el service_role lee. Es la evidencia '
  'de que la solicitud se atendió.';

create or replace function public.eliminar_mis_datos(
  p_confirmacion          text,
  p_conservar_constancias boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_constancias int := 0;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Confirmación explícita: esta operación no tiene vuelta atrás y no debe
  -- poder dispararse por un clic accidental ni por una petición malformada.
  if p_confirmacion is distinct from 'ELIMINAR MIS DATOS' then
    raise exception 'confirmación requerida: envía exactamente "ELIMINAR MIS DATOS"'
      using errcode = '22023';
  end if;

  -- 2.1 Telemetría de comportamiento: se borra completa.
  -- lrs_statements usa actor_id (xAPI), no user_id.
  delete from public.lrs_statements  where actor_id = v_user;
  delete from public.tiempo_curso    where user_id = v_user;
  delete from public.progreso        where user_id = v_user;
  delete from public.comentarios     where user_id = v_user;

  if to_regclass('public.video_eventos') is not null then
    delete from public.video_eventos where user_id = v_user;
  end if;
  if to_regclass('public.log_puntos') is not null then
    delete from public.log_puntos where usuario_id = v_user;
  end if;
  if to_regclass('public.mensajes_chat') is not null then
    delete from public.mensajes_chat where user_id = v_user;
  end if;
  if to_regclass('public.notificaciones') is not null then
    delete from public.notificaciones where usuario_id = v_user;
  end if;
  if to_regclass('public.push_subscriptions') is not null then
    delete from public.push_subscriptions where user_id = v_user;
  end if;

  -- 2.2 Constancias emitidas.
  select count(*) into v_constancias from public.constancias where user_id = v_user;
  if not p_conservar_constancias then
    delete from public.constancias where user_id = v_user;
    v_constancias := 0;
  end if;

  insert into public.bajas_titular (user_id, constancias_conservadas)
  values (v_user, v_constancias);

  -- 2.3 El perfil se anonimiza en vez de borrarse: si se borrara, la cascada
  -- se llevaría por delante las constancias conservadas en 2.2.
  update public.perfiles set
    nombres          = 'Titular',
    apellido_paterno = 'dado de baja',
    apellido_materno = null,
    correo           = 'baja+' || encode(extensions.gen_random_bytes(8), 'hex') || '@invalido.local',
    telefono_movil   = null,
    cargo            = null,
    dependencia_id   = null,
    aviso_privacidad = false,
    actualizado_en   = now()
  where id = v_user;

  -- 2.4 Se cierra el acceso. El registro de auth se conserva porque
  -- perfiles.id lo referencia con ON DELETE CASCADE.
  update auth.users set
    email              = 'baja+' || v_user::text || '@invalido.local',
    encrypted_password = null,
    raw_user_meta_data = '{}'::jsonb
  where id = v_user;

  return jsonb_build_object(
    'ok', true,
    'constancias_conservadas', v_constancias,
    'mensaje', case
      when v_constancias > 0 then
        'Tus datos personales fueron eliminados. Se conservaron ' ||
        v_constancias || ' constancia(s) emitida(s) para que sus folios sigan ' ||
        'siendo verificables; el nombre asociado quedó anonimizado.'
      else 'Tus datos personales fueron eliminados.'
    end
  );
end $$;

grant execute on function public.eliminar_mis_datos(text, boolean) to authenticated;

comment on function public.eliminar_mis_datos(text, boolean) is
  'Derecho de CANCELACIÓN (LFPDPPP). Borra la telemetría, anonimiza el perfil '
  'y cierra el acceso. Conserva las constancias emitidas salvo que se pida lo '
  'contrario. Exige la confirmación literal "ELIMINAR MIS DATOS".';

-- ---------------------------------------------------------------------
-- 3. RETENCIÓN
-- ---------------------------------------------------------------------
-- No se agenda ningún cron: el plazo de conservación es una decisión de la
-- institución, no del software. Se entrega la herramienta y se documenta.
create or replace function public.depurar_telemetria(p_dias int default 730)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte timestamptz;
  n_lrs int := 0; n_ev int := 0;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'solo un administrador puede depurar' using errcode = '42501';
  end if;
  if p_dias < 30 then
    raise exception 'el plazo mínimo admitido es de 30 días' using errcode = '22023';
  end if;

  v_corte := now() - make_interval(days => p_dias);

  delete from public.lrs_statements where stored_at < v_corte;
  get diagnostics n_lrs = row_count;

  if to_regclass('public.video_eventos') is not null then
    delete from public.video_eventos where creado_en < v_corte;
    get diagnostics n_ev = row_count;
  end if;

  return jsonb_build_object(
    'corte', v_corte,
    'lrs_statements_borrados', n_lrs,
    'video_eventos_borrados', n_ev
  );
end $$;

grant execute on function public.depurar_telemetria(int) to authenticated;

comment on function public.depurar_telemetria(int) is
  'Depura telemetría de comportamiento anterior al plazo indicado. NO se '
  'agenda automáticamente: el plazo de conservación lo fija la institución. '
  'Para agendarlo: select cron.schedule(''depurar-telemetria'', ''0 3 * * 0'', '
  '''select public.depurar_telemetria(730)''); Ver docs/CUMPLIMIENTO.md.';
