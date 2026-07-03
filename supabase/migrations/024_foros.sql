-- =========================================================
-- Migration 024: módulo de foros por curso
-- =========================================================
-- Módulo 2 del plan LMS. Reutiliza la infraestructura del módulo 1
-- (log_moderacion, is_instructor_de, helpers SECURITY DEFINER).
--
--  * foros            uno o más por curso (Dudas, Proyecto final, …)
--  * foro_hilos       hilos creados por alumnos o instructores
--  * foro_respuestas  respuestas anidadas, máx 2 niveles (trigger)
--
-- Permisos (RLS):
--  * leer/participar: inscritos al curso + instructores + admin
--  * editar lo propio: ventana de 15 minutos (en la policy)
--  * moderar (ocultar/fijar/destacar/eliminar): solo vía RPC
--    moderar_foro(), que valida instructor-ship y escribe log
--    en la misma transacción. Un trigger impide que el autor
--    altere flags de moderación en sus propios updates.
-- =========================================================

-- ---------- Tablas ----------
create table if not exists public.foros (
  id          uuid primary key default gen_random_uuid(),
  curso_id    uuid not null references public.cursos(id) on delete cascade,
  titulo      text not null check (char_length(titulo) between 1 and 120),
  descripcion text,
  orden       int not null default 0,
  creado_en   timestamptz not null default now()
);
create index if not exists foros_curso_idx on public.foros(curso_id, orden);

create table if not exists public.foro_hilos (
  id             uuid primary key default gen_random_uuid(),
  foro_id        uuid not null references public.foros(id) on delete cascade,
  autor_id       uuid not null references public.perfiles(id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 1 and 200),
  cuerpo         text not null check (char_length(cuerpo) between 1 and 5000),
  fijado         boolean not null default false,
  oculto         boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists foro_hilos_foro_idx on public.foro_hilos(foro_id, fijado desc, creado_en desc);

create table if not exists public.foro_respuestas (
  id                 uuid primary key default gen_random_uuid(),
  hilo_id            uuid not null references public.foro_hilos(id) on delete cascade,
  respuesta_padre_id uuid references public.foro_respuestas(id) on delete cascade,
  autor_id           uuid not null references public.perfiles(id) on delete cascade,
  cuerpo             text not null check (char_length(cuerpo) between 1 and 5000),
  oculto             boolean not null default false,
  destacado          boolean not null default false,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index if not exists foro_respuestas_hilo_idx on public.foro_respuestas(hilo_id, creado_en);

-- ---------- log_moderacion: acciones nuevas (fijar hilos) ----------
alter table public.log_moderacion drop constraint if exists log_moderacion_accion_check;
alter table public.log_moderacion add constraint log_moderacion_accion_check
  check (accion in ('ocultar','mostrar','destacar','quitar_destacado','eliminar','fijar','quitar_fijado'));

-- ---------- Helpers ----------
create or replace function public.esta_inscrito(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.inscripciones
    where curso_id = p_curso and user_id = auth.uid()
  );
$$;

create or replace function public.curso_de_foro(p_foro uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select curso_id from public.foros where id = p_foro;
$$;

create or replace function public.curso_de_hilo(p_hilo uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select f.curso_id
  from public.foro_hilos h
  join public.foros f on f.id = h.foro_id
  where h.id = p_hilo;
$$;

-- Inscrito al curso del foro, o instructor del curso (o admin).
create or replace function public.puede_participar_foro(p_foro uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.esta_inscrito(public.curso_de_foro(p_foro))
      or public.is_instructor_de(public.curso_de_foro(p_foro));
$$;

grant execute on function public.esta_inscrito(uuid)         to authenticated, anon;
grant execute on function public.curso_de_foro(uuid)         to authenticated, anon;
grant execute on function public.curso_de_hilo(uuid)         to authenticated, anon;
grant execute on function public.puede_participar_foro(uuid) to authenticated, anon;

-- ---------- Trigger: máximo 2 niveles de anidación ----------
create or replace function public.foro_respuestas_validar()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_padre public.foro_respuestas;
begin
  if new.respuesta_padre_id is not null then
    select * into v_padre from public.foro_respuestas where id = new.respuesta_padre_id;
    if not found then
      raise exception 'la respuesta padre no existe';
    end if;
    if v_padre.hilo_id <> new.hilo_id then
      raise exception 'la respuesta padre pertenece a otro hilo';
    end if;
    if v_padre.respuesta_padre_id is not null then
      raise exception 'máximo 2 niveles de anidación';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists foro_respuestas_validar on public.foro_respuestas;
create trigger foro_respuestas_validar
  before insert or update of respuesta_padre_id, hilo_id on public.foro_respuestas
  for each row execute function public.foro_respuestas_validar();

-- ---------- Trigger: el autor no puede tocar flags de moderación ----------
-- (la RPC sí puede: corre con auth.uid() del instructor, que pasa el check)
create or replace function public.foro_guard_flags()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_curso uuid;
begin
  if tg_table_name = 'foro_hilos' then
    if (new.fijado is distinct from old.fijado or new.oculto is distinct from old.oculto) then
      v_curso := public.curso_de_foro(new.foro_id);
      if not public.is_instructor_de(v_curso) then
        raise exception 'solo un instructor puede moderar';
      end if;
    end if;
  else
    if (new.destacado is distinct from old.destacado or new.oculto is distinct from old.oculto) then
      v_curso := public.curso_de_hilo(new.hilo_id);
      if not public.is_instructor_de(v_curso) then
        raise exception 'solo un instructor puede moderar';
      end if;
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists foro_hilos_guard on public.foro_hilos;
create trigger foro_hilos_guard
  before update on public.foro_hilos
  for each row execute function public.foro_guard_flags();

drop trigger if exists foro_respuestas_guard on public.foro_respuestas;
create trigger foro_respuestas_guard
  before update on public.foro_respuestas
  for each row execute function public.foro_guard_flags();

-- ---------- RLS ----------
alter table public.foros           enable row level security;
alter table public.foro_hilos      enable row level security;
alter table public.foro_respuestas enable row level security;

-- foros: leen los que pueden participar; escribe instructor del curso (y admin)
drop policy if exists "foros: leer" on public.foros;
create policy "foros: leer"
  on public.foros for select to authenticated
  using (public.esta_inscrito(curso_id) or public.is_instructor_de(curso_id));

drop policy if exists "foros: instructor escribir" on public.foros;
create policy "foros: instructor escribir"
  on public.foros for all to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));

-- foro_hilos
drop policy if exists "foro_hilos: leer" on public.foro_hilos;
create policy "foro_hilos: leer"
  on public.foro_hilos for select to authenticated
  using (
    public.puede_participar_foro(foro_id)
    and (
      not oculto
      or autor_id = auth.uid()
      or public.is_instructor_de(public.curso_de_foro(foro_id))
    )
  );

drop policy if exists "foro_hilos: crear" on public.foro_hilos;
create policy "foro_hilos: crear"
  on public.foro_hilos for insert to authenticated
  with check (autor_id = auth.uid() and public.puede_participar_foro(foro_id));

-- edición propia con ventana de 15 minutos (los flags los protege el trigger)
drop policy if exists "foro_hilos: editar propio 15min" on public.foro_hilos;
create policy "foro_hilos: editar propio 15min"
  on public.foro_hilos for update to authenticated
  using (
    autor_id = auth.uid()
    and (creado_en > now() - interval '15 minutes'
         or public.is_instructor_de(public.curso_de_foro(foro_id)))
  )
  with check (autor_id = auth.uid());

-- foro_respuestas
drop policy if exists "foro_respuestas: leer" on public.foro_respuestas;
create policy "foro_respuestas: leer"
  on public.foro_respuestas for select to authenticated
  using (
    public.puede_participar_foro((select foro_id from public.foro_hilos where id = hilo_id))
    and (
      not oculto
      or autor_id = auth.uid()
      or public.is_instructor_de(public.curso_de_hilo(hilo_id))
    )
  );

drop policy if exists "foro_respuestas: crear" on public.foro_respuestas;
create policy "foro_respuestas: crear"
  on public.foro_respuestas for insert to authenticated
  with check (
    autor_id = auth.uid()
    and public.puede_participar_foro((select foro_id from public.foro_hilos where id = hilo_id))
  );

drop policy if exists "foro_respuestas: editar propio 15min" on public.foro_respuestas;
create policy "foro_respuestas: editar propio 15min"
  on public.foro_respuestas for update to authenticated
  using (
    autor_id = auth.uid()
    and (creado_en > now() - interval '15 minutes'
         or public.is_instructor_de(public.curso_de_hilo(hilo_id)))
  )
  with check (autor_id = auth.uid());

-- Sin policies de DELETE: eliminar es exclusivo de la RPC de moderación.

-- ---------- RPC de moderación de foros ----------
-- p_tipo: 'hilo' | 'respuesta'
-- acciones hilo:      ocultar | mostrar | fijar | quitar_fijado | eliminar
-- acciones respuesta: ocultar | mostrar | destacar | quitar_destacado | eliminar
create or replace function public.moderar_foro(
  p_tipo   text,
  p_id     uuid,
  p_accion text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_curso uuid;
begin
  if p_tipo = 'hilo' then
    if p_accion not in ('ocultar','mostrar','fijar','quitar_fijado','eliminar') then
      raise exception 'accion % invalida para hilos', p_accion;
    end if;
    select public.curso_de_foro(foro_id) into v_curso from public.foro_hilos where id = p_id;
  elsif p_tipo = 'respuesta' then
    if p_accion not in ('ocultar','mostrar','destacar','quitar_destacado','eliminar') then
      raise exception 'accion % invalida para respuestas', p_accion;
    end if;
    select public.curso_de_hilo(hilo_id) into v_curso from public.foro_respuestas where id = p_id;
  else
    raise exception 'tipo invalido: %', p_tipo;
  end if;

  if v_curso is null then
    raise exception '% no existe', p_tipo;
  end if;
  if not public.is_instructor_de(v_curso) then
    raise exception 'no eres instructor de este curso';
  end if;

  insert into public.log_moderacion (moderador_id, curso_id, tipo_objetivo, objetivo_id, accion)
  values (
    auth.uid(), v_curso,
    case p_tipo when 'hilo' then 'hilo_foro' else 'respuesta_foro' end,
    p_id, p_accion
  );

  if p_tipo = 'hilo' then
    case p_accion
      when 'ocultar'       then update public.foro_hilos set oculto = true   where id = p_id;
      when 'mostrar'       then update public.foro_hilos set oculto = false  where id = p_id;
      when 'fijar'         then update public.foro_hilos set fijado = true   where id = p_id;
      when 'quitar_fijado' then update public.foro_hilos set fijado = false  where id = p_id;
      when 'eliminar'      then delete from public.foro_hilos                where id = p_id;
    end case;
  else
    case p_accion
      when 'ocultar'          then update public.foro_respuestas set oculto = true     where id = p_id;
      when 'mostrar'          then update public.foro_respuestas set oculto = false    where id = p_id;
      when 'destacar'         then update public.foro_respuestas set destacado = true  where id = p_id;
      when 'quitar_destacado' then update public.foro_respuestas set destacado = false where id = p_id;
      when 'eliminar'         then delete from public.foro_respuestas                  where id = p_id;
    end case;
  end if;
end $$;

grant execute on function public.moderar_foro(text, uuid, text) to authenticated;
