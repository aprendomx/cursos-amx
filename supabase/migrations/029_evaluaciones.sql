-- =========================================================
-- Migration 029: evaluaciones (lección tipo examen)
-- =========================================================
--  * lecciones.eval_puntaje_minimo / eval_max_intentos
--  * preguntas + pregunta_opciones (es_correcta NO se expone al alumno)
--  * intentos_evaluacion: registro de cada intento con snapshot jsonb
--  * Lectura del examen y calificación SOLO vía RPC security definer:
--      obtener_evaluacion(leccion)            -> preguntas sin es_correcta
--      calificar_evaluacion(leccion, jsonb)   -> califica, registra, aprueba
--  * Al aprobar: marca progreso.completado y emite constancia si procede.
-- =========================================================

-- ---------- lecciones: configuración del examen ----------
alter table public.lecciones
  add column if not exists eval_puntaje_minimo int not null default 70
    check (eval_puntaje_minimo between 0 and 100),
  add column if not exists eval_max_intentos int not null default 3
    check (eval_max_intentos >= 1);

-- ---------- Preguntas ----------
create table if not exists public.preguntas (
  id         uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  orden      int not null,
  tipo       text not null check (tipo in ('opcion_unica','opcion_multiple','verdadero_falso')),
  enunciado  text not null,
  unique (leccion_id, orden)
);
create index if not exists preguntas_leccion_idx on public.preguntas(leccion_id, orden);

-- ---------- Opciones de pregunta ----------
create table if not exists public.pregunta_opciones (
  id          uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  orden       int not null,
  texto       text not null,
  es_correcta boolean not null default false,
  unique (pregunta_id, orden)
);
create index if not exists pregunta_opciones_pregunta_idx on public.pregunta_opciones(pregunta_id, orden);

-- ---------- Intentos ----------
create table if not exists public.intentos_evaluacion (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.perfiles(id) on delete cascade,
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  curso_id   uuid not null references public.cursos(id) on delete cascade,
  numero     int not null,
  puntaje    int not null check (puntaje between 0 and 100),
  aprobado   boolean not null default false,
  respuestas jsonb not null default '{}'::jsonb,
  creado_en  timestamptz not null default now(),
  unique (user_id, leccion_id, numero)
);
create index if not exists intentos_eval_user_idx  on public.intentos_evaluacion(user_id, leccion_id, numero desc);
create index if not exists intentos_eval_curso_idx on public.intentos_evaluacion(curso_id, creado_en desc);

-- ---------- RLS ----------
alter table public.preguntas           enable row level security;
alter table public.pregunta_opciones   enable row level security;
alter table public.intentos_evaluacion enable row level security;

-- Preguntas/opciones: SOLO admin e instructor leen las tablas directamente.
-- El alumno NUNCA las lee (usa la RPC), así es_correcta queda protegida.
drop policy if exists "preguntas: admin" on public.preguntas;
create policy "preguntas: admin" on public.preguntas for all
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

drop policy if exists "preguntas: instructor lee" on public.preguntas;
create policy "preguntas: instructor lee" on public.preguntas for select
  using (public.is_instructor_de(public.curso_de_leccion(leccion_id)));

drop policy if exists "opciones: admin" on public.pregunta_opciones;
create policy "opciones: admin" on public.pregunta_opciones for all
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

drop policy if exists "opciones: instructor lee" on public.pregunta_opciones;
create policy "opciones: instructor lee" on public.pregunta_opciones for select
  using (public.is_instructor_de(public.curso_de_leccion(
    (select leccion_id from public.preguntas where id = pregunta_id))));

-- Intentos: alumno ve los propios; instructor del curso ve todos.
-- Sin insert/update directos: solo la RPC escribe (security definer).
drop policy if exists "intentos: leer propios o instructor" on public.intentos_evaluacion;
create policy "intentos: leer propios o instructor" on public.intentos_evaluacion for select
  using (user_id = auth.uid() or public.is_instructor_de(curso_id));

-- ---------- RPC: leer evaluación (alumno) ----------
-- Devuelve preguntas + opciones SIN es_correcta, más la config e intentos.
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
             'opciones', (
               select coalesce(jsonb_agg(
                        jsonb_build_object('id', o.id, 'orden', o.orden, 'texto', o.texto)
                        order by o.orden), '[]'::jsonb)
               from public.pregunta_opciones o where o.pregunta_id = pr.id))
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

grant execute on function public.obtener_evaluacion(uuid) to authenticated;

-- ---------- RPC: calificar evaluación (alumno) ----------
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
  r             record;
  v_correct_set uuid[];
  v_sel_set     uuid[];
  v_ok          boolean;
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

  for r in select id from public.preguntas where leccion_id = p_leccion order by orden loop
    v_total := v_total + 1;

    select coalesce(array_agg(id order by id), '{}') into v_correct_set
      from public.pregunta_opciones where pregunta_id = r.id and es_correcta;

    select coalesce(array_agg(x::uuid order by x::uuid), '{}') into v_sel_set
      from jsonb_array_elements_text(coalesce(p_respuestas -> r.id::text, '[]'::jsonb)) as x;

    v_ok := (v_correct_set = v_sel_set);  -- todo o nada
    if v_ok then v_correctas := v_correctas + 1; end if;
    v_detalle := v_detalle || jsonb_build_object('pregunta_id', r.id, 'correcta', v_ok);
  end loop;

  if v_total = 0 then raise exception 'la evaluación no tiene preguntas'; end if;

  v_puntaje  := round(v_correctas::numeric / v_total * 100);
  v_aprobado := v_puntaje >= v_lec.eval_puntaje_minimo;
  v_numero   := v_intentos + 1;

  insert into public.intentos_evaluacion
    (user_id, leccion_id, curso_id, numero, puntaje, aprobado, respuestas)
  values
    (auth.uid(), p_leccion, v_curso, v_numero, v_puntaje, v_aprobado, p_respuestas);

  if v_aprobado then
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
    'detalle', v_detalle
  );
end $$;

grant execute on function public.calificar_evaluacion(uuid, jsonb) to authenticated;
