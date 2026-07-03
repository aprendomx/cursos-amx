-- ==========================================================
-- Cursos AMX — Supabase schema
-- Postgres 15 · pgcrypto · RLS enabled
-- ==========================================================

create extension if not exists "pgcrypto";

-- ---------- Catálogo de dependencias ----------
create table public.dependencias (
  id          serial primary key,
  nombre      text not null unique,
  siglas      text,
  tipo        text check (tipo in ('federal','estatal','municipal','autonomo','otro')) default 'federal',
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- ---------- Perfiles (extiende auth.users) ----------
create table public.perfiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nombres           text not null,
  apellido_paterno  text not null,
  apellido_materno  text,
  nombres_completos text generated always as (
    trim(both from nombres || ' ' || apellido_paterno || coalesce(' ' || apellido_materno, ''))
  ) stored,
  correo            text not null unique,
  telefono_movil    text,
  dependencia_id    int references public.dependencias(id),
  cargo             text,
  es_admin          boolean not null default false,
  aviso_privacidad  boolean not null default false,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index perfiles_dependencia_idx on public.perfiles(dependencia_id);

-- ---------- Cursos ----------
create table public.cursos (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  titulo         text not null,
  descripcion    text,
  imagen_portada text,
  nivel          text check (nivel in ('Fundamental','Intermedio','Avanzado')),
  duracion_min   int default 0,
  publicado      boolean not null default false,
  creado_en      timestamptz not null default now()
);

-- ---------- Módulos ----------
create table public.modulos (
  id              uuid primary key default gen_random_uuid(),
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  orden           int not null,
  titulo          text not null,
  descripcion     text,
  requiere_previo boolean not null default true,
  unique (curso_id, orden)
);
create index modulos_curso_idx on public.modulos(curso_id);

-- ---------- Lecciones / Materiales ----------
create type public.tipo_material as enum ('video','lectura','examen','recurso');

create table public.lecciones (
  id            uuid primary key default gen_random_uuid(),
  modulo_id     uuid not null references public.modulos(id) on delete cascade,
  orden         int not null,
  titulo        text not null,
  url_youtube   text,
  tipo_material public.tipo_material not null default 'video',
  duracion_seg  int default 0,
  unique (modulo_id, orden)
);
create index lecciones_modulo_idx on public.lecciones(modulo_id);

-- ---------- Inscripciones ----------
create table public.inscripciones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.perfiles(id) on delete cascade,
  curso_id    uuid not null references public.cursos(id) on delete cascade,
  inscrito_en timestamptz not null default now(),
  unique (user_id, curso_id)
);

-- ---------- Progreso por lección ----------
create table public.progreso (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.perfiles(id) on delete cascade,
  leccion_id     uuid not null references public.lecciones(id) on delete cascade,
  completado     boolean not null default false,
  completado_en  timestamptz,
  segundos_vistos int default 0,
  unique (user_id, leccion_id)
);
create index progreso_user_idx on public.progreso(user_id);

-- ---------- Comentarios (feed en vivo por lección) ----------
create table public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.perfiles(id) on delete cascade,
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  contenido  text not null check (char_length(contenido) between 1 and 600),
  creado_en  timestamptz not null default now()
);
create index comentarios_leccion_idx on public.comentarios(leccion_id, creado_en desc);

-- ---------- Constancias ----------
create table public.constancias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.perfiles(id) on delete cascade,
  curso_id    uuid not null references public.cursos(id),
  folio       text not null unique,
  emitida_en  timestamptz not null default now(),
  hash_verif  text,
  unique (user_id, curso_id)
);

-- ==========================================================
-- RPC: marcar lección completada (llamada desde el player
-- cuando YouTube IFrame dispara playerState === ENDED)
-- ==========================================================
create or replace function public.marcar_leccion_completada(p_leccion_id uuid)
returns public.progreso
language plpgsql security definer set search_path = public as $$
declare r public.progreso;
begin
  insert into public.progreso (user_id, leccion_id, completado, completado_en)
  values (auth.uid(), p_leccion_id, true, now())
  on conflict (user_id, leccion_id)
    do update set completado = true, completado_en = excluded.completado_en
  returning * into r;

  -- Si el usuario completó todas las lecciones del curso, emitir constancia.
  perform public._emitir_constancia_si_procede(auth.uid(), p_leccion_id);
  return r;
end $$;

create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_curso uuid; v_total int; v_hechas int;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  select count(*) into v_total
  from public.lecciones l join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_hechas >= v_total then
    insert into public.constancias (user_id, curso_id, folio, hash_verif)
    values (p_user, v_curso,
      'CON-' || to_char(now(),'YYYY') || '-' || upper(substr(v_curso::text,1,4)) || '-' || lpad((floor(random()*99999))::text,5,'0'),
      encode(gen_random_bytes(16), 'hex'))
    on conflict (user_id, curso_id) do nothing;
  end if;
end $$;

-- ==========================================================
-- Row Level Security
-- ==========================================================
alter table public.perfiles     enable row level security;
alter table public.cursos       enable row level security;
alter table public.modulos      enable row level security;
alter table public.lecciones    enable row level security;
alter table public.inscripciones enable row level security;
alter table public.progreso     enable row level security;
alter table public.comentarios  enable row level security;
alter table public.constancias  enable row level security;

-- Perfiles
create policy "perfiles: leer el propio" on public.perfiles for select using (auth.uid() = id);
create policy "perfiles: actualizar el propio" on public.perfiles for update using (auth.uid() = id);

-- Cursos / Módulos / Lecciones — lectura pública si publicado, escritura admin
create policy "cursos: leer publicado" on public.cursos for select using (publicado or (select es_admin from public.perfiles where id = auth.uid()));
create policy "cursos: admin" on public.cursos for all using ((select es_admin from public.perfiles where id = auth.uid()));

create policy "modulos: leer" on public.modulos for select using (true);
create policy "modulos: admin" on public.modulos for all using ((select es_admin from public.perfiles where id = auth.uid()));

create policy "lecciones: leer" on public.lecciones for select using (true);
create policy "lecciones: admin" on public.lecciones for all using ((select es_admin from public.perfiles where id = auth.uid()));

-- Inscripciones
create policy "inscripciones: leer propias" on public.inscripciones for select using (auth.uid() = user_id);
create policy "inscripciones: insertar propia" on public.inscripciones for insert with check (auth.uid() = user_id);

-- Progreso — solo el dueño
create policy "progreso: leer propio" on public.progreso for select using (auth.uid() = user_id);
create policy "progreso: insertar propio" on public.progreso for insert with check (auth.uid() = user_id);
create policy "progreso: actualizar propio" on public.progreso for update using (auth.uid() = user_id);

-- Comentarios — leer todos los del curso, insertar propios
create policy "comentarios: leer" on public.comentarios for select using (true);
create policy "comentarios: insertar propio" on public.comentarios for insert with check (auth.uid() = user_id);
create policy "comentarios: borrar propio o admin" on public.comentarios for delete using (
  auth.uid() = user_id or (select es_admin from public.perfiles where id = auth.uid())
);

-- Constancias — leer las propias
create policy "constancias: leer propias" on public.constancias for select using (auth.uid() = user_id);

-- ==========================================================
-- Realtime: publicar comentarios y progreso
-- ==========================================================
alter publication supabase_realtime add table public.comentarios;
alter publication supabase_realtime add table public.progreso;

-- ==========================================================
-- Seed mínimo
-- ==========================================================
insert into public.dependencias (nombre, siglas) values
  ('Secretaría de Relaciones Exteriores','SRE'),
  ('Secretaría de Hacienda y Crédito Público','SHCP'),
  ('Secretaría de Salud','SALUD'),
  ('Secretaría de Educación Pública','SEP'),
  ('Secretaría del Bienestar','BIENESTAR'),
  ('Secretaría de Medio Ambiente y Recursos Naturales','SEMARNAT'),
  ('Secretaría de Cultura','CULTURA'),
  ('Secretaría del Trabajo y Previsión Social','STPS'),
  ('IMSS','IMSS'),
  ('ISSSTE','ISSSTE'),
  ('Agencia Digital Nacional','ADN'),
  ('Otro / Gobierno estatal o municipal',null)
on conflict (nombre) do nothing;
