-- =========================================================
-- Migration 023: rol instructor + moderación de comentarios
-- =========================================================
-- Módulo 1 del plan LMS: infraestructura de rol instructor.
--  * perfiles.es_instructor (boolean, mismo patrón que es_admin)
--  * cursos_instructores: asignación instructor ↔ curso (la hace admin)
--  * log_moderacion: auditoría de acciones (compartida con foros/chat/entregas)
--  * comentarios.oculto / comentarios.destacado
--  * Helpers SECURITY DEFINER (patrón de is_admin, migración 006)
--  * RPC moderar_comentario: única vía de moderación; acción + log
--    en la misma transacción. No existe policy de UPDATE sobre
--    comentarios ajenos → un instructor jamás puede editar contenido.
-- =========================================================

-- ---------- perfiles: flag de rol ----------
alter table public.perfiles
  add column if not exists es_instructor boolean not null default false;

-- ---------- Asignación instructor ↔ curso ----------
create table if not exists public.cursos_instructores (
  curso_id    uuid not null references public.cursos(id)   on delete cascade,
  user_id     uuid not null references public.perfiles(id) on delete cascade,
  asignado_en timestamptz not null default now(),
  primary key (curso_id, user_id)
);
create index if not exists cursos_instructores_user_idx
  on public.cursos_instructores(user_id);

-- ---------- Log de moderación ----------
create table if not exists public.log_moderacion (
  id            uuid primary key default gen_random_uuid(),
  moderador_id  uuid not null references public.perfiles(id),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  tipo_objetivo text not null check (tipo_objetivo in
                  ('comentario','hilo_foro','respuesta_foro','mensaje_chat','entrega')),
  objetivo_id   uuid not null,
  accion        text not null check (accion in
                  ('ocultar','mostrar','destacar','quitar_destacado','eliminar')),
  creado_en     timestamptz not null default now()
);
create index if not exists log_moderacion_curso_idx
  on public.log_moderacion(curso_id, creado_en desc);

-- ---------- comentarios: flags de moderación ----------
alter table public.comentarios
  add column if not exists oculto    boolean not null default false,
  add column if not exists destacado boolean not null default false;

-- ---------- Helpers (SECURITY DEFINER, anti-recursión RLS) ----------
create or replace function public.is_instructor()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_instructor from public.perfiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_instructor_de(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.cursos_instructores
    where curso_id = p_curso and user_id = auth.uid()
  );
$$;

create or replace function public.curso_de_leccion(p_leccion uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select m.curso_id
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where l.id = p_leccion;
$$;

-- ¿El instructor actual puede ver este perfil? (alumno inscrito en
-- alguno de sus cursos). Bypassea RLS para evitar evaluación
-- policy-sobre-policy entre perfiles ↔ inscripciones.
create or replace function public.instructor_puede_ver_perfil(p_perfil uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.inscripciones i
    join public.cursos_instructores ci on ci.curso_id = i.curso_id
    where i.user_id = p_perfil and ci.user_id = auth.uid()
  );
$$;

grant execute on function public.is_instructor()                   to authenticated, anon;
grant execute on function public.is_instructor_de(uuid)            to authenticated, anon;
grant execute on function public.curso_de_leccion(uuid)            to authenticated, anon;
grant execute on function public.instructor_puede_ver_perfil(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.cursos_instructores enable row level security;
alter table public.log_moderacion      enable row level security;

-- cursos_instructores: cualquiera autenticado puede LEER (la UI necesita
-- saber quién es instructor de qué curso para pintar badges); escribe admin.
drop policy if exists "cursos_instructores: leer" on public.cursos_instructores;
create policy "cursos_instructores: leer"
  on public.cursos_instructores for select to authenticated
  using (true);

drop policy if exists "cursos_instructores: admin escribir" on public.cursos_instructores;
create policy "cursos_instructores: admin escribir"
  on public.cursos_instructores for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- log_moderacion: leen instructores del curso y admin. SIN policy de
-- INSERT/UPDATE/DELETE → solo escribe la RPC (security definer).
drop policy if exists "log_moderacion: leer instructores" on public.log_moderacion;
create policy "log_moderacion: leer instructores"
  on public.log_moderacion for select to authenticated
  using (public.is_instructor_de(curso_id));

-- perfiles: admin puede actualizar (necesario para marcar es_instructor
-- desde el panel; hasta ahora solo existía "actualizar el propio").
drop policy if exists "perfiles: admin actualizar" on public.perfiles;
create policy "perfiles: admin actualizar"
  on public.perfiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- inscripciones: instructor lee las de sus cursos (lista de alumnos).
drop policy if exists "inscripciones: instructor leer" on public.inscripciones;
create policy "inscripciones: instructor leer"
  on public.inscripciones for select to authenticated
  using (public.is_instructor_de(curso_id));

-- perfiles: instructor lee perfiles de alumnos inscritos en sus cursos.
drop policy if exists "perfiles: instructor leer alumnos" on public.perfiles;
create policy "perfiles: instructor leer alumnos"
  on public.perfiles for select to authenticated
  using (public.instructor_puede_ver_perfil(id));

-- progreso: instructor lee el progreso en sus cursos (métricas dashboard).
drop policy if exists "progreso: instructor leer" on public.progreso;
create policy "progreso: instructor leer"
  on public.progreso for select to authenticated
  using (public.is_instructor_de(public.curso_de_leccion(leccion_id)));

-- comentarios: la lectura deja de ser using(true) — un comentario oculto
-- solo lo ven su autor, los instructores del curso y admin.
drop policy if exists "comentarios: leer" on public.comentarios;
create policy "comentarios: leer"
  on public.comentarios for select
  using (
    not oculto
    or auth.uid() = user_id
    or public.is_instructor_de(public.curso_de_leccion(leccion_id))
  );

-- ---------- RPC de moderación ----------
-- Única vía para ocultar/mostrar/destacar/eliminar comentarios de otros.
-- Valida instructor-ship, aplica la acción y escribe el log de forma
-- atómica. Devuelve el comentario afectado (null si fue eliminado).
create or replace function public.moderar_comentario(
  p_comentario_id uuid,
  p_accion        text
)
returns public.comentarios
language plpgsql security definer set search_path = public as $$
declare
  v_comentario public.comentarios;
  v_curso      uuid;
begin
  if p_accion not in ('ocultar','mostrar','destacar','quitar_destacado','eliminar') then
    raise exception 'accion invalida: %', p_accion;
  end if;

  select * into v_comentario
  from public.comentarios where id = p_comentario_id;
  if not found then
    raise exception 'comentario no existe';
  end if;

  v_curso := public.curso_de_leccion(v_comentario.leccion_id);
  if not public.is_instructor_de(v_curso) then
    raise exception 'no eres instructor de este curso';
  end if;

  insert into public.log_moderacion (moderador_id, curso_id, tipo_objetivo, objetivo_id, accion)
  values (auth.uid(), v_curso, 'comentario', p_comentario_id, p_accion);

  case p_accion
    when 'ocultar'          then update public.comentarios set oculto = true     where id = p_comentario_id returning * into v_comentario;
    when 'mostrar'          then update public.comentarios set oculto = false    where id = p_comentario_id returning * into v_comentario;
    when 'destacar'         then update public.comentarios set destacado = true  where id = p_comentario_id returning * into v_comentario;
    when 'quitar_destacado' then update public.comentarios set destacado = false where id = p_comentario_id returning * into v_comentario;
    when 'eliminar'         then delete from public.comentarios                  where id = p_comentario_id; v_comentario := null;
  end case;

  return v_comentario;
end $$;

grant execute on function public.moderar_comentario(uuid, text) to authenticated;
