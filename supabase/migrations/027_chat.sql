-- =========================================================
-- Migration 027: chat en tiempo real por curso y aula virtual
-- =========================================================
-- Módulo 5 del plan LMS.
--
--  * mensajes_chat: sesion_id NULL = chat del curso;
--    con valor = chat del aula virtual (persistido con flag,
--    como permite el spec)
--  * RLS: inscritos + instructores leen/escriben en su curso
--  * Eliminar mensajes: SOLO instructor vía RPC
--    eliminar_mensaje_chat() → escribe log_moderacion
--    (tipo 'mensaje_chat', previsto desde la migración 023)
--  * Realtime: postgres_changes; replica identity full para
--    que los DELETE lleguen con la fila completa al cliente
--  * Fix de visibilidad de nombres: policy "perfiles: leer
--    compañeros de curso" — sin ella, los embeds de perfiles
--    en chat/foros/comentarios devuelven null entre alumnos.
--  * participantes_curso(): lista para autocompletar @menciones
-- =========================================================

create table if not exists public.mensajes_chat (
  id        uuid primary key default gen_random_uuid(),
  curso_id  uuid not null references public.cursos(id) on delete cascade,
  sesion_id uuid references public.sesiones_virtuales(id) on delete cascade,
  user_id   uuid not null references public.perfiles(id) on delete cascade,
  contenido text not null check (char_length(contenido) between 1 and 1000),
  creado_en timestamptz not null default now()
);
create index if not exists mensajes_chat_curso_idx
  on public.mensajes_chat(curso_id, sesion_id, creado_en);

-- DELETE por realtime llega con la fila completa (no solo el PK),
-- necesario para que el filtro curso_id aplique en el cliente.
alter table public.mensajes_chat replica identity full;

-- ---------- Helper: ¿comparto curso con este perfil? ----------
-- Permite a un alumno ver el NOMBRE de compañeros e instructores de
-- sus cursos (embeds de perfiles en chat, foros y comentarios).
create or replace function public.comparte_curso_con(p_perfil uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.inscripciones mias
    join public.inscripciones suyas on suyas.curso_id = mias.curso_id
    where mias.user_id = auth.uid() and suyas.user_id = p_perfil
  ) or exists (
    select 1
    from public.inscripciones mias
    join public.cursos_instructores ci on ci.curso_id = mias.curso_id
    where mias.user_id = auth.uid() and ci.user_id = p_perfil
  );
$$;

grant execute on function public.comparte_curso_con(uuid) to authenticated;

drop policy if exists "perfiles: leer companeros de curso" on public.perfiles;
create policy "perfiles: leer companeros de curso"
  on public.perfiles for select to authenticated
  using (public.comparte_curso_con(id));

-- ---------- RLS de mensajes ----------
alter table public.mensajes_chat enable row level security;

drop policy if exists "chat: leer" on public.mensajes_chat;
create policy "chat: leer"
  on public.mensajes_chat for select to authenticated
  using (public.esta_inscrito(curso_id) or public.is_instructor_de(curso_id));

drop policy if exists "chat: enviar" on public.mensajes_chat;
create policy "chat: enviar"
  on public.mensajes_chat for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.esta_inscrito(curso_id) or public.is_instructor_de(curso_id))
  );

-- Sin UPDATE (los mensajes no se editan) ni DELETE directo (solo RPC).

-- ---------- RPC: eliminar mensaje (instructor) ----------
create or replace function public.eliminar_mensaje_chat(p_mensaje uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.mensajes_chat;
begin
  select * into v_row from public.mensajes_chat where id = p_mensaje;
  if not found then
    raise exception 'mensaje no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;

  insert into public.log_moderacion (moderador_id, curso_id, tipo_objetivo, objetivo_id, accion)
  values (auth.uid(), v_row.curso_id, 'mensaje_chat', p_mensaje, 'eliminar');

  delete from public.mensajes_chat where id = p_mensaje;
end $$;

grant execute on function public.eliminar_mensaje_chat(uuid) to authenticated;

-- ---------- RPC: participantes del curso (para @menciones) ----------
-- Los alumnos no pueden leer inscripciones ajenas; esta función
-- devuelve la lista mínima (id, nombre, rol) a quien participa.
create or replace function public.participantes_curso(p_curso uuid)
returns table (user_id uuid, nombre text, es_instructor boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         trim(p.nombres || ' ' || p.apellido_paterno) as nombre,
         exists (
           select 1 from public.cursos_instructores ci
           where ci.curso_id = p_curso and ci.user_id = p.id
         ) as es_instructor
  from public.perfiles p
  where (public.esta_inscrito(p_curso) or public.is_instructor_de(p_curso))
    and (
      p.id in (select i.user_id from public.inscripciones i where i.curso_id = p_curso)
      or p.id in (select ci.user_id from public.cursos_instructores ci where ci.curso_id = p_curso)
    );
$$;

grant execute on function public.participantes_curso(uuid) to authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.mensajes_chat;
