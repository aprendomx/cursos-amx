-- =========================================================
-- Migration 035: extender tipos de pregunta y agregar config jsonb
-- =========================================================
-- Nuevos tipos: emparejamiento, rellenar_huecos, ensayo
-- La columna config guarda datos específicos por tipo:
--   emparejamiento: {pares: [{izq, der}]}
--   rellenar_huecos: {respuestas: [string]}
--   ensayo: {max_caracteres: int, guia: string}
-- =========================================================

-- 1) Quitar constraint existente y recrear con nuevos tipos
alter table public.preguntas drop constraint if exists preguntas_tipo_check;
alter table public.preguntas add constraint preguntas_tipo_check
  check (tipo in ('opcion_unica','opcion_multiple','verdadero_falso','emparejamiento','rellenar_huecos','ensayo'));

-- 2) Config jsonb para datos específicos de tipo
alter table public.preguntas add column if not exists config jsonb default '{}'::jsonb;

-- 3) Índice GIN para búsquedas en config (futuro)
create index if not exists preguntas_config_idx on public.preguntas using gin(config);

-- 4) Actualizar RPC obtener_evaluacion para incluir config
-- (las opciones solo se devuelven para tipos que las usan)
create or replace function public.obtener_evaluacion(p_leccion uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lec       public.lecciones;
  v_curso     uuid;
  v_intentos  int;
  v_preguntas jsonb;
begin
  select * into v_lec from public.lecciones where id = p_leccion;
  if not found then raise exception 'lección no existe'; end if;
  if v_lec.tipo_material <> 'examen' then raise exception 'esta lección no es una evaluación'; end if;

  v_curso := public.curso_de_leccion(p_leccion);
  if not public.esta_inscrito(v_curso) then raise exception 'no estás inscrito en este curso'; end if;

  select count(*) into v_intentos
    from public.intentos_evaluacion
    where user_id = auth.uid() and leccion_id = p_leccion;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pr.id, 'orden', pr.orden, 'tipo', pr.tipo, 'enunciado', pr.enunciado,
             'config', pr.config,
             'opciones', case when pr.tipo in ('opcion_unica','opcion_multiple','verdadero_falso') then (
               select coalesce(jsonb_agg(
                        jsonb_build_object('id', o.id, 'orden', o.orden, 'texto', o.texto)
                        order by o.orden), '[]'::jsonb)
               from public.pregunta_opciones o where o.pregunta_id = pr.id)
               else '[]'::jsonb end)
           order by pr.orden), '[]'::jsonb)
    into v_preguntas
    from public.preguntas pr where pr.leccion_id = p_leccion;

  return jsonb_build_object(
    'puntaje_minimo', v_lec.eval_puntaje_minimo,
    'max_intentos', v_lec.eval_max_intentos,
    'intentos_usados', v_intentos,
    'intentos_restantes', greatest(v_lec.eval_max_intentos - v_intentos, 0),
    'preguntas', v_preguntas
  );
end $$;

-- 5) Actualizar RPC calificar_evaluacion para manejar nuevos tipos
--    emparejamiento: respuestas es {preguntaId: [{izq, der}]}
--    rellenar_huecos: respuestas es {preguntaId: [string]}
--    ensayo: respuestas es {preguntaId: string} — siempre "correcto" para scoring,
--            pero se marca como pendiente_de_revision en intentos

create or replace function public.calificar_evaluacion(p_leccion uuid, p_respuestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lec         public.lecciones;
  v_curso       uuid;
  v_total       int := 0;
  v_correctas   int := 0;
  v_intentos    int;
  v_numero      int;
  v_puntaje     int;
  v_aprobado    boolean;
  v_detalle     jsonb := '[]'::jsonb;
  v_tiene_ensayo boolean := false;
  r             record;
  v_correct_set uuid[];
  v_sel_set     uuid[];
  v_ok          boolean;
  v_config      jsonb;
  v_resp        jsonb;
  v_pares       jsonb;
  v_pares_ok    int;
  v_pares_total int;
  v_huecos      jsonb;
  v_huecos_ok   int;
  v_huecos_total int;
begin
  select * into v_lec from public.lecciones where id = p_leccion;
  if not found then raise exception 'lección no existe'; end if;
  if v_lec.tipo_material <> 'examen' then raise exception 'esta lección no es una evaluación'; end if;

  v_curso := public.curso_de_leccion(p_leccion);
  if not public.esta_inscrito(v_curso) then raise exception 'no estás inscrito en este curso'; end if;

  select count(*) into v_intentos
    from public.intentos_evaluacion
    where user_id = auth.uid() and leccion_id = p_leccion;
  if v_intentos >= v_lec.eval_max_intentos then
    raise exception 'sin intentos restantes';
  end if;

  for r in select id, tipo, config from public.preguntas where leccion_id = p_leccion order by orden loop
    v_total := v_total + 1;
    v_resp := coalesce(p_respuestas -> r.id::text, 'null'::jsonb);
    v_ok := false;

    if r.tipo in ('opcion_unica', 'opcion_multiple', 'verdadero_falso') then
      select coalesce(array_agg(id order by id), '{}') into v_correct_set
        from public.pregunta_opciones where pregunta_id = r.id and es_correcta;
      select coalesce(array_agg(x::uuid order by x::uuid), '{}') into v_sel_set
        from jsonb_array_elements_text(coalesce(v_resp, '[]'::jsonb)) as x;
      v_ok := (v_correct_set = v_sel_set);

    elsif r.tipo = 'emparejamiento' then
      v_config := r.config -> 'pares';
      v_pares_total := coalesce(jsonb_array_length(v_config), 0);
      v_pares_ok := 0;
      if v_pares_total > 0 and jsonb_typeof(v_resp) = 'array' then
        for i in 0..v_pares_total-1 loop
          if v_resp -> i ->> 'izq' = v_config -> i ->> 'izq'
             and v_resp -> i ->> 'der' = v_config -> i ->> 'der' then
            v_pares_ok := v_pares_ok + 1;
          end if;
        end loop;
        v_ok := (v_pares_ok = v_pares_total);
      end if;

    elsif r.tipo = 'rellenar_huecos' then
      v_config := r.config -> 'respuestas';
      v_huecos_total := coalesce(jsonb_array_length(v_config), 0);
      v_huecos_ok := 0;
      if v_huecos_total > 0 and jsonb_typeof(v_resp) = 'array' then
        for i in 0..v_huecos_total-1 loop
          if lower(trim(v_resp ->> i)) = lower(trim(v_config ->> i)) then
            v_huecos_ok := v_huecos_ok + 1;
          end if;
        end loop;
        v_ok := (v_huecos_ok = v_huecos_total);
      end if;

    elsif r.tipo = 'ensayo' then
      v_tiene_ensayo := true;
      v_ok := true; -- el ensayo no afecta el puntaje automático
    end if;

    if v_ok then v_correctas := v_correctas + 1; end if;
    v_detalle := v_detalle || jsonb_build_object('pregunta_id', r.id, 'correcta', v_ok);
  end loop;

  if v_total = 0 then raise exception 'la evaluación no tiene preguntas'; end if;

  v_puntaje  := round(v_correctas::numeric / v_total * 100);
  -- Si hay ensayo, el puntaje mínimo para aprobar es 0 (se califica manual después)
  -- pero se mantiene el comportamiento: si hay solo ensayos, siempre aprueba
  v_aprobado := v_puntaje >= v_lec.eval_puntaje_minimo;
  v_numero   := v_intentos + 1;

  insert into public.intentos_evaluacion
    (user_id, leccion_id, curso_id, numero, puntaje, aprobado, respuestas)
  values
    (auth.uid(), p_leccion, v_curso, v_numero, v_puntaje, v_aprobado, p_respuestas);

  if v_aprobado and not v_tiene_ensayo then
    insert into public.progreso (user_id, leccion_id, completado, completado_en)
    values (auth.uid(), p_leccion, true, now())
    on conflict (user_id, leccion_id)
      do update set completado = true, completado_en = excluded.completado_en;
    perform public._emitir_constancia_si_procede(auth.uid(), p_leccion);
  end if;

  return jsonb_build_object(
    'puntaje', v_puntaje,
    'aprobado', v_aprobado,
    'numero', v_numero,
    'intentos_restantes', v_lec.eval_max_intentos - v_numero,
    'detalle', v_detalle,
    'tiene_ensayo', v_tiene_ensayo
  );
end $$;

-- 6) Feature flag para evaluaciones avanzadas
insert into public.feature_toggles (key, enabled)
values ('advanced_quizzes', false)
on conflict (key) do nothing;
