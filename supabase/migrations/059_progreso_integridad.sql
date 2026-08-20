-- =========================================================================
-- Migration 059: integridad del progreso y de la emisión de constancias
-- =========================================================================
-- Antes de esta migración, la ruta para obtener una constancia sin consumir
-- el contenido eran DOS peticiones HTTP:
--
--   1. POST /rest/v1/progreso  con {completado:true} para cada lección
--      — la política solo exigía auth.uid() = user_id: ni inscripción, ni
--        relación con segundos_vistos, ni orden de módulos.
--   2. POST /rest/v1/rpc/marcar_leccion_completada sobre la última lección
--      — security definer que no validaba absolutamente nada y llamaba a
--        _emitir_constancia_si_procede.
--
-- Se cierran las dos. La regla de continuidad se aplica SOLO a la escritura
-- directa (current_user = authenticated/anon); las RPC confiables corren como
-- dueño de la función y quedan fuera, porque validan por su cuenta:
--   * marcar_leccion_completada  → se reescribe aquí con validación
--   * calificar_evaluacion (029) → ya exige inscripción e intentos restantes
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Las políticas de escritura exigen inscripción
-- ---------------------------------------------------------------------
drop policy if exists "progreso: insertar propio" on public.progreso;
create policy "progreso: insertar propio" on public.progreso
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.esta_inscrito(public.curso_de_leccion(leccion_id))
  );

drop policy if exists "progreso: actualizar propio" on public.progreso;
create policy "progreso: actualizar propio" on public.progreso
  for update to authenticated
  using (
    auth.uid() = user_id
    and public.esta_inscrito(public.curso_de_leccion(leccion_id))
  )
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2. Guard de continuidad sobre la escritura directa
-- ---------------------------------------------------------------------
-- OJO: security INVOKER a propósito (es el default; se explicita para que no
-- se "corrija" por costumbre). Con security definer, current_user dentro de la
-- función sería el dueño y la comprobación de más abajo nunca discriminaría
-- entre un INSERT directo del navegador y una RPC confiable.
create or replace function public.progreso_guard_completado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lec public.lecciones;
begin
  -- Solo se marca completado; bajarlo o no tocarlo nunca se bloquea.
  if not new.completado then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completado then
    return new;
  end if;

  -- Dentro de una función security definer, current_user es el dueño de la
  -- función (postgres), no el rol de PostgREST. Es lo que distingue una RPC
  -- confiable de un INSERT directo desde el navegador.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select * into v_lec from public.lecciones where id = new.leccion_id;
  if not found then
    raise exception 'lección inexistente' using errcode = '23503';
  end if;

  if v_lec.tipo_material = 'examen' then
    raise exception
      'una evaluación solo se completa aprobándola (rpc calificar_evaluacion)'
      using errcode = '42501';
  end if;

  -- Video con duración conocida: exigir que se haya visto de verdad.
  -- El 90% deja margen para créditos finales y para el desfase del último
  -- flush de guardar_posicion.
  if v_lec.tipo_material = 'video'
     and coalesce(v_lec.duracion_seg, 0) > 0
     and coalesce(new.segundos_vistos, 0) < (v_lec.duracion_seg * 0.9)::int then
    raise exception
      'no se puede completar un video sin haberlo visto (% de % segundos)',
      coalesce(new.segundos_vistos, 0), v_lec.duracion_seg
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists progreso_guard_completado on public.progreso;
create trigger progreso_guard_completado
  before insert or update on public.progreso
  for each row execute function public.progreso_guard_completado();

-- ---------------------------------------------------------------------
-- 3. marcar_leccion_completada: validar en vez de confiar
-- ---------------------------------------------------------------------
create or replace function public.marcar_leccion_completada(p_leccion_id uuid)
returns public.progreso
language plpgsql security definer set search_path = public as $$
declare
  r        public.progreso;
  v_lec    public.lecciones;
  v_curso  uuid;
  v_vistos int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_lec from public.lecciones where id = p_leccion_id;
  if not found then
    raise exception 'lección inexistente' using errcode = '23503';
  end if;

  v_curso := public.curso_de_leccion(p_leccion_id);
  if not public.esta_inscrito(v_curso) then
    raise exception 'no estás inscrito en este curso' using errcode = '42501';
  end if;

  if v_lec.tipo_material = 'examen' then
    raise exception 'una evaluación se completa aprobándola' using errcode = '42501';
  end if;

  -- Misma regla de continuidad que el trigger, pero contra lo YA registrado
  -- por guardar_posicion: el cliente no puede inventar los segundos aquí.
  if v_lec.tipo_material = 'video' and coalesce(v_lec.duracion_seg, 0) > 0 then
    select coalesce(segundos_vistos, 0) into v_vistos
      from public.progreso
      where user_id = auth.uid() and leccion_id = p_leccion_id;
    if coalesce(v_vistos, 0) < (v_lec.duracion_seg * 0.9)::int then
      raise exception 'video no visto por completo (% de % segundos)',
        coalesce(v_vistos, 0), v_lec.duracion_seg using errcode = '42501';
    end if;
  end if;

  insert into public.progreso (user_id, leccion_id, completado, completado_en)
  values (auth.uid(), p_leccion_id, true, now())
  on conflict (user_id, leccion_id)
    do update set completado = true, completado_en = excluded.completado_en
  returning * into r;

  perform public._emitir_constancia_si_procede(auth.uid(), p_leccion_id);
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 4. guardar_posicion: exigir inscripción y acotar a la duración real
-- ---------------------------------------------------------------------
create or replace function public.guardar_posicion(p_leccion uuid, p_segundos int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dur  int;
  v_secs int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if not public.esta_inscrito(public.curso_de_leccion(p_leccion)) then
    raise exception 'no estás inscrito en este curso' using errcode = '42501';
  end if;

  select coalesce(duracion_seg, 0) into v_dur
    from public.lecciones where id = p_leccion;

  -- Acotar a la duración de la lección: antes, guardar_posicion(lec, 999999)
  -- bastaba para satisfacer cualquier umbral de continuidad.
  v_secs := greatest(coalesce(p_segundos, 0), 0);
  if v_dur > 0 then
    v_secs := least(v_secs, v_dur);
  end if;

  insert into public.progreso (user_id, leccion_id, segundos_vistos, actualizado_en, completado)
  values (auth.uid(), p_leccion, v_secs, now(), false)
  on conflict (user_id, leccion_id) do update
    set segundos_vistos = greatest(excluded.segundos_vistos, public.progreso.segundos_vistos),
        actualizado_en  = now();
end $$;
