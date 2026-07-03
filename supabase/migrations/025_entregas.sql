-- =========================================================
-- Migration 025: entregas de archivos por alumnos en lecciones
-- =========================================================
-- Módulo 3 del plan LMS.
--
--  * lecciones.requiere_entrega / entrega_tipos / entrega_max_mb
--  * entregas_leccion: registro con historial de versiones
--    (resubir crea versión nueva; la anterior queda vigente=false)
--  * bucket privado `entregas` con path {curso}/{leccion}/{user}/{archivo}
--  * RLS: alumno ve solo lo suyo; instructor del curso ve todo
--  * Escritura SOLO vía RPCs:
--      registrar_entrega(...)  alumno, valida tipo/tamaño/inscripción
--      revisar_entrega(...)    instructor, cambia estado + comentario
-- =========================================================

-- ---------- lecciones: configuración de entrega ----------
alter table public.lecciones
  add column if not exists requiere_entrega boolean not null default false,
  add column if not exists entrega_tipos    text[]  not null default array['pdf','docx','zip','png','jpg'],
  add column if not exists entrega_max_mb   int     not null default 10
    check (entrega_max_mb between 1 and 50);

-- ---------- Tabla de entregas ----------
create table if not exists public.entregas_leccion (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.perfiles(id) on delete cascade,
  leccion_id            uuid not null references public.lecciones(id) on delete cascade,
  curso_id              uuid not null references public.cursos(id) on delete cascade,
  archivo_path          text not null,
  archivo_nombre        text not null,
  archivo_mime          text,
  archivo_bytes         bigint not null default 0,
  version               int not null default 1,
  vigente               boolean not null default true,
  estado                text not null default 'pendiente'
                          check (estado in ('pendiente','revisada','aprobada','rechazada')),
  comentario_instructor text,
  revisado_por          uuid references public.perfiles(id),
  revisado_en           timestamptz,
  creado_en             timestamptz not null default now()
);
create index if not exists entregas_leccion_user_idx  on public.entregas_leccion(user_id, leccion_id, version desc);
create index if not exists entregas_leccion_curso_idx on public.entregas_leccion(curso_id, estado, creado_en desc);
-- Una sola entrega vigente por alumno+lección
create unique index if not exists entregas_vigente_unq
  on public.entregas_leccion(user_id, leccion_id) where vigente;

-- ---------- RLS ----------
alter table public.entregas_leccion enable row level security;

drop policy if exists "entregas: leer propias o instructor" on public.entregas_leccion;
create policy "entregas: leer propias o instructor"
  on public.entregas_leccion for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_de(curso_id));

-- Sin policies de INSERT/UPDATE/DELETE: solo las RPCs escriben.

-- ---------- RPC: registrar entrega (alumno) ----------
-- El cliente sube el archivo al bucket y luego registra aquí. La RPC
-- valida inscripción, configuración de la lección, tipo y tamaño, y
-- versiona: la entrega vigente anterior pasa a historial.
create or replace function public.registrar_entrega(
  p_leccion uuid,
  p_path    text,
  p_nombre  text,
  p_mime    text,
  p_bytes   bigint
)
returns public.entregas_leccion
language plpgsql security definer set search_path = public as $$
declare
  v_leccion  public.lecciones;
  v_curso    uuid;
  v_ext      text;
  v_version  int;
  v_row      public.entregas_leccion;
begin
  select * into v_leccion from public.lecciones where id = p_leccion;
  if not found then
    raise exception 'lección no existe';
  end if;
  if not v_leccion.requiere_entrega then
    raise exception 'esta lección no requiere entrega';
  end if;

  v_curso := public.curso_de_leccion(p_leccion);
  if not public.esta_inscrito(v_curso) then
    raise exception 'no estás inscrito en este curso';
  end if;

  -- Tipo permitido (por extensión, case-insensitive)
  v_ext := lower(substring(p_nombre from '\.([^\.]+)$'));
  if v_ext is null or not (v_ext = any (v_leccion.entrega_tipos)) then
    raise exception 'tipo de archivo .% no permitido (permitidos: %)', v_ext, array_to_string(v_leccion.entrega_tipos, ', ');
  end if;

  -- Tamaño
  if p_bytes <= 0 or p_bytes > v_leccion.entrega_max_mb::bigint * 1024 * 1024 then
    raise exception 'el archivo excede el máximo de % MB', v_leccion.entrega_max_mb;
  end if;

  -- El path debe seguir la convención {curso}/{leccion}/{user}/...
  if p_path not like v_curso || '/' || p_leccion || '/' || auth.uid() || '/%' then
    raise exception 'path de archivo inválido';
  end if;

  -- Versionado: la vigente anterior pasa a historial
  select coalesce(max(version), 0) + 1 into v_version
  from public.entregas_leccion
  where user_id = auth.uid() and leccion_id = p_leccion;

  update public.entregas_leccion
    set vigente = false
    where user_id = auth.uid() and leccion_id = p_leccion and vigente;

  insert into public.entregas_leccion
    (user_id, leccion_id, curso_id, archivo_path, archivo_nombre, archivo_mime, archivo_bytes, version)
  values
    (auth.uid(), p_leccion, v_curso, p_path, p_nombre, p_mime, p_bytes, v_version)
  returning * into v_row;

  return v_row;
end $$;

grant execute on function public.registrar_entrega(uuid, text, text, text, bigint) to authenticated;

-- ---------- RPC: revisar entrega (instructor) ----------
create or replace function public.revisar_entrega(
  p_entrega    uuid,
  p_estado     text,
  p_comentario text default null
)
returns public.entregas_leccion
language plpgsql security definer set search_path = public as $$
declare
  v_row public.entregas_leccion;
begin
  if p_estado not in ('revisada','aprobada','rechazada','pendiente') then
    raise exception 'estado inválido: %', p_estado;
  end if;

  select * into v_row from public.entregas_leccion where id = p_entrega;
  if not found then
    raise exception 'entrega no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;

  update public.entregas_leccion
    set estado = p_estado,
        comentario_instructor = coalesce(p_comentario, comentario_instructor),
        revisado_por = auth.uid(),
        revisado_en = now()
    where id = p_entrega
    returning * into v_row;

  return v_row;
end $$;

grant execute on function public.revisar_entrega(uuid, text, text) to authenticated;

-- ---------- Bucket privado de entregas ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('entregas', 'entregas', false, 52428800)  -- 50 MB techo del bucket;
                                                  -- el límite real por lección lo valida la RPC
on conflict (id) do nothing;

-- Storage RLS: path = {curso_id}/{leccion_id}/{user_id}/{archivo}
drop policy if exists "entregas storage: alumno sube a su carpeta" on storage.objects;
create policy "entregas storage: alumno sube a su carpeta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'entregas'
    and (storage.foldername(name))[3] = auth.uid()::text
    and public.esta_inscrito(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "entregas storage: leer propio o instructor" on storage.objects;
create policy "entregas storage: leer propio o instructor"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'entregas'
    and (
      (storage.foldername(name))[3] = auth.uid()::text
      or public.is_instructor_de(((storage.foldername(name))[1])::uuid)
    )
  );
