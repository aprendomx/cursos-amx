-- supabase/test/rls.sql
-- Pruebas de integración de las políticas RLS contra un Postgres real.
--
-- Por qué en SQL y no en vitest: las pruebas unitarias mockean supabase-js,
-- así que verifican que el CLIENTE construye bien la consulta — nunca que el
-- SERVIDOR la rechace. Con la anon key en el navegador, RLS es el 100% del
-- modelo de autorización de este producto; si no se prueba aquí, no se prueba.
--
-- Se simula lo que hace PostgREST en cada petición:
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<uuid del usuario>';

\set ON_ERROR_STOP on
\timing off

create or replace function pg_temp.ok(desc_ text) returns void
  language plpgsql as $$ begin raise notice '  ✅ %', desc_; end $$;

create or replace function pg_temp.fail(desc_ text) returns void
  language plpgsql as $$ begin raise exception '  ❌ %', desc_; end $$;

-- Ejecuta `sql_` como `uid_` y espera que FALLE (por RLS o por privilegio).
create or replace function pg_temp.debe_fallar(desc_ text, uid_ uuid, sql_ text)
returns void language plpgsql as $$
begin
  begin
    execute format('set local role authenticated');
    execute format('set local request.jwt.claim.sub = %L', uid_);
    execute sql_;
    execute 'reset role';
    perform pg_temp.fail(desc_ || ' (se esperaba rechazo y pasó)');
  exception
    when insufficient_privilege or check_violation then
      execute 'reset role'; perform pg_temp.ok(desc_);
    when others then
      execute 'reset role';
      if sqlstate = 'P0001' and sqlerrm like '%se esperaba rechazo%' then raise;
      end if;
      perform pg_temp.ok(desc_ || ' [' || sqlstate || ']');
  end;
end $$;

-- Ejecuta `sql_` como `uid_` y espera que FUNCIONE.
create or replace function pg_temp.debe_pasar(desc_ text, uid_ uuid, sql_ text)
returns void language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', uid_);
  execute sql_;
  execute 'reset role';
  perform pg_temp.ok(desc_);
exception when others then
  execute 'reset role';
  perform pg_temp.fail(desc_ || ' (falló: ' || sqlerrm || ')');
end $$;

-- Ejecuta `sql_` como `uid_` y verifica que NO tuvo efecto: en Postgres un
-- UPDATE cuya fila RLS filtra afecta 0 filas y NO lanza error. Es seguro,
-- pero hay que aseverar el efecto, no la excepción.
create or replace function pg_temp.sin_efecto(desc_ text, uid_ uuid, sql_ text, comprobacion_ text)
returns void language plpgsql as $$
declare v boolean;
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', uid_);
  begin
    execute sql_;
  exception when others then null;  -- rechazo explícito también vale
  end;
  execute 'reset role';
  execute comprobacion_ into v;
  if v then
    perform pg_temp.fail(desc_ || ' (el cambio SÍ se aplicó)');
  else
    perform pg_temp.ok(desc_);
  end if;
end $$;

-- Cuenta filas visibles para `uid_`.
create or replace function pg_temp.visibles(uid_ uuid, sql_ text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', uid_);
  execute 'select count(*) from (' || sql_ || ') s' into n;
  execute 'reset role';
  return n;
end $$;

-- ======================================================================
-- Datos de prueba
-- ======================================================================
do $$
declare
  v_alumno   uuid := '11111111-1111-1111-1111-111111111111';
  v_otro     uuid := '22222222-2222-2222-2222-222222222222';
  v_admin    uuid := '33333333-3333-3333-3333-333333333333';
  v_curso    uuid;
  v_modulo   uuid;
  v_lec_a    uuid;
  v_lec_b    uuid;
begin
  insert into auth.users (id, email) values
    (v_alumno, 'alumno@test.mx'), (v_otro, 'otro@test.mx'), (v_admin, 'admin@test.mx')
  on conflict (id) do nothing;

  -- 022_handle_new_user.sql dispara un trigger AFTER INSERT sobre auth.users
  -- que YA crea la fila de perfiles (con es_admin = false). Por eso aquí hace
  -- falta DO UPDATE: con DO NOTHING el admin de prueba se quedaba sin permisos
  -- y las aserciones de "un admin SÍ puede..." pasaban en falso.
  insert into public.perfiles (id, nombres, apellido_paterno, correo, telefono_movil, es_admin)
  values
    (v_alumno, 'Ana',  'Alumna',  'alumno@test.mx', '5550000001', false),
    (v_otro,   'Beto', 'Otro',    'otro@test.mx',   '5550000002', false),
    (v_admin,  'Caro', 'Admin',   'admin@test.mx',  '5550000003', true)
  on conflict (id) do update set
    nombres        = excluded.nombres,
    correo         = excluded.correo,
    telefono_movil = excluded.telefono_movil,
    es_admin       = excluded.es_admin;

  insert into public.cursos (slug, titulo, publicado)
  values ('curso-rls-test', 'Curso RLS', true)
  on conflict (slug) do nothing;
  select id into v_curso from public.cursos where slug = 'curso-rls-test';

  -- 032_course_builder.sql elimina los unique (curso_id, orden) para permitir
  -- reordenar, así que aquí no se puede usar ON CONFLICT sobre esas columnas.
  delete from public.modulos where curso_id = v_curso;

  insert into public.modulos (curso_id, orden, titulo)
  values (v_curso, 1, 'Módulo 1') returning id into v_modulo;

  insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg)
  values (v_modulo, 1, 'Lección A', 'video', 600) returning id into v_lec_a;
  insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg)
  values (v_modulo, 2, 'Lección B', 'video', 600) returning id into v_lec_b;

  -- Los dos alumnos comparten curso: es la condición que activa la política
  -- "perfiles: leer companeros de curso".
  insert into public.inscripciones (user_id, curso_id) values
    (v_alumno, v_curso), (v_otro, v_curso)
  on conflict (user_id, curso_id) do nothing;

  -- El archivo debe poder re-ejecutarse contra la misma base: el bloque 5
  -- deja el curso completo y una constancia emitida, así que hay que limpiar
  -- el estado de los usuarios de prueba antes de empezar.
  delete from public.dependencias
   where nombre in ('Dependencia Falsa', 'Dependencia Legítima');
  delete from public.constancias where user_id in (v_alumno, v_otro, v_admin);
  delete from public.progreso    where user_id in (v_alumno, v_otro, v_admin);
  delete from public.log_puntos  where usuario_id in (v_alumno, v_otro, v_admin);
  delete from public.curso_firmantes;
  delete from public.curso_constancia;
  delete from public.funcionarios;
  delete from public.rate_limit where scope = 'verificar_constancia';

  create temp table if not exists t_ids (k text primary key, v uuid);
  delete from t_ids;
  insert into t_ids values
    ('alumno', v_alumno), ('otro', v_otro), ('admin', v_admin),
    ('curso', v_curso), ('lec_a', v_lec_a), ('lec_b', v_lec_b);
end $$;

-- ======================================================================
-- 1. Escalada de privilegios (migración 057)
-- ======================================================================
\echo '── 1. Escalada de privilegios ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        o uuid := (select v from t_ids where k='otro');
        d uuid := (select v from t_ids where k='admin');
begin
  perform pg_temp.debe_fallar(
    'un alumno NO puede hacerse es_admin en su propia fila',
    a, format('update public.perfiles set es_admin = true where id = %L', a));

  perform pg_temp.debe_fallar(
    'un alumno NO puede hacerse es_instructor en su propia fila',
    a, format('update public.perfiles set es_instructor = true where id = %L', a));

  perform pg_temp.sin_efecto(
    'un alumno NO puede promover a otro usuario',
    a, format('update public.perfiles set es_admin = true where id = %L', o),
    format('select coalesce((select es_admin from public.perfiles where id = %L), false)', o));

  perform pg_temp.debe_pasar(
    'un alumno SÍ puede editar sus datos no sensibles (cargo)',
    a, format('update public.perfiles set cargo = ''Analista'' where id = %L', a));

  perform pg_temp.debe_pasar(
    'un admin SÍ puede promover a instructor',
    d, format('update public.perfiles set es_instructor = true where id = %L', o));
end $$;

-- ======================================================================
-- 2. Fuga del padrón de datos personales (migración 058)
-- ======================================================================
\echo '── 2. Datos personales entre co-inscritos ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        n bigint;
begin
  n := pg_temp.visibles(a, 'select 1 from public.perfiles');
  if n > 1 then
    perform pg_temp.fail(format(
      'un alumno ve %s filas de perfiles; debe ver solo la suya', n));
  else
    perform pg_temp.ok('un alumno solo ve su propia fila de perfiles');
  end if;

  n := pg_temp.visibles(a,
    format('select 1 from public.perfiles where correo is not null and id <> %L', a));
  if n > 0 then
    perform pg_temp.fail('un alumno alcanza el correo de otros usuarios');
  else
    perform pg_temp.ok('un alumno no alcanza el correo de otros usuarios');
  end if;

  -- Contraparte: el caso de uso legítimo debe seguir funcionando. Si esto
  -- falla, se rompieron los embeds de foros, chat y comentarios.
  n := pg_temp.visibles(a, 'select 1 from public.perfiles_publicos');
  if n < 2 then
    perform pg_temp.fail(format(
      'un alumno ve %s perfiles públicos; debería ver el suyo y el del compañero', n));
  else
    perform pg_temp.ok('un alumno SÍ ve el nombre de sus compañeros (perfiles_publicos)');
  end if;

  -- Y la vista no debe filtrar contacto ni bandera de admin.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles_publicos'
      and column_name in ('correo', 'telefono_movil', 'cargo', 'es_admin', 'aviso_privacidad')
  ) then
    perform pg_temp.fail('perfiles_publicos expone columnas sensibles');
  else
    perform pg_temp.ok('perfiles_publicos no expone correo/teléfono/cargo/es_admin');
  end if;
end $$;

-- ======================================================================
-- 3. Progreso: inscripción y continuidad (migración 058)
-- ======================================================================
\echo '── 3. Integridad del progreso ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        la uuid := (select v from t_ids where k='lec_a');
begin
  perform pg_temp.debe_fallar(
    'no se puede marcar completada una lección de video sin haberla visto',
    a, format($q$insert into public.progreso (user_id, leccion_id, completado)
                 values (%L, %L, true)$q$, a, la));

  perform pg_temp.debe_pasar(
    'sí se puede registrar avance parcial',
    a, format($q$insert into public.progreso (user_id, leccion_id, segundos_vistos, completado)
                 values (%L, %L, 120, false)
                 on conflict (user_id, leccion_id) do update
                 set segundos_vistos = 120$q$, a, la));
end $$;

-- ======================================================================
-- 4. dependencias (migración 057)
-- ======================================================================
\echo '── 3b. Cadena completa: progreso → constancia ──'
do $$
declare a  uuid := (select v from t_ids where k='alumno');
        la uuid := (select v from t_ids where k='lec_a');
        lb uuid := (select v from t_ids where k='lec_b');
        c  uuid := (select v from t_ids where k='curso');
        n  bigint;
begin
  -- El ataque original: marcar todo como completo y pedir la constancia.
  perform pg_temp.debe_fallar(
    'marcar_leccion_completada rechaza un video no visto',
    a, format('select public.marcar_leccion_completada(%L)', la));

  -- guardar_posicion ya no permite inflar el contador por encima de la duración.
  perform pg_temp.debe_pasar(
    'guardar_posicion acepta una posición válida',
    a, format('select public.guardar_posicion(%L, 999999)', la));

  select segundos_vistos into n from public.progreso
   where user_id = a and leccion_id = la;
  if n > 600 then
    perform pg_temp.fail(format(
      'guardar_posicion guardó %s s en una lección de 600 s (sin acotar)', n));
  else
    perform pg_temp.ok(format('guardar_posicion acota a la duración real (%s s)', n));
  end if;

  -- Con el video visto de verdad, completar sí procede.
  perform pg_temp.debe_pasar(
    'con el video visto, marcar_leccion_completada procede',
    a, format('select public.marcar_leccion_completada(%L)', la));

  -- Falta la lección B: no debe haber constancia todavía.
  select count(*) into n from public.constancias where user_id = a and curso_id = c;
  if n > 0 then
    perform pg_temp.fail('se emitió constancia con el curso incompleto');
  else
    perform pg_temp.ok('no se emite constancia con el curso incompleto');
  end if;

  -- Y un no inscrito no puede ni registrar posición.
  perform pg_temp.debe_fallar(
    'un no inscrito no puede registrar posición en el curso',
    (select v from t_ids where k='admin'),
    format('select public.guardar_posicion(%L, 10)', lb));
end $$;

\echo '── 4. Catálogo de dependencias ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        d uuid := (select v from t_ids where k='admin');
begin
  perform pg_temp.debe_fallar(
    'un alumno NO puede escribir en el catálogo de dependencias',
    a, 'insert into public.dependencias (nombre) values (''Dependencia Falsa'')');

  perform pg_temp.debe_pasar(
    'un admin SÍ puede escribir en el catálogo',
    d, 'insert into public.dependencias (nombre) values (''Dependencia Legítima'')');
end $$;

\echo '── 5. Constancias: folio y verificación pública ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        c uuid := (select v from t_ids where k='curso');
        lb uuid := (select v from t_ids where k='lec_b');
        f1 text; f2 text; n int;
begin
  -- El folio ya no lleva el prefijo del curso ni un sufijo de 5 dígitos.
  f1 := public.generar_folio_constancia();
  f2 := public.generar_folio_constancia();

  if f1 = f2 then
    perform pg_temp.fail('generar_folio_constancia() devolvió el mismo folio dos veces');
  else
    perform pg_temp.ok('el folio es distinto en llamadas sucesivas');
  end if;

  if f1 !~ '^CON-[0-9]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then
    perform pg_temp.fail('formato de folio inesperado: ' || f1);
  else
    perform pg_temp.ok('formato de folio correcto (' || f1 || ')');
  end if;

  -- El folio no debe contener el prefijo del curso: era lo que lo hacía
  -- enumerable a partir de una URL pública.
  if position(upper(substr(c::text, 1, 4)) in f1) > 0 then
    perform pg_temp.fail('el folio sigue derivándose del id del curso');
  else
    perform pg_temp.ok('el folio no se deriva del id del curso');
  end if;

  -- Completar el curso entero: ahora sí debe emitirse constancia.
  -- El claim se fija ANTES: guardar_posicion y marcar_leccion_completada
  -- resuelven al usuario con auth.uid().
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.guardar_posicion(lb, 600);
  perform public.marcar_leccion_completada(lb);

  select count(*) into n from public.constancias where user_id = a and curso_id = c;
  if n <> 1 then
    perform pg_temp.fail(format('se esperaba 1 constancia al terminar el curso, hay %s', n));
  else
    perform pg_temp.ok('al completar el curso se emite exactamente una constancia');
  end if;

  -- Idempotencia: repetir no debe emitir otra ni cambiar el folio.
  select folio into f1 from public.constancias where user_id = a and curso_id = c;
  perform public._emitir_constancia_si_procede(a, lb);
  select count(*) into n from public.constancias where user_id = a and curso_id = c;
  select folio into f2 from public.constancias where user_id = a and curso_id = c;
  if n <> 1 or f1 <> f2 then
    perform pg_temp.fail('reemitir cambió el folio o duplicó la constancia');
  else
    perform pg_temp.ok('reemitir es idempotente y conserva el folio');
  end if;
end $$;

-- Límite de tasa: la verificación 21 dentro del minuto debe rechazarse.
do $$
declare f text; i int; ok_ boolean := false;
begin
  select folio into f from public.constancias limit 1;
  delete from public.rate_limit where scope = 'verificar_constancia';
  begin
    for i in 1..25 loop
      perform public.verificar_constancia(f);
    end loop;
  exception when sqlstate '53400' then
    ok_ := true;
  end;
  if ok_ then
    perform pg_temp.ok('verificar_constancia limita la tasa (evita enumeración)');
  else
    perform pg_temp.fail('verificar_constancia aceptó 25 llamadas seguidas sin frenar');
  end if;
  delete from public.rate_limit where scope = 'verificar_constancia';
end $$;

\echo '── 6. Feature flags: apagado real, no cosmético ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        c uuid := (select v from t_ids where k='curso');
        f uuid;
begin
  -- Con el módulo ENCENDIDO, un inscrito puede crear un hilo.
  update public.feature_toggles set enabled = true where key = 'foros';

  delete from public.foros where curso_id = c;
  insert into public.foros (curso_id, titulo) values (c, 'Foro de prueba')
    returning id into f;

  perform pg_temp.debe_pasar(
    'con foros ENCENDIDO, un inscrito crea un hilo',
    a, format($q$insert into public.foro_hilos (foro_id, autor_id, titulo, cuerpo)
                 values (%L, %L, 'Hola', 'Contenido de prueba')$q$, f, a));

  -- Con el módulo APAGADO, la tabla debe cerrarse: es la diferencia entre
  -- ocultar la interfaz y cerrar la puerta. Este es el caso que antes fallaba.
  update public.feature_toggles set enabled = false where key = 'foros';

  perform pg_temp.debe_fallar(
    'con foros APAGADO, el INSERT directo por PostgREST se rechaza',
    a, format($q$insert into public.foro_hilos (foro_id, autor_id, titulo, cuerpo)
                 values (%L, %L, 'Colado', 'No debería entrar')$q$, f, a));

  if pg_temp.visibles(a, 'select 1 from public.foro_hilos') > 0 then
    perform pg_temp.fail('con foros APAGADO, los hilos siguen siendo legibles');
  else
    perform pg_temp.ok('con foros APAGADO, los hilos dejan de ser legibles');
  end if;

  -- Y al reencenderlo, todo vuelve: el apagado no destruye datos.
  update public.feature_toggles set enabled = true where key = 'foros';
  if pg_temp.visibles(a, 'select 1 from public.foro_hilos') = 0 then
    perform pg_temp.fail('al reencender foros los hilos no reaparecen');
  else
    perform pg_temp.ok('al reencender foros los datos siguen ahí');
  end if;

  delete from public.foros where curso_id = c;
end $$;

-- El flag solo lo escribe un administrador.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        d uuid := (select v from t_ids where k='admin');
begin
  perform pg_temp.sin_efecto(
    'un alumno NO puede encender un módulo',
    a, 'update public.feature_toggles set enabled = true where key = ''cohorts''',
    'select coalesce((select enabled from public.feature_toggles where key = ''cohorts''), false)');

  perform pg_temp.debe_pasar(
    'un admin SÍ puede cambiar un flag desde la aplicación',
    d, 'update public.feature_toggles set enabled = true where key = ''cohorts''');

  update public.feature_toggles set enabled = false where key = 'cohorts';
end $$;

\echo '── 7. Derechos ARCO (LFPDPPP) ──'
do $$
declare o uuid := (select v from t_ids where k='otro');
        c uuid := (select v from t_ids where k='curso');
        j jsonb; n int;
begin
  perform set_config('request.jwt.claim.sub', o::text, true);

  -- ACCESO: el export debe traer los datos del titular, y solo los suyos.
  j := public.exportar_mis_datos();
  if (j -> 'titular' ->> 'correo') is null then
    perform pg_temp.fail('exportar_mis_datos no devuelve los datos del titular');
  else
    perform pg_temp.ok('exportar_mis_datos devuelve los datos del titular');
  end if;

  if j -> 'inscripciones' = '[]'::jsonb then
    perform pg_temp.fail('el export no incluye las inscripciones');
  else
    perform pg_temp.ok('el export incluye inscripciones, progreso y constancias');
  end if;

  -- La confirmación literal es obligatoria: sin ella no se borra nada.
  begin
    perform public.eliminar_mis_datos('sí, bórralo');
    perform pg_temp.fail('eliminar_mis_datos aceptó una confirmación incorrecta');
  exception when sqlstate '22023' then
    perform pg_temp.ok('eliminar_mis_datos exige la confirmación literal');
  end;

  -- CANCELACIÓN.
  insert into public.constancias (user_id, curso_id, folio, hash_verif)
  values (o, c, public.generar_folio_constancia(), 'abc')
  on conflict (user_id, curso_id) do nothing;

  j := public.eliminar_mis_datos('ELIMINAR MIS DATOS');

  select count(*) into n from public.perfiles
   where id = o and (correo like 'baja+%' and nombres = 'Titular');
  if n <> 1 then
    perform pg_temp.fail('el perfil no quedó anonimizado tras la baja');
  else
    perform pg_temp.ok('la baja anonimiza el perfil');
  end if;

  select count(*) into n from public.progreso where user_id = o;
  if n > 0 then
    perform pg_temp.fail('la baja dejó telemetría de progreso');
  else
    perform pg_temp.ok('la baja borra la telemetría de comportamiento');
  end if;

  -- La constancia sobrevive: su folio sigue verificando. Es la tensión entre
  -- cancelación e integridad de un documento ya emitido; ver migración 064.
  select count(*) into n from public.constancias where user_id = o;
  if n <> 1 then
    perform pg_temp.fail('la baja destruyó una constancia ya emitida');
  else
    perform pg_temp.ok('la baja conserva las constancias emitidas (folio verificable)');
  end if;

  if (j ->> 'constancias_conservadas')::int <> 1 then
    perform pg_temp.fail('el resultado de la baja no informa de las constancias');
  else
    perform pg_temp.ok('la baja informa al titular de lo que se conservó');
  end if;
end $$;

-- La depuración de telemetría es solo para administradores.
do $$
declare a uuid := (select v from t_ids where k='alumno');
begin
  perform pg_temp.debe_fallar(
    'un alumno NO puede depurar la telemetría',
    a, 'select public.depurar_telemetria(730)');
end $$;

\echo '── 8. Subtítulos y accesibilidad ──'
do $$
declare a  uuid := (select v from t_ids where k='alumno');
        d  uuid := (select v from t_ids where k='admin');
        la uuid := (select v from t_ids where k='lec_a');
        n  bigint;
begin
  delete from public.leccion_subtitulos where leccion_id = la;

  -- El informe de conformidad debe señalar la lección sin subtítulos.
  select count(*) into n from public.v_lecciones_sin_subtitulos where leccion_id = la;
  if n <> 1 then
    perform pg_temp.fail('v_lecciones_sin_subtitulos no detecta una lección sin pista');
  else
    perform pg_temp.ok('el informe detecta las lecciones de video sin subtítulos');
  end if;

  perform pg_temp.debe_fallar(
    'un alumno NO puede subir subtítulos',
    a, format($q$insert into public.leccion_subtitulos (leccion_id, contenido_vtt)
                 values (%L, 'WEBVTT')$q$, la));

  perform pg_temp.debe_pasar(
    'un admin SÍ puede subir subtítulos',
    d, format($q$insert into public.leccion_subtitulos (leccion_id, contenido_vtt)
                 values (%L, 'WEBVTT

1
00:00:00.000 --> 00:00:01.000
Hola
')$q$, la));

  -- Y cualquiera puede leerlos: si no, el reproductor no podría pintarlos.
  if pg_temp.visibles(a, format('select 1 from public.leccion_subtitulos where leccion_id = %L', la)) <> 1 then
    perform pg_temp.fail('un alumno no puede leer los subtítulos de su lección');
  else
    perform pg_temp.ok('los subtítulos son legibles por quien reproduce');
  end if;

  select count(*) into n from public.v_lecciones_sin_subtitulos where leccion_id = la;
  if n <> 0 then
    perform pg_temp.fail('el informe sigue marcando una lección que ya tiene subtítulos');
  else
    perform pg_temp.ok('el informe deja de marcarla al cargar la pista');
  end if;

  delete from public.leccion_subtitulos where leccion_id = la;
end $$;

\echo '── 9. Revocación de constancias ──'
do $$
declare a uuid := (select v from t_ids where k='alumno');
        d uuid := (select v from t_ids where k='admin');
        f text; r record;
begin
  select folio into f from public.constancias limit 1;
  delete from public.rate_limit where scope = 'verificar_constancia';

  -- Estado inicial: vigente.
  select * into r from public.verificar_constancia(f);
  if r.estado <> 'vigente' then
    perform pg_temp.fail('una constancia recién emitida no aparece como vigente');
  else
    perform pg_temp.ok('una constancia emitida se verifica como vigente');
  end if;

  perform pg_temp.debe_fallar(
    'un alumno NO puede revocar una constancia',
    a, format('select public.revocar_constancia(%L, ''prueba'')', f));

  -- El motivo es obligatorio: una revocación sin justificación no deja rastro
  -- de por qué se anuló un documento oficial.
  perform set_config('request.jwt.claim.sub', d::text, true);
  begin
    perform public.revocar_constancia(f, '   ');
    perform pg_temp.fail('se revocó sin motivo');
  exception when sqlstate '22023' then
    perform pg_temp.ok('la revocación exige un motivo');
  end;

  perform public.revocar_constancia(f, 'Emitida por error administrativo');

  delete from public.rate_limit where scope = 'verificar_constancia';
  select * into r from public.verificar_constancia(f);
  if r.estado <> 'revocada' then
    perform pg_temp.fail('la constancia revocada no aparece como revocada');
  else
    perform pg_temp.ok('la verificación pública distingue "revocada" de "no existe"');
  end if;
  if r.motivo_revocacion is null then
    perform pg_temp.fail('la verificación no informa del motivo');
  else
    perform pg_temp.ok('la verificación informa del motivo de la revocación');
  end if;

  -- Lo decisivo: el folio NO desaparece. Si se borrara, el portador quedaría
  -- con un papel indistinguible de una falsificación.
  if not exists (select 1 from public.constancias where folio = f) then
    perform pg_temp.fail('revocar borró la fila; el folio dejó de existir');
  else
    perform pg_temp.ok('revocar conserva la fila: el folio sigue siendo verificable');
  end if;

  -- Reactivar, para una revocación equivocada.
  perform public.reactivar_constancia(f);
  delete from public.rate_limit where scope = 'verificar_constancia';
  select * into r from public.verificar_constancia(f);
  if r.estado <> 'vigente' then
    perform pg_temp.fail('reactivar no devolvió la constancia a vigente');
  else
    perform pg_temp.ok('una revocación equivocada se puede deshacer');
  end if;

  -- Un folio inexistente devuelve cero filas, no un estado.
  delete from public.rate_limit where scope = 'verificar_constancia';
  if exists (select 1 from public.verificar_constancia('CON-1999-0000-0000-0000')) then
    perform pg_temp.fail('un folio inexistente devolvió una fila');
  else
    perform pg_temp.ok('un folio inexistente no devuelve nada');
  end if;

  delete from public.rate_limit where scope = 'verificar_constancia';
end $$;

\echo '── 10. Constancias: diseños y firmantes ──'
do $$
declare a  uuid := (select v from t_ids where k='alumno');
        d  uuid := (select v from t_ids where k='admin');
        c  uuid := (select v from t_ids where k='curso');
        f1 uuid; f2 uuid; cfg jsonb; cong jsonb; n int;
begin
  -- Catálogo de funcionarios y su asignación al curso.
  insert into public.funcionarios (nombre, cargo, firma_path)
    values ('Ana Directora', 'Directora General', 'firmas/ana.png') returning id into f1;
  insert into public.funcionarios (nombre, cargo, firma_path)
    values ('Beto Secretario', 'Secretario Técnico', 'firmas/beto.png') returning id into f2;
  insert into public.curso_firmantes (curso_id, funcionario_id, orden)
    values (c, f2, 2), (c, f1, 1);

  cfg := public.constancia_config(c);

  if jsonb_array_length(cfg -> 'firmantes') <> 2 then
    perform pg_temp.fail('constancia_config no devuelve los 2 firmantes');
  else
    perform pg_temp.ok('un curso puede tener varios firmantes');
  end if;

  if cfg -> 'firmantes' -> 0 ->> 'nombre' <> 'Ana Directora' then
    perform pg_temp.fail('los firmantes no respetan el orden');
  else
    perform pg_temp.ok('los firmantes salen en el orden configurado');
  end if;

  if cfg -> 'diseno' ->> 'clave' is null then
    perform pg_temp.fail('no se resolvió ningún diseño');
  else
    perform pg_temp.ok('se resuelve el diseño por defecto de la instalación');
  end if;

  -- Personalizar el texto de UN curso no debe obligar a duplicar el diseño.
  insert into public.curso_constancia (curso_id, texto_titulo)
    values (c, 'DIPLOMA') on conflict (curso_id) do update set texto_titulo = 'DIPLOMA';
  cfg := public.constancia_config(c);
  if cfg ->> 'texto_titulo' <> 'DIPLOMA' then
    perform pg_temp.fail('el texto del curso no sobrescribe al de la instalación');
  else
    perform pg_temp.ok('un curso puede sobrescribir un texto y heredar el resto');
  end if;
  if cfg ->> 'texto_pre' is null then
    perform pg_temp.fail('los textos no sobrescritos deberían heredarse');
  else
    perform pg_temp.ok('los textos no sobrescritos se heredan');
  end if;

  -- CONGELADO: lo esencial de un documento oficial.
  delete from public.constancias where user_id = a and curso_id = c;
  insert into public.constancias (user_id, curso_id, folio, hash_verif, diseno, firmantes, textos)
  values (a, c, public.generar_folio_constancia(), 'x',
          cfg -> 'diseno', cfg -> 'firmantes',
          jsonb_build_object('texto_titulo', cfg ->> 'texto_titulo'));

  -- Ahora cambia todo el catálogo: cargo, baja del funcionario y textos.
  update public.funcionarios set cargo = 'Ex Directora', activo = false where id = f1;
  delete from public.curso_firmantes where curso_id = c;
  update public.curso_constancia set texto_titulo = 'OTRA COSA' where curso_id = c;

  select firmantes, textos into cong, cfg from public.constancias
   where user_id = a and curso_id = c;

  if cong -> 0 ->> 'cargo' <> 'Directora General' then
    perform pg_temp.fail('la constancia emitida cambió de cargo al editar el catálogo');
  else
    perform pg_temp.ok('la constancia emitida conserva el cargo del momento de firma');
  end if;
  if jsonb_array_length(cong) <> 2 then
    perform pg_temp.fail('la constancia perdió firmantes al vaciar el catálogo');
  else
    perform pg_temp.ok('la constancia conserva sus firmantes aunque se retiren del curso');
  end if;
  if cfg ->> 'texto_titulo' <> 'DIPLOMA' then
    perform pg_temp.fail('el texto de la constancia emitida cambió');
  else
    perform pg_temp.ok('el texto de la constancia emitida no cambia');
  end if;

  -- No se puede borrar a alguien que ya firma (ON DELETE RESTRICT).
  insert into public.curso_firmantes (curso_id, funcionario_id, orden) values (c, f2, 1);
  begin
    delete from public.funcionarios where id = f2;
    perform pg_temp.fail('se borró un funcionario que figura como firmante');
  -- ON DELETE RESTRICT lanza restrict_violation (23001), no
  -- foreign_key_violation (23503), que es lo que produciría NO ACTION.
  exception when restrict_violation or foreign_key_violation then
    perform pg_temp.ok('no se puede borrar a un funcionario que firma un curso');
  end;
end $$;

-- Solo un administrador toca los catálogos.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        d uuid := (select v from t_ids where k='admin');
begin
  perform pg_temp.debe_fallar(
    'un alumno NO puede dar de alta funcionarios',
    a, 'insert into public.funcionarios (nombre, cargo) values (''Falso'',''Falso'')');
  perform pg_temp.debe_pasar(
    'un admin SÍ puede dar de alta funcionarios',
    d, 'insert into public.funcionarios (nombre, cargo) values (''Caro'',''Coordinadora'')');
  -- Pero cualquiera autenticado debe poder LEERLOS: si no, no se puede pintar
  -- la constancia.
  if pg_temp.visibles(a, 'select 1 from public.funcionarios') = 0 then
    perform pg_temp.fail('un alumno no puede leer los funcionarios: la constancia no se pintaría');
  else
    perform pg_temp.ok('los funcionarios son legibles por quien pinta su constancia');
  end if;
end $$;

\echo '── 11. Avance por módulo ──'
do $$
declare a  uuid := (select v from t_ids where k='alumno');
        o  uuid := (select v from t_ids where k='otro');
        c  uuid := (select v from t_ids where k='curso');
        la uuid := (select v from t_ids where k='lec_a');
        m  uuid; n bigint; pct int;
begin
  select modulo_id into m from public.lecciones where id = la;

  -- Los bloques anteriores dejaron el curso completo para este alumno. Se parte
  -- de cero aquí para medir el avance parcial.
  delete from public.constancias where user_id = a;
  delete from public.progreso    where user_id = a;

  perform set_config('request.jwt.claim.sub', a::text, true);
  if public.modulo_completado_por_usuario(a, m) then
    perform pg_temp.fail('el módulo figura completo sin haber completado nada');
  else
    perform pg_temp.ok('un módulo sin lecciones hechas no está completo');
  end if;

  select porcentaje into pct from public.v_progreso_modulo
   where user_id = a and modulo_id = m;
  if coalesce(pct, -1) <> 0 then
    perform pg_temp.fail(format('el porcentaje inicial debería ser 0, es %s', pct));
  else
    perform pg_temp.ok('la vista calcula 0% al inicio');
  end if;

  -- Completar una de las dos lecciones del módulo.
  perform public.guardar_posicion(la, 600);
  perform public.marcar_leccion_completada(la);

  select porcentaje into pct from public.v_progreso_modulo
   where user_id = a and modulo_id = m;
  if pct <> 50 then
    perform pg_temp.fail(format('con 1 de 2 lecciones el avance debería ser 50%%, es %s', pct));
  else
    perform pg_temp.ok('la vista refleja el avance parcial del módulo');
  end if;

  if public.modulo_completado_por_usuario(a, m) then
    perform pg_temp.fail('el módulo figura completo con solo una lección hecha');
  else
    perform pg_temp.ok('un módulo a medias no cuenta como completo');
  end if;

  if public.curso_completado_por_usuario(a, c) then
    perform pg_temp.fail('el curso figura completo a medias');
  else
    perform pg_temp.ok('el curso a medias no cuenta como completo');
  end if;
end $$;

-- Escalación horizontal: el avance de otra persona no se consulta.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        o uuid := (select v from t_ids where k='otro');
        c uuid := (select v from t_ids where k='curso');
        n bigint;
begin
  perform pg_temp.debe_fallar(
    'un alumno NO puede consultar si otro completó el curso',
    a, format('select public.curso_completado_por_usuario(%L, %L)', o, c));

  -- Y la vista solo muestra las filas propias.
  n := pg_temp.visibles(a, format('select 1 from public.v_progreso_modulo where user_id <> %L', a));
  if n > 0 then
    perform pg_temp.fail('v_progreso_modulo expone el avance de otras personas');
  else
    perform pg_temp.ok('v_progreso_modulo solo muestra el avance propio');
  end if;
end $$;

\echo ''
\echo '── 12. Documentos institucionales y consentimiento versionado ──'

-- El origen del cambio: los tres enlaces del pie apuntaban a '#' y el alta
-- recababa perfiles.aviso_privacidad contra un documento inexistente.

-- Las aserciones de «instalación nueva» solo valen la primera vez: esta misma
-- sección publica versiones más abajo. Se comprueban contra el estado sembrado
-- y se omiten si el archivo ya se corrió antes sobre esta base, para que
-- re-ejecutarlo en local no dé un fallo engañoso.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        n bigint;
        recien_migrada boolean := not exists (
          select 1 from public.documento_versiones where publicado_en is not null);
begin
  -- La siembra deja los tres documentos EN BORRADOR. Publicar una plantilla
  -- con marcadores {{ }} daría apariencia de cumplimiento.
  if (select count(distinct slug) from public.documento_versiones) <> 3 then
    perform pg_temp.fail('la migración no sembró los tres documentos');
  else
    perform pg_temp.ok('los tres documentos institucionales están sembrados');
  end if;

  if recien_migrada then
    if exists (select 1 from public.v_documento_vigente) then
      perform pg_temp.fail('una instalación nueva no debe traer nada publicado');
    else
      perform pg_temp.ok('ninguna versión vigente en una instalación nueva');
    end if;
  end if;

  -- Un borrador NO es legible por nadie salvo administradores. Se cuentan los
  -- BORRADORES visibles, no todas las filas: lo publicado sí debe verse, y
  -- contar el total daba un verde accidental cuando aún no había nada
  -- publicado.
  n := pg_temp.visibles(a,
        'select 1 from public.documento_versiones where publicado_en is null');
  if n > 0 then
    perform pg_temp.fail(format('un no-administrador ve %s borradores', n));
  else
    perform pg_temp.ok('los borradores no son legibles por quien no administra');
  end if;

  perform pg_temp.debe_fallar(
    'un no-administrador NO puede crear una versión',
    a, $q$insert into public.documento_versiones (slug, version, contenido)
          values ('contacto', 90, '{"type":"doc","content":[]}'::jsonb)$q$);
end $$;

-- Publicado: legible por todos, e inmutable.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        n bigint;
begin
  update public.documento_versiones
     set publicado_en = now()
   where slug = 'aviso-privacidad' and version = 1
     and publicado_en is null;

  n := pg_temp.visibles(a, 'select 1 from public.v_documento_vigente');
  if n < 1 then
    perform pg_temp.fail('la versión publicada no es legible');
  else
    perform pg_temp.ok('la versión publicada sí es legible');
  end if;

  begin
    update public.documento_versiones set contenido = '{"type":"doc"}'::jsonb
     where slug = 'aviso-privacidad' and version = 1;
    perform pg_temp.fail('se pudo MODIFICAR una versión publicada');
  exception when insufficient_privilege then
    perform pg_temp.ok('una versión publicada no se puede modificar');
  end;

  begin
    delete from public.documento_versiones
     where slug = 'aviso-privacidad' and version = 1;
    perform pg_temp.fail('se pudo BORRAR una versión publicada');
  exception when insufficient_privilege then
    perform pg_temp.ok('una versión publicada no se puede borrar');
  end;
end $$;

-- El consentimiento registra la versión, y no lo escribe el cliente.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        v_reg integer;
begin
  -- Se simula el estado de quien aceptó: la función es la única vía.
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', a);
  perform public.aceptar_aviso_vigente();
  execute 'reset role';

  -- Se compara contra la vigente REAL, no contra un número fijo: lo que se
  -- afirma es que la función escribe la vigente, sea cual sea.
  select aviso_version_aceptada into v_reg from public.perfiles where id = a;
  if v_reg is distinct from (select version from public.v_documento_vigente
                              where slug = 'aviso-privacidad') then
    perform pg_temp.fail(format('la versión aceptada quedó en %s y no coincide con la vigente', v_reg));
  else
    perform pg_temp.ok('aceptar registra la versión vigente');
  end if;

  -- Fabricar una aceptación es lo que hay que impedir: si el cliente pudiera
  -- fijar el número, el registro dejaría de valer como prueba.
  perform pg_temp.debe_fallar(
    'un usuario NO puede fijar a mano la versión aceptada',
    a, format('update public.perfiles set aviso_version_aceptada = 99 where id = %L', a));
end $$;

-- La regla de re-aceptación mira el INTERVALO, no solo la versión vigente.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        v_siguiente integer;
begin
  if public.aviso_requiere_reaceptacion(a) then
    perform pg_temp.fail('se exige re-aceptación sin haber publicado nada nuevo');
  else
    perform pg_temp.ok('sin versiones nuevas no se pide volver a aceptar');
  end if;

  -- Dos versiones nuevas: la PRIMERA exige volver a aceptar y la segunda no.
  -- Mirar solo la última perdería la obligación de la intermedia, que es
  -- exactamente el error que esta prueba fija.
  --
  -- Los números se calculan en vez de fijarse, para que el archivo se pueda
  -- volver a correr sobre la misma base sin dar un fallo engañoso.
  select coalesce(max(version), 0) into v_siguiente
    from public.documento_versiones where slug = 'aviso-privacidad';

  insert into public.documento_versiones (slug, version, contenido, publicado_en, requiere_reaceptacion)
  values ('aviso-privacidad', v_siguiente + 1, '{"type":"doc","content":[]}'::jsonb, now(), true),
         ('aviso-privacidad', v_siguiente + 2, '{"type":"doc","content":[]}'::jsonb, now(), false);

  if public.aviso_requiere_reaceptacion(a) then
    perform pg_temp.ok('una versión intermedia que la exigía sigue obligando');
  else
    perform pg_temp.fail('se perdió la obligación de la versión intermedia');
  end if;
end $$;

-- Retirar el consentimiento arrastra la versión: la baja ARCO (064) pone
-- aviso_privacidad = false sin conocer esta columna.
do $$
declare a uuid := (select v from t_ids where k='alumno');
        v_reg integer;
begin
  update public.perfiles set aviso_privacidad = false where id = a;
  select aviso_version_aceptada into v_reg from public.perfiles where id = a;
  if v_reg is not null then
    perform pg_temp.fail('el perfil dice «no aceptó» y a la vez conserva una versión');
  else
    perform pg_temp.ok('retirar el consentimiento limpia la versión aceptada');
  end if;
end $$;


\echo ''
\echo '── 13. Embudo de portada: anónimo escribe por la puerta estrecha, solo admin lee ──'

-- El canal de ingesta de la portada (076). Tres invariantes: la única vía de
-- escritura es la RPC, la lista blanca descarta sin ruido, y los datos no son
-- legibles para quien los genera.

do $$
declare v_antes bigint; v_despues bigint;
begin
  select count(*) into v_antes from public.portada_eventos;

  set local role anon;
  perform public.registrar_evento_portada('portada_hero_cta', 'hero', null, gen_random_uuid());
  perform public.registrar_evento_portada('portada_curso_click', 'cursos', 3, null);
  -- Un evento inventado NO debe lanzar: silencio deliberado, para no darle a
  -- un abusador la confirmación de que la lista existe.
  perform public.registrar_evento_portada('evento_inventado', null, null, null);
  reset role;

  select count(*) into v_despues from public.portada_eventos;
  if v_despues = v_antes + 2 then
    perform pg_temp.ok('la RPC inserta lo válido y descarta lo inventado sin error');
  else
    perform pg_temp.fail(format('se esperaban %s eventos y hay %s', v_antes + 2, v_despues));
  end if;
end $$;

do $$
declare v bigint;
begin
  set local role anon;
  select count(*) into v from public.portada_eventos;
  reset role;
  if v = 0 then
    perform pg_temp.ok('anónimo no lee los eventos que genera');
  else
    perform pg_temp.fail('anónimo puede leer portada_eventos');
  end if;
end $$;

do $$
begin
  set local role anon;
  begin
    insert into public.portada_eventos (evento) values ('portada_hero_cta');
    reset role;
    perform pg_temp.fail('anónimo insertó DIRECTO, saltándose la RPC y su límite');
  exception when insufficient_privilege or others then
    reset role;
    perform pg_temp.ok('la inserción directa está cerrada: la RPC es la única puerta');
  end;
end $$;

\echo ''
\echo '✅ Todas las pruebas de RLS pasaron'
