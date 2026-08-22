-- 001_base.sql — esquema base consolidado.
--
-- Consolida las antiguas migraciones 001_schema.sql .. 076_eventos_portada.sql
-- en un solo archivo, en el mismo orden en que se aplicaban. Una instalación
-- nueva ejecuta solo este archivo (scripts/migrate.sh lo aplica en una única
-- transacción, igual que hacía con cada archivo del set antiguo).
--
-- Una base que ya corrió el set antiguo NO debe ejecutarlo: sus objetos ya
-- existen. En ese caso se registra como aplicado sin ejecutarlo:
--
--   scripts/migrate.sh --baseline
--
-- ...pero SOLO si la base llegó hasta la 076. Si quedó a medias, primero hay
-- que aplicar las pendientes desde un checkout anterior a esta consolidación
-- (git log --follow -- supabase/migrations la ubica) y después actualizar el
-- árbol y hacer baseline. La guardia de abajo corta en seco si detecta el
-- ledger del set antiguo, para que un despliegue distraído falle con
-- instrucciones en lugar de reventar a medias contra objetos ya existentes.

do $$
declare ya_migrada boolean;
begin
  -- El ledger puede no existir todavía (instalación nueva): la consulta va en
  -- EXECUTE para que PL/pgSQL no intente planificarla contra una tabla ausente.
  if to_regclass('public._migraciones') is not null then
    execute $q$select exists (
      select 1 from public._migraciones where nombre <> '001_base.sql'
    )$q$ into ya_migrada;
    if ya_migrada then
      raise exception 'Esta base ya corrió el set antiguo de migraciones. No ejecutes 001_base.sql: usa scripts/migrate.sh --baseline (ver la cabecera del archivo).';
    end if;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 001_schema.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 002_seed.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Cursos AMX — Seed demo: 6 cursos con módulos y lecciones
-- ==========================================================

-- Completar dependencias que faltan
insert into public.dependencias (nombre, siglas) values
  ('Dirección General','DG'),
  ('Recursos Humanos','RH'),
  ('Finanzas','FIN'),
  ('Tecnologías de la Información','TI'),
  ('Jurídico','JUR'),
  ('Comunicación','COM'),
  ('Operaciones','OPS'),
  ('Otra área', null)
on conflict (nombre) do nothing;

-- ========== CURSO 1: Transparencia y Rendición de Cuentas ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0001-4000-8000-000000000001', 'transparencia-rendicion-cuentas',
   'Transparencia y Rendición de Cuentas',
   'Marco normativo, obligaciones y mejores prácticas para servidores públicos en materia de transparencia.',
   'Fundamental', 380, true);

-- Módulos
insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000001-0001-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 1,
   'Fundamentos de la transparencia',
   'Marco constitucional y legal que da sustento al derecho de acceso a la información pública.', false),
  ('b0000001-0002-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 2,
   'Sujetos obligados y obligaciones de oficio',
   'Quiénes son sujetos obligados, qué información deben publicar y con qué periodicidad.', true),
  ('b0000001-0003-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 3,
   'Clasificación de la información',
   'Reservada, confidencial, pública. Pruebas de daño e interés público.', true),
  ('b0000001-0004-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 4,
   'Procedimiento de acceso a la información',
   'Del ingreso de la solicitud a la respuesta. Plazos, prórrogas y recursos de revisión.', true),
  ('b0000001-0005-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 5,
   'Casos prácticos y evaluación final',
   'Ejercicios aplicados y examen para constancia.', true);

-- Lecciones Módulo 1
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000001-0001-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 1, '¿Qué es la transparencia?', 'video', 720),
  ('c0000001-0002-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 2, 'Artículos 6 y 134 constitucionales', 'video', 840),
  ('c0000001-0003-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 3, 'Ley General de Transparencia (LGTAIP)', 'video', 660),
  ('c0000001-0004-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 4, 'Lectura: marco normativo complementario', 'lectura', 480);

-- Lecciones Módulo 2
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000002-0001-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 1, '¿Qué es la transparencia proactiva?', 'video', 684),
  ('c0000002-0002-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 2, 'Obligaciones comunes (Art. 70 LGTAIP)', 'video', 848),
  ('c0000002-0003-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 3, 'Obligaciones específicas por sujeto', 'video', 1002),
  ('c0000002-0004-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 4, 'Plataforma Nacional de Transparencia', 'video', 735),
  ('c0000002-0005-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 5, 'Lectura complementaria', 'lectura', 480);

-- Lecciones Módulo 3
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000003-0001-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 1, 'Información reservada', 'video', 780),
  ('c0000003-0002-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 2, 'Información confidencial', 'video', 660),
  ('c0000003-0003-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 3, 'Prueba de daño e interés público', 'video', 900),
  ('c0000003-0004-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 4, 'Ejercicio: clasifica estos documentos', 'examen', 600);

-- Lecciones Módulo 4
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000004-0001-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 1, 'Solicitud de acceso a la información', 'video', 900),
  ('c0000004-0002-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 2, 'Plazos, prórrogas y respuesta', 'video', 1020),
  ('c0000004-0003-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 3, 'Recurso de revisión ante el INAI', 'video', 780);

-- Lecciones Módulo 5
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000005-0001-4000-8000-000000000001', 'b0000001-0005-4000-8000-000000000001', 1, 'Caso práctico integrador', 'recurso', 1200),
  ('c0000005-0002-4000-8000-000000000001', 'b0000001-0005-4000-8000-000000000001', 2, 'Examen final para constancia', 'examen', 1500);

-- ========== CURSO 2: Gestión Documental ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0002-4000-8000-000000000001', 'gestion-documental',
   'Gestión Documental en la Administración Pública',
   'Ciclo de vida de los documentos institucionales, archivos de trámite y archivo de concentración.',
   'Intermedio', 285, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000002-0001-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 1,
   'Conceptos y normativa archivística', 'Ley General de Archivos y principios de organización documental.', false),
  ('b0000002-0002-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 2,
   'Archivo de trámite', 'Organización, clasificación y cuadro general de clasificación archivística.', true),
  ('b0000002-0003-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 3,
   'Archivo de concentración y archivo histórico', 'Transferencias, valoración y destino final de documentos.', true),
  ('b0000002-0004-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 4,
   'Gestión documental electrónica', 'Expediente electrónico, firma digital y preservación a largo plazo.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000002-0001-4000-8000-000000000001', 1, 'Ley General de Archivos', 'video', 720),
  ('b0000002-0001-4000-8000-000000000001', 2, 'Principios archivísticos', 'video', 600),
  ('b0000002-0001-4000-8000-000000000001', 3, 'Lectura: glosario archivístico', 'lectura', 360),
  ('b0000002-0002-4000-8000-000000000001', 1, 'Cuadro general de clasificación', 'video', 780),
  ('b0000002-0002-4000-8000-000000000001', 2, 'Organización de expedientes', 'video', 660),
  ('b0000002-0002-4000-8000-000000000001', 3, 'Práctica: clasifica tu archivo', 'examen', 480),
  ('b0000002-0003-4000-8000-000000000001', 1, 'Transferencias primarias y secundarias', 'video', 840),
  ('b0000002-0003-4000-8000-000000000001', 2, 'Valoración documental', 'video', 720),
  ('b0000002-0003-4000-8000-000000000001', 3, 'Destino final: conservar o eliminar', 'video', 600),
  ('b0000002-0004-4000-8000-000000000001', 1, 'Expediente electrónico', 'video', 660),
  ('b0000002-0004-4000-8000-000000000001', 2, 'Preservación digital a largo plazo', 'video', 600),
  ('b0000002-0004-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 3: Prevención de Conflicto de Intereses ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0003-4000-8000-000000000001', 'prevencion-conflicto-intereses',
   'Prevención de Conflicto de Intereses',
   'Identificación, declaración y resolución de situaciones de conflicto en el ejercicio público.',
   'Fundamental', 190, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000003-0001-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 1,
   'Marco legal y conceptual', 'Definiciones, tipos de conflicto y marco normativo aplicable.', false),
  ('b0000003-0002-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 2,
   'Declaraciones patrimonial e intereses', 'Obligación de declarar, contenido y plazos.', true),
  ('b0000003-0003-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 3,
   'Casos prácticos y evaluación', 'Análisis de situaciones reales y examen de certificación.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000003-0001-4000-8000-000000000001', 1, '¿Qué es un conflicto de intereses?', 'video', 720),
  ('b0000003-0001-4000-8000-000000000001', 2, 'Tipos: real, aparente y potencial', 'video', 660),
  ('b0000003-0001-4000-8000-000000000001', 3, 'Ley General de Responsabilidades', 'video', 600),
  ('b0000003-0002-4000-8000-000000000001', 1, 'Declaración patrimonial', 'video', 780),
  ('b0000003-0002-4000-8000-000000000001', 2, 'Declaración de intereses', 'video', 720),
  ('b0000003-0002-4000-8000-000000000001', 3, 'Declaración fiscal', 'video', 540),
  ('b0000003-0003-4000-8000-000000000001', 1, 'Caso: el servidor público y la empresa familiar', 'recurso', 900),
  ('b0000003-0003-4000-8000-000000000001', 2, 'Caso: contratación de conocidos', 'recurso', 780),
  ('b0000003-0003-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 4: Presupuesto Base Cero ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0004-4000-8000-000000000001', 'presupuesto-base-cero',
   'Presupuesto Base Cero para Unidades Administrativas',
   'Metodología, estructuras programáticas y defensa presupuestal ante autoridades hacendarias.',
   'Avanzado', 495, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000004-0001-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 1,
   'Fundamentos del PBC', 'Historia, principios y diferencia con presupuesto incremental.', false),
  ('b0000004-0002-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 2,
   'Estructura programática', 'Programas presupuestarios, MIR y clasificadores.', true),
  ('b0000004-0003-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 3,
   'Construcción de paquetes de decisión', 'Cómo armar y jerarquizar paquetes.', true),
  ('b0000004-0004-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 4,
   'Defensa presupuestal', 'Preparación para la audiencia ante SHCP.', true),
  ('b0000004-0005-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 5,
   'Seguimiento y evaluación', 'Indicadores de desempeño y rendición de cuentas.', true),
  ('b0000004-0006-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 6,
   'Taller integrador y evaluación', 'Ejercicio completo y examen de certificación.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000004-0001-4000-8000-000000000001', 1, 'Historia del PBC', 'video', 660),
  ('b0000004-0001-4000-8000-000000000001', 2, 'PBC vs presupuesto incremental', 'video', 720),
  ('b0000004-0001-4000-8000-000000000001', 3, 'Marco jurídico presupuestal', 'video', 780),
  ('b0000004-0001-4000-8000-000000000001', 4, 'Lectura: LFPRH y su reglamento', 'lectura', 600),
  ('b0000004-0002-4000-8000-000000000001', 1, 'Programas presupuestarios', 'video', 840),
  ('b0000004-0002-4000-8000-000000000001', 2, 'Matriz de Indicadores para Resultados', 'video', 900),
  ('b0000004-0002-4000-8000-000000000001', 3, 'Clasificadores del gasto', 'video', 720),
  ('b0000004-0003-4000-8000-000000000001', 1, 'Paquetes de decisión: concepto', 'video', 660),
  ('b0000004-0003-4000-8000-000000000001', 2, 'Jerarquización de paquetes', 'video', 720),
  ('b0000004-0003-4000-8000-000000000001', 3, 'Ejercicio: construye tu paquete', 'examen', 900),
  ('b0000004-0004-4000-8000-000000000001', 1, 'Preparación de la audiencia', 'video', 840),
  ('b0000004-0004-4000-8000-000000000001', 2, 'Argumentación presupuestal', 'video', 780),
  ('b0000004-0004-4000-8000-000000000001', 3, 'Simulación de defensa', 'recurso', 1200),
  ('b0000004-0005-4000-8000-000000000001', 1, 'Indicadores de desempeño', 'video', 720),
  ('b0000004-0005-4000-8000-000000000001', 2, 'Informes trimestrales', 'video', 660),
  ('b0000004-0005-4000-8000-000000000001', 3, 'Cuenta pública', 'video', 600),
  ('b0000004-0005-4000-8000-000000000001', 4, 'Lectura: ASF y auditoría', 'lectura', 480),
  ('b0000004-0006-4000-8000-000000000001', 1, 'Taller integrador PBC', 'recurso', 1800),
  ('b0000004-0006-4000-8000-000000000001', 2, 'Examen de certificación', 'examen', 1500),
  ('b0000004-0006-4000-8000-000000000001', 3, 'Recursos adicionales', 'recurso', 600),
  ('b0000004-0006-4000-8000-000000000001', 4, 'Encuesta de satisfacción', 'recurso', 300);

-- ========== CURSO 5: Atención Ciudadana ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0005-4000-8000-000000000001', 'atencion-ciudadana',
   'Atención Ciudadana y Trato Digno',
   'Protocolos de atención, lenguaje incluyente y resolución de quejas en ventanilla y en línea.',
   'Fundamental', 170, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000005-0001-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 1,
   'Principios de atención ciudadana', 'Derechos ciudadanos, actitud de servicio y protocolos básicos.', false),
  ('b0000005-0002-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 2,
   'Comunicación incluyente y empática', 'Lenguaje claro, incluyente y técnicas de escucha activa.', true),
  ('b0000005-0003-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 3,
   'Resolución de quejas y evaluación', 'Manejo de conflictos en ventanilla y canales digitales.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000005-0001-4000-8000-000000000001', 1, 'Carta de derechos ciudadanos', 'video', 600),
  ('b0000005-0001-4000-8000-000000000001', 2, 'Actitud de servicio', 'video', 540),
  ('b0000005-0001-4000-8000-000000000001', 3, 'Protocolo de atención en ventanilla', 'video', 720),
  ('b0000005-0002-4000-8000-000000000001', 1, 'Lenguaje claro e incluyente', 'video', 660),
  ('b0000005-0002-4000-8000-000000000001', 2, 'Escucha activa y empatía', 'video', 600),
  ('b0000005-0003-4000-8000-000000000001', 1, 'Manejo de quejas presenciales', 'video', 780),
  ('b0000005-0003-4000-8000-000000000001', 2, 'Atención en canales digitales', 'video', 660),
  ('b0000005-0003-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 6: Firma Electrónica ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0006-4000-8000-000000000001', 'firma-electronica-tramites',
   'Firma Electrónica y Trámites Digitales',
   'e.firma, sellos digitales y expediente electrónico en trámites gubernamentales.',
   'Intermedio', 210, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000006-0001-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 1,
   'Fundamentos de la firma electrónica', 'Criptografía básica, PKI y marco legal.', false),
  ('b0000006-0002-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 2,
   'e.firma del SAT', 'Obtención, renovación y uso de la e.firma.', true),
  ('b0000006-0003-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 3,
   'Sellos digitales y CFDI', 'Certificados de sello digital y comprobantes fiscales.', true),
  ('b0000006-0004-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 4,
   'Expediente electrónico gubernamental', 'Tramitación digital e interoperabilidad.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000006-0001-4000-8000-000000000001', 1, 'Criptografía de clave pública', 'video', 720),
  ('b0000006-0001-4000-8000-000000000001', 2, 'Infraestructura de clave pública (PKI)', 'video', 600),
  ('b0000006-0001-4000-8000-000000000001', 3, 'Marco legal: Ley de Firma Electrónica Avanzada', 'video', 660),
  ('b0000006-0002-4000-8000-000000000001', 1, 'Obtención de la e.firma', 'video', 540),
  ('b0000006-0002-4000-8000-000000000001', 2, 'Renovación y revocación', 'video', 480),
  ('b0000006-0002-4000-8000-000000000001', 3, 'Uso de la e.firma en trámites', 'video', 600),
  ('b0000006-0003-4000-8000-000000000001', 1, 'Certificados de sello digital', 'video', 600),
  ('b0000006-0003-4000-8000-000000000001', 2, 'CFDI: estructura y timbrado', 'video', 720),
  ('b0000006-0004-4000-8000-000000000001', 1, 'Ventanilla única digital', 'video', 660),
  ('b0000006-0004-4000-8000-000000000001', 2, 'Examen final', 'examen', 900);


-- ════════════════════════════════════════════════════════════════════
-- 003_fix_rls_policies.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Fix: agregar políticas RLS de lectura pública para
-- modulos, lecciones y dependencias
-- ==========================================================
-- NOTA: la versión original de este archivo usaba
-- `create policy if not exists`, sintaxis que PostgreSQL NO soporta
-- (a diferencia de create table/index). El archivo entero fallaba y
-- ninguna instalación nueva podía pasar de aquí. Se reescribe con el
-- patrón idempotente correcto: drop if exists + create.
-- ==========================================================

-- Módulos: lectura pública (contenido del catálogo)
drop policy if exists "modulos: leer" on public.modulos;
create policy "modulos: leer" on public.modulos
  for select using (true);

-- Lecciones: lectura pública
drop policy if exists "lecciones: leer" on public.lecciones;
create policy "lecciones: leer" on public.lecciones
  for select using (true);

-- Dependencias: lectura pública (catálogo para formularios).
-- El `enable row level security` correspondiente se añade en 057;
-- hasta esa migración la tabla quedaba sin RLS y esta política era inerte.
drop policy if exists "dependencias: leer" on public.dependencias;
create policy "dependencias: leer" on public.dependencias
  for select using (true);

-- Inscripciones: leer las propias
drop policy if exists "inscripciones: leer propias" on public.inscripciones;
create policy "inscripciones: leer propias" on public.inscripciones
  for select using (auth.uid() = user_id);

drop policy if exists "inscripciones: insertar propia" on public.inscripciones;
create policy "inscripciones: insertar propia" on public.inscripciones
  for insert with check (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════
-- 004_fix_perfiles_insert.sql
-- ════════════════════════════════════════════════════════════════════

-- Fix: permitir que un usuario recién registrado inserte su propio perfil.
-- NOTA: la versión original usaba `create policy if not exists`, sintaxis
-- inexistente en PostgreSQL; el archivo fallaba entero. Ver nota en 003.
drop policy if exists "perfiles: insertar el propio" on public.perfiles;
create policy "perfiles: insertar el propio"
  on public.perfiles for insert
  with check (auth.uid() = id);


-- ════════════════════════════════════════════════════════════════════
-- 005_fix_admin_rls.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Fix: policies de admin para INSERT/UPDATE/DELETE en
-- cursos / modulos / lecciones, con USING + WITH CHECK
-- explicitos. Restringidas al rol "authenticated".
-- ==========================================================

-- Cursos
drop policy if exists "cursos: admin" on public.cursos;
create policy "cursos: admin write"
  on public.cursos
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Modulos
drop policy if exists "modulos: admin" on public.modulos;
create policy "modulos: admin write"
  on public.modulos
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Lecciones
drop policy if exists "lecciones: admin" on public.lecciones;
create policy "lecciones: admin write"
  on public.lecciones
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));


-- ════════════════════════════════════════════════════════════════════
-- 006_admin_function.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Fix robusto: usar funcion security definer para chequear
-- es_admin sin depender de RLS recursiva sobre perfiles.
-- ==========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select es_admin from public.perfiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- Cursos
drop policy if exists "cursos: admin" on public.cursos;
drop policy if exists "cursos: admin write" on public.cursos;
create policy "cursos: admin write"
  on public.cursos
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Modulos
drop policy if exists "modulos: admin" on public.modulos;
drop policy if exists "modulos: admin write" on public.modulos;
create policy "modulos: admin write"
  on public.modulos
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Lecciones
drop policy if exists "lecciones: admin" on public.lecciones;
drop policy if exists "lecciones: admin write" on public.lecciones;
create policy "lecciones: admin write"
  on public.lecciones
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ════════════════════════════════════════════════════════════════════
-- 007_admin_read_policies.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Policies de lectura admin para tablas de seguimiento.
-- Permite que el dashboard del panel admin consuma datos reales.
-- ==========================================================

-- Inscripciones
drop policy if exists "inscripciones: admin leer" on public.inscripciones;
create policy "inscripciones: admin leer"
  on public.inscripciones for select to authenticated
  using (public.is_admin());

-- Progreso
drop policy if exists "progreso: admin leer" on public.progreso;
create policy "progreso: admin leer"
  on public.progreso for select to authenticated
  using (public.is_admin());

-- Constancias
drop policy if exists "constancias: admin leer" on public.constancias;
create policy "constancias: admin leer"
  on public.constancias for select to authenticated
  using (public.is_admin());

-- Comentarios (ya tienen lectura publica, dejamos por completitud)
drop policy if exists "comentarios: admin leer" on public.comentarios;
create policy "comentarios: admin leer"
  on public.comentarios for select to authenticated
  using (public.is_admin());

-- Perfiles: admin puede leer todos
drop policy if exists "perfiles: admin leer todos" on public.perfiles;
create policy "perfiles: admin leer todos"
  on public.perfiles for select to authenticated
  using (public.is_admin());


-- ════════════════════════════════════════════════════════════════════
-- 008_modulo_imagen.sql
-- ════════════════════════════════════════════════════════════════════

-- 008_modulo_imagen.sql
-- Añade columna opcional para portada de módulo.
-- Hoy se usa como label de PlaceholderImage; cuando se añada upload real,
-- el render cambiará a <img> con fallback al placeholder.

alter table public.modulos
  add column if not exists imagen_portada text;


-- ════════════════════════════════════════════════════════════════════
-- 009_inscripciones_rls_fix.sql
-- ════════════════════════════════════════════════════════════════════

-- 009_inscripciones_rls_fix.sql
-- Reasegura las policies de RLS para inscripciones.
-- Algunos entornos (self-hosted) pueden no haber aplicado 001/003 completas,
-- o haber dropeado la policy de INSERT durante pruebas. Idempotente.

alter table public.inscripciones enable row level security;

drop policy if exists "inscripciones: leer propias" on public.inscripciones;
create policy "inscripciones: leer propias"
  on public.inscripciones
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "inscripciones: insertar propia" on public.inscripciones;
create policy "inscripciones: insertar propia"
  on public.inscripciones
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Verificación post-aplicación: corre esta query y debe haber 2 filas (select, insert).
-- select policyname, cmd from pg_policies where tablename = 'inscripciones'
--   and policyname like 'inscripciones: %propia%';


-- ════════════════════════════════════════════════════════════════════
-- 010_inscripciones_select_uid.sql
-- ════════════════════════════════════════════════════════════════════

-- 010_inscripciones_select_uid.sql
-- Reescribe las policies de inscripciones con el patrón Supabase recomendado
-- ((select auth.uid()) = user_id). Ese wrapper en SELECT:
--   1) Es más performante (auth.uid() se cachea por query).
--   2) Resuelve auth.uid() de forma explícita evitando ambigüedades de
--      search_path o posibles funciones shadow.

drop policy if exists "inscripciones: leer propias" on public.inscripciones;
create policy "inscripciones: leer propias"
  on public.inscripciones
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "inscripciones: insertar propia" on public.inscripciones;
create policy "inscripciones: insertar propia"
  on public.inscripciones
  for insert
  with check ((select auth.uid()) = user_id);


-- ════════════════════════════════════════════════════════════════════
-- 011_progreso_select_uid.sql
-- ════════════════════════════════════════════════════════════════════

-- 011_progreso_select_uid.sql
-- Reescribe las policies de progreso con el patrón Supabase recomendado
-- ((select auth.uid()) = user_id), igual que se hizo en 010 para inscripciones.
-- Sin este workaround, las policies con auth.uid() directo pueden fallar a
-- evaluar (probable issue de search_path/deparse en self-hosted) y los
-- SELECT del usuario regresan 0 filas aunque la RPC security-definer
-- haya insertado correctamente.

drop policy if exists "progreso: leer propio" on public.progreso;
create policy "progreso: leer propio"
  on public.progreso
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "progreso: insertar propio" on public.progreso;
create policy "progreso: insertar propio"
  on public.progreso
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "progreso: actualizar propio" on public.progreso;
create policy "progreso: actualizar propio"
  on public.progreso
  for update
  using ((select auth.uid()) = user_id);


-- ════════════════════════════════════════════════════════════════════
-- 012_emitir_constancia_extensions.sql
-- ════════════════════════════════════════════════════════════════════

-- 012_emitir_constancia_extensions.sql
-- Recrea _emitir_constancia_si_procede calificando explícitamente
-- extensions.gen_random_bytes (pgcrypto vive en el schema extensions
-- en Supabase, y el set search_path = public no lo incluía).
--
-- Sin este fix, completar la última lección de un curso lanzaba 42883
-- "function gen_random_bytes(integer) does not exist", lo que reverteía
-- la transacción entera de marcar_leccion_completada y dejaba sin
-- registrar el progreso.

create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_curso uuid; v_total int; v_hechas int;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_hechas >= v_total then
    insert into public.constancias (user_id, curso_id, folio, hash_verif)
    values (
      p_user,
      v_curso,
      'CON-' || to_char(now(),'YYYY') || '-' || upper(substr(v_curso::text,1,4)) || '-' || lpad((floor(random()*99999))::text,5,'0'),
      encode(extensions.gen_random_bytes(16), 'hex')
    )
    on conflict (user_id, curso_id) do nothing;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 013_verificar_constancia_rpc.sql
-- ════════════════════════════════════════════════════════════════════

-- 013_verificar_constancia_rpc.sql
-- RPC pública para verificar una constancia por folio.
-- security definer + grant execute to anon: cualquier visitante puede
-- llamarla sin auth. Devuelve solo campos públicos (sin user_id ni curso_id).

create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio text,
  emitida_en timestamptz,
  hash_verif text,
  nombre_persona text,
  titulo_curso text
)
language sql
security definer
set search_path = public
as $$
  select
    co.folio,
    co.emitida_en,
    co.hash_verif,
    p.nombres_completos,
    cu.titulo
  from public.constancias co
  join public.perfiles p on p.id = co.user_id
  join public.cursos cu on cu.id = co.curso_id
  where co.folio = p_folio
  limit 1;
$$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 014_hls_videos.sql
-- ════════════════════════════════════════════════════════════════════

-- supabase/migrations/014_hls_videos.sql
-- HLS video support: videos table, lecciones.video_id FK,
-- NOTIFY trigger for worker wake-up, get_video_playback RPC.

-- Lifecycle enum
create type public.video_status as enum
  ('uploading','pending','processing','ready','failed');

-- One row per video processing job. leccion_id can become null if the
-- lesson is deleted; the file is then cleaned up by the worker cron.
create table public.videos (
  id              uuid primary key default gen_random_uuid(),
  leccion_id      uuid references public.lecciones(id) on delete set null,
  status          public.video_status not null default 'uploading',
  source_path     text,
  hls_path        text,
  poster_path     text,
  duracion_seg    int,
  error_msg       text,
  created_by      uuid references public.perfiles(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index videos_leccion_idx on public.videos(leccion_id);
create index videos_status_idx  on public.videos(status);

-- Touch actualizado_en automatically
create or replace function public.videos_touch_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

create trigger videos_set_actualizado_en before update on public.videos
  for each row execute function public.videos_touch_actualizado_en();

-- Link from lecciones (coexists with url_youtube)
alter table public.lecciones
  add column video_id uuid references public.videos(id) on delete set null;

-- Realtime so the admin sees status transitions live
alter publication supabase_realtime add table public.videos;

-- RLS
alter table public.videos enable row level security;
create policy "videos: leer" on public.videos for select using (true);
create policy "videos: admin" on public.videos for all
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- NOTIFY trigger: wake the worker when a row enters 'pending'
create or replace function public.notify_video_job() returns trigger
language plpgsql as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform pg_notify('video_jobs', new.id::text);
  end if;
  return new;
end $$;

create trigger videos_notify after insert or update on public.videos
  for each row execute function public.notify_video_job();

-- Authorization RPC: returns playback paths only if the caller is admin
-- or enrolled in the video's course AND the video is ready.
create or replace function public.get_video_playback(p_video_id uuid)
returns table(hls_path text, poster_path text, duracion_seg int)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_curso uuid;
  v_leccion uuid;
  v_is_admin boolean;
  v_inscrito boolean;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select es_admin into v_is_admin from public.perfiles where id = v_user;

  select v.leccion_id, m.curso_id
    into v_leccion, v_curso
  from public.videos v
  join public.lecciones l on l.id = v.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where v.id = p_video_id and v.status = 'ready';

  if v_leccion is null then
    raise exception 'video not ready' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_admin, false) then
    select exists(
      select 1 from public.inscripciones
      where user_id = v_user and curso_id = v_curso
    ) into v_inscrito;
    if not v_inscrito then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  return query
    select v.hls_path, v.poster_path, v.duracion_seg
    from public.videos v where v.id = p_video_id;
end $$;

revoke all on function public.get_video_playback(uuid) from public;
grant execute on function public.get_video_playback(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 015_progreso_posicion.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Migration 015: actualizado_en column + guardar_posicion RPC
-- Video playback position tracking for HLS support
-- ==========================================================

-- Add actualizado_en timestamp to progreso table
-- (segundos_vistos already exists from 001_schema.sql)
alter table public.progreso
  add column if not exists actualizado_en timestamptz not null default now();

-- Atomic upsert RPC for video position tracking
-- Never decreases segundos_vistos (monotonic progress)
-- Called by player on throttled timeupdate (5s cadence)
-- Returns void to keep payload minimal
create or replace function public.guardar_posicion(
  p_leccion uuid,
  p_segundos int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  insert into public.progreso (user_id, leccion_id, segundos_vistos, actualizado_en, completado)
  values (auth.uid(), p_leccion, greatest(p_segundos, 0), now(), false)
  on conflict (user_id, leccion_id) do update
    set segundos_vistos = greatest(excluded.segundos_vistos, public.progreso.segundos_vistos),
        actualizado_en = now();
end $$;

-- RLS: only authenticated users can call guardar_posicion
revoke all on function public.guardar_posicion(uuid, int) from public;
grant execute on function public.guardar_posicion(uuid, int) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 016_video_buckets.sql
-- ════════════════════════════════════════════════════════════════════

-- supabase/migrations/016_video_buckets.sql

-- Both buckets are private. ingest receives raw mp4s; hls receives the
-- output of the worker. All client access to hls goes through the
-- hls-playlist Edge Function with signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('video-ingest', 'video-ingest', false, 4294967296,   -- 4 GB
   array['video/mp4','video/quicktime','video/x-matroska','video/webm']),
  ('video-hls',    'video-hls',    false, null, null)
on conflict (id) do nothing;

-- Admins can upload to video-ingest
create policy "video-ingest: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "video-ingest: admin read"
  on storage.objects for select
  using (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "video-ingest: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

-- video-hls has NO client-facing policies. All access is service-role
-- via the Edge Function. The worker uses service-role to write.


-- ════════════════════════════════════════════════════════════════════
-- 017_propagate_duracion.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Migration 017: propagar duracion_seg del video a la leccion
-- al marcar el video como 'ready'.
-- ==========================================================

create or replace function public.propagate_video_duracion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo al transicionar a 'ready' con duracion_seg conocido.
  if new.status = 'ready'
     and new.duracion_seg is not null
     and new.duracion_seg > 0
     and new.leccion_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'ready'
          or old.duracion_seg is distinct from new.duracion_seg) then
    update public.lecciones
      set duracion_seg = new.duracion_seg
      where id = new.leccion_id;
  end if;
  return new;
end $$;

drop trigger if exists videos_propagate_duracion on public.videos;
create trigger videos_propagate_duracion
  after insert or update on public.videos
  for each row execute function public.propagate_video_duracion();

-- Back-fill: si ya hay videos en 'ready' con duracion_seg, llévalo
-- a la leccion correspondiente cuando sea más reciente.
update public.lecciones l
set duracion_seg = v.duracion_seg
from public.videos v
where v.leccion_id = l.id
  and v.status = 'ready'
  and v.duracion_seg is not null
  and v.duracion_seg > 0
  and (l.duracion_seg is null or l.duracion_seg = 0 or l.duracion_seg <> v.duracion_seg);


-- ════════════════════════════════════════════════════════════════════
-- 018_documento_en_lecciones.sql
-- ════════════════════════════════════════════════════════════════════

-- supabase/migrations/018_documento_en_lecciones.sql
-- Add documento_path and documento_tipo columns to lecciones table,
-- and create get_documento_acceso RPC for authorized document retrieval.

create type public.documento_tipo as enum ('pdf','imagen');

alter table public.lecciones
  add column documento_path text,
  add column documento_tipo public.documento_tipo;

-- Authorization RPC: returns documento_path only if the caller is admin
-- or enrolled in the lesson's course AND documento_path is not null.
create or replace function public.get_documento_acceso(p_leccion_id uuid)
returns table(documento_path text, documento_tipo public.documento_tipo, titulo text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_curso uuid;
  v_is_admin boolean;
  v_inscrito boolean;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select es_admin into v_is_admin from public.perfiles where id = v_user;

  select m.curso_id into v_curso
    from public.lecciones l
    join public.modulos m on m.id = l.modulo_id
    where l.id = p_leccion_id;

  if v_curso is null then
    raise exception 'no encontrado' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_admin, false) then
    select exists(
      select 1 from public.inscripciones
      where user_id = v_user and curso_id = v_curso
    ) into v_inscrito;
    if not v_inscrito then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  return query
    select l.documento_path, l.documento_tipo, l.titulo
    from public.lecciones l
    where l.id = p_leccion_id and l.documento_path is not null;
end $$;

revoke all on function public.get_documento_acceso(uuid) from public;
grant execute on function public.get_documento_acceso(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 019_lesson_docs_bucket.sql
-- ════════════════════════════════════════════════════════════════════

-- supabase/migrations/019_lesson_docs_bucket.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-docs', 'lesson-docs', false, 52428800,  -- 50 MB
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

create policy "lesson-docs: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "lesson-docs: admin read"
  on storage.objects for select
  using (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "lesson-docs: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );


-- ════════════════════════════════════════════════════════════════════
-- 020_curso_portadas_bucket.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 020: bucket público para portadas de curso
-- =========================================================
-- Las portadas se muestran directamente desde URL pública en
-- la landing, catálogo y cards del curso, así que el bucket es
-- público. La escritura queda restringida a admins por policy
-- sobre storage.objects.
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'curso-portadas',
  'curso-portadas',
  true,           -- público para servir directamente
  10485760,       -- 10 MB
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

-- Lectura pública (anonymous) ya viene del flag public=true del bucket,
-- pero declaramos la policy explícita para clarity.
create policy "curso-portadas: lectura pública"
  on storage.objects for select
  using (bucket_id = 'curso-portadas');

create policy "curso-portadas: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "curso-portadas: admin update"
  on storage.objects for update
  using (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "curso-portadas: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );


-- ════════════════════════════════════════════════════════════════════
-- 021_constancia_settings.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 021: constancia_settings (titular + cargo configurables)
-- =========================================================
-- Tabla key-value de una sola fila (id boolean=true) que guarda los
-- datos del firmante de la constancia editables desde el admin.
-- Lectura pública (la constancia se renderiza al alumno con estos
-- valores); escritura solo admins.
-- =========================================================

create table if not exists public.constancia_settings (
  id              boolean primary key default true check (id = true),
  titular_nombre  text not null default 'Nombre Completo Del Titular',
  titular_cargo   text not null default 'Titular del Área de Certificación',
  lugar           text not null default 'Ciudad de México',
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);

-- Seed: garantiza que siempre exista la única fila.
insert into public.constancia_settings (id)
values (true)
on conflict (id) do nothing;

-- RLS
alter table public.constancia_settings enable row level security;

create policy "constancia_settings: leer" on public.constancia_settings
  for select using (true);

create policy "constancia_settings: admin update" on public.constancia_settings
  for update
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Touch automático del timestamp
create or replace function public.constancia_settings_touch() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  return new;
end $$;

drop trigger if exists constancia_settings_touch on public.constancia_settings;
create trigger constancia_settings_touch
  before update on public.constancia_settings
  for each row execute function public.constancia_settings_touch();


-- ════════════════════════════════════════════════════════════════════
-- 022_handle_new_user.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 022: auto-crear public.perfiles al registrar usuario
-- =========================================================
-- Patrón canónico de Supabase: trigger en auth.users que copia los
-- datos del formulario (pasados como raw_user_meta_data desde
-- supabase.auth.signUp({ options: { data: {...} } })) a la tabla
-- public.perfiles. Corre con SECURITY DEFINER → bypassea RLS, por lo
-- que el registro no falla aunque la sesión aún no esté establecida o
-- la confirmación de correo esté activa.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si por cualquier razón ya existe (re-confirmación, doble trigger,
  -- migración manual), no rompemos el registro.
  insert into public.perfiles (
    id, nombres, apellido_paterno, apellido_materno,
    correo, telefono_movil, dependencia_id, cargo, aviso_privacidad
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Sin nombre'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Sin apellido'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono_movil',''),
    nullif(new.raw_user_meta_data->>'dependencia_id','')::int,
    nullif(new.raw_user_meta_data->>'cargo',''),
    coalesce((new.raw_user_meta_data->>'aviso_privacidad')::boolean, false)
  )
  on conflict (id) do update
    set nombres          = excluded.nombres,
        apellido_paterno = excluded.apellido_paterno,
        apellido_materno = excluded.apellido_materno,
        telefono_movil   = excluded.telefono_movil,
        dependencia_id   = excluded.dependencia_id,
        cargo            = excluded.cargo,
        aviso_privacidad = excluded.aviso_privacidad,
        actualizado_en   = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ════════════════════════════════════════════════════════════════════
-- 023_instructor_rol.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 024_foros.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 025_entregas.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 026_sesiones_virtuales.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 026: aulas virtuales con Jitsi
-- =========================================================
-- Módulo 4 del plan LMS.
--
--  * sesiones_virtuales: sesiones de videoconferencia por curso
--    estado: programada → en_vivo → terminada
--  * El instructor crea/edita/borra las de sus cursos (RLS directa).
--  * Las transiciones de estado van por RPC:
--      iniciar_sesion_virtual()   genera jitsi_room_id 'lms-{uuid}'
--                                 server-side (único) y marca en_vivo
--      terminar_sesion_virtual()  marca terminada + grabacion_url
--  * Realtime: la tabla se publica para que los alumnos vean el
--    pase a "en vivo" sin recargar.
-- =========================================================

create table if not exists public.sesiones_virtuales (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  instructor_id uuid not null references public.perfiles(id),
  titulo        text not null check (char_length(titulo) between 1 and 200),
  programada_en timestamptz not null,
  jitsi_room_id text unique,
  estado        text not null default 'programada'
                  check (estado in ('programada','en_vivo','terminada')),
  grabacion_url text,
  iniciada_en   timestamptz,
  terminada_en  timestamptz,
  creado_en     timestamptz not null default now()
);
create index if not exists sesiones_virtuales_curso_idx
  on public.sesiones_virtuales(curso_id, estado, programada_en desc);

-- ---------- RLS ----------
alter table public.sesiones_virtuales enable row level security;

drop policy if exists "sesiones: leer" on public.sesiones_virtuales;
create policy "sesiones: leer"
  on public.sesiones_virtuales for select to authenticated
  using (public.esta_inscrito(curso_id) or public.is_instructor_de(curso_id));

drop policy if exists "sesiones: instructor crear" on public.sesiones_virtuales;
create policy "sesiones: instructor crear"
  on public.sesiones_virtuales for insert to authenticated
  with check (public.is_instructor_de(curso_id) and instructor_id = auth.uid());

drop policy if exists "sesiones: instructor editar" on public.sesiones_virtuales;
create policy "sesiones: instructor editar"
  on public.sesiones_virtuales for update to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));

drop policy if exists "sesiones: instructor borrar" on public.sesiones_virtuales;
create policy "sesiones: instructor borrar"
  on public.sesiones_virtuales for delete to authenticated
  using (public.is_instructor_de(curso_id));

-- ---------- RPCs de transición de estado ----------
create or replace function public.iniciar_sesion_virtual(p_sesion uuid)
returns public.sesiones_virtuales
language plpgsql security definer set search_path = public as $$
declare v_row public.sesiones_virtuales;
begin
  select * into v_row from public.sesiones_virtuales where id = p_sesion;
  if not found then
    raise exception 'sesión no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;
  if v_row.estado = 'terminada' then
    raise exception 'la sesión ya terminó';
  end if;

  update public.sesiones_virtuales
    set estado = 'en_vivo',
        iniciada_en = coalesce(iniciada_en, now()),
        jitsi_room_id = coalesce(jitsi_room_id, 'lms-' || gen_random_uuid())
    where id = p_sesion
    returning * into v_row;

  return v_row;
end $$;

create or replace function public.terminar_sesion_virtual(
  p_sesion        uuid,
  p_grabacion_url text default null
)
returns public.sesiones_virtuales
language plpgsql security definer set search_path = public as $$
declare v_row public.sesiones_virtuales;
begin
  select * into v_row from public.sesiones_virtuales where id = p_sesion;
  if not found then
    raise exception 'sesión no existe';
  end if;
  if not public.is_instructor_de(v_row.curso_id) then
    raise exception 'no eres instructor de este curso';
  end if;
  if v_row.estado <> 'en_vivo' then
    raise exception 'solo se puede terminar una sesión en vivo';
  end if;

  update public.sesiones_virtuales
    set estado = 'terminada',
        terminada_en = now(),
        grabacion_url = coalesce(p_grabacion_url, grabacion_url)
    where id = p_sesion
    returning * into v_row;

  return v_row;
end $$;

grant execute on function public.iniciar_sesion_virtual(uuid)        to authenticated;
grant execute on function public.terminar_sesion_virtual(uuid, text) to authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.sesiones_virtuales;


-- ════════════════════════════════════════════════════════════════════
-- 027_chat.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 028_tiempo_curso.sql
-- ════════════════════════════════════════════════════════════════════

-- 028_tiempo_curso.sql
-- Conteo de tiempo ACTIVO por curso y por usuario.
-- El tiempo lo acumula el frontend con heartbeats (pestaña visible + actividad)
-- y lo persiste vía el RPC registrar_tiempo_curso, que aplica un clamp
-- anti-inflación del lado servidor.

create table if not exists public.tiempo_curso (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.perfiles(id) on delete cascade,
  curso_id         uuid not null references public.cursos(id) on delete cascade,
  segundos_activos bigint not null default 0,
  actualizado_en   timestamptz not null default now(),
  unique (user_id, curso_id)
);
create index if not exists tiempo_curso_user_idx  on public.tiempo_curso(user_id);
create index if not exists tiempo_curso_curso_idx on public.tiempo_curso(curso_id);

alter table public.tiempo_curso enable row level security;

-- El usuario lee únicamente su propio tiempo.
drop policy if exists "tiempo propio lectura" on public.tiempo_curso;
create policy "tiempo propio lectura" on public.tiempo_curso
  for select using ((select auth.uid()) = user_id);

-- El administrador lee todo (para reportes).
drop policy if exists "tiempo admin lectura" on public.tiempo_curso;
create policy "tiempo admin lectura" on public.tiempo_curso
  for select using (
    (select es_admin from public.perfiles where id = (select auth.uid()))
  );

-- Sin policies de insert/update: la escritura SOLO ocurre vía el RPC
-- security definer de abajo, nunca por PostgREST directo.

-- RPC: incrementa el tiempo activo del usuario actual en un curso.
-- p_segundos se acota a [0, 120] para que un cliente manipulado no pueda
-- inflar el contador más allá de una ventana de flush razonable.
create or replace function public.registrar_tiempo_curso(p_curso_id uuid, p_segundos int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_secs int  := greatest(0, least(coalesce(p_segundos, 0), 120));
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;
  if v_secs = 0 then
    return;
  end if;

  insert into public.tiempo_curso (user_id, curso_id, segundos_activos, actualizado_en)
  values (v_user, p_curso_id, v_secs, now())
  on conflict (user_id, curso_id)
  do update set
    segundos_activos = public.tiempo_curso.segundos_activos + excluded.segundos_activos,
    actualizado_en   = now();
end;
$$;

grant execute on function public.registrar_tiempo_curso(uuid, int) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 029_evaluaciones.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 030_feature_flags.sql
-- ════════════════════════════════════════════════════════════════════

create table public.feature_toggles (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.feature_toggles enable row level security;

create policy "feature_toggles: public read"
  on public.feature_toggles
  for select
  using (true);


-- ════════════════════════════════════════════════════════════════════
-- 031_worker_scaling.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 031: video worker horizontal scaling
-- =========================================================
-- Add worker_id so multiple workers can claim jobs safely
-- via SKIP LOCKED and report which worker is processing what.

alter table public.videos
  add column if not exists worker_id text,
  add column if not exists actualizado_en timestamptz not null default now();

-- Index for fast lookup of stuck jobs by worker
create index if not exists videos_worker_status_idx on public.videos(worker_id, status);


-- ════════════════════════════════════════════════════════════════════
-- 032_course_builder.sql
-- ════════════════════════════════════════════════════════════════════

-- 032_course_builder.sql
-- Constructor visual v2: orden fraccional, contenido enriquecido y RPCs de reorder.
-- Ver docs/superpowers/specs/2026-07-04-constructor-visual-design.md §14.

-- 1) Quitar los unique (curso_id, orden) / (modulo_id, orden): incompatibles
--    con reorden incremental (hoy obligan al truco de orden negativo del editor).
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'u'
      and conrelid in ('public.modulos'::regclass, 'public.lecciones'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2) Orden fraccional
alter table public.modulos
  alter column orden type double precision using orden::double precision;
alter table public.lecciones
  alter column orden type double precision using orden::double precision;

create index if not exists idx_modulos_curso_orden on public.modulos (curso_id, orden);
create index if not exists idx_lecciones_modulo_orden on public.lecciones (modulo_id, orden);

-- 3) Contenido enriquecido (JSON de Tiptap). Una lección de texto es
--    tipo_material = 'lectura' + contenido no nulo (no se amplía el enum).
alter table public.lecciones add column if not exists contenido jsonb;

-- 4) RPC: reorden masivo de módulos. Valida permiso sobre TODOS los módulos
--    del lote antes de aplicar (atómico).
create or replace function public.reordenar_modulos(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(items) it
    where (it->>'orden') is null
       or not ((it->>'orden') ~ '^-?[0-9]+(\.[0-9]+)?$')
  ) then
    raise exception 'orden inválido en items' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.modulos m on m.id = (item->>'id')::uuid
  where m.id is null
     or not public.is_instructor_de(m.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado para reordenar estos módulos'
      using errcode = '42501';
  end if;

  update public.modulos m
  set orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where m.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_modulos(jsonb) from public;
grant execute on function public.reordenar_modulos(jsonb) to authenticated;

-- 5) RPC: reorden masivo de lecciones (permite mover entre módulos del MISMO
--    curso; rechaza mover a módulos de cursos ajenos).
create or replace function public.reordenar_lecciones(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(items) it
    where (it->>'orden') is null
       or not ((it->>'orden') ~ '^-?[0-9]+(\.[0-9]+)?$')
  ) then
    raise exception 'orden inválido en items' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.lecciones l on l.id = (item->>'id')::uuid
  left join public.modulos mo on mo.id = l.modulo_id
  left join public.modulos md on md.id = (item->>'modulo_id')::uuid
  where l.id is null
     or md.id is null
     or md.curso_id <> mo.curso_id
     or not public.is_instructor_de(mo.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado o lote inválido para reordenar lecciones'
      using errcode = '42501';
  end if;

  update public.lecciones l
  set modulo_id = (item->>'modulo_id')::uuid,
      orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where l.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_lecciones(jsonb) from public;
grant execute on function public.reordenar_lecciones(jsonb) to authenticated;

-- 6) Feature flag runtime (apagado por default; se enciende por SQL/service-role)
insert into public.feature_toggles (key, enabled)
values ('visual_builder', false)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- 035_tipos_pregunta_extendidos.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 036_fase1_feature_flags.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 036: feature flags para Fase 1
insert into public.feature_toggles (key, enabled)
values
  ('advanced_quizzes', false),
  ('rubrics', false),
  ('bulk_user_import', false),
  ('cohorts', false)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- 037_rubricas.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 037: Sistema de rúbricas — ANULADA
-- =========================================================================
-- Esta migración nunca se aplicó en ninguna instalación: fallaba al primer
-- statement. Se conserva el archivo (y su nombre en public._migraciones)
-- pero su contenido se anula deliberadamente. Motivos:
--
--   1. Referenciaba `public.evaluaciones` y `public.resultados_evaluacion`,
--      tablas que no existen ni han existido en este esquema.
--   2. Sus políticas usaban `perfiles.rol = 'admin'`; la columna es
--      `perfiles.es_admin` (boolean). Ver public.is_admin() en 006.
--   3. Usaba `numnonnulls(...)`; la función es `num_nonnulls(...)`.
--   4. Lo decisivo: creaba `public.rubricas` con forma
--      (nombre, descripcion, criterios jsonb) INCOMPATIBLE con la que crea
--      053_entregas_rubricas.sql (tarea_id, tipo, titulo, puntaje_maximo),
--      que es la que usa el cliente (src/services/rubricas.ts). Como 053
--      declara `create table if not exists`, aplicar 037 dejaría el esquema
--      equivocado en pie SIN error, y todas las rúbricas dejarían de
--      funcionar de forma silenciosa.
--
-- El modelo de rúbricas vigente es el de 053: rubricas + rubrica_criterios
-- + rubrica_niveles. No añadir nada aquí.
-- =========================================================================

select 1;


-- ════════════════════════════════════════════════════════════════════
-- 038_cohortes.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 038: Cohortes
-- Un cohorte es un grupo de estudiantes dentro de un curso con foro privado.

create table if not exists public.cohortes (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  nombre text not null,
  descripcion text,
  cupo_max int,
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cohortes is 'Grupos/cohortes dentro de un curso';

create table if not exists public.miembros_cohorte (
  id uuid primary key default gen_random_uuid(),
  cohorte_id uuid not null references public.cohortes(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null default 'estudiante' check (rol in ('estudiante', 'ayudante')),
  created_at timestamptz not null default now(),
  unique (cohorte_id, usuario_id)
);

comment on table public.miembros_cohorte is 'Miembros de un cohorte';

-- NOTA: la versión original alteraba `public.foro` para añadir cohorte_id.
-- Esa tabla no existe (la de foros es `public.foros`, creada en 024) y el
-- foro privado por cohorte nunca se implementó en el cliente. Se elimina el
-- ALTER en vez de aplicarlo a la tabla equivocada; cuando la funcionalidad
-- se construya, debe llegar en su propia migración.

-- Políticas RLS
alter table public.cohortes enable row level security;
alter table public.miembros_cohorte enable row level security;

create policy "cohortes_select_all"
  on public.cohortes for select
  to authenticated
  using (true);

create policy "cohortes_mod_admin"
  on public.cohortes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "miembros_cohorte_select_all"
  on public.miembros_cohorte for select
  to authenticated
  using (true);

create policy "miembros_cohorte_mod_admin"
  on public.miembros_cohorte for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Función para obtener el cohorte de un usuario en un curso
create or replace function public.obtener_cohorte_usuario(p_curso_id uuid, p_usuario_id uuid)
returns uuid
language sql
stable
as $$
  select cohorte_id from public.miembros_cohorte mc
  join public.cohortes c on c.id = mc.cohorte_id
  where c.curso_id = p_curso_id and mc.usuario_id = p_usuario_id
  limit 1;
$$;


-- ════════════════════════════════════════════════════════════════════
-- 039_gamificacion.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 039: Schema de Gamificación
-- =========================================================
--  * niveles: niveles de usuario basados en puntos acumulados
--  * badges: logros desbloqueables con criterios configurables
--  * badge_usuarios: relación usuario-badge (cuándo se desbloqueó)
--  * log_puntos: registro inmutable de puntos otorgados
--  * condiciones_desbloqueo: reglas para desbloquear módulos
-- =========================================================

-- ---------- Niveles ----------
create table if not exists public.niveles (
  id          serial primary key,
  nombre      text not null unique,
  puntos_min  int not null default 0,
  icono_svg   text,
  color       text,
  created_at  timestamptz not null default now()
);

comment on table public.niveles is 'Niveles de gamificación basados en puntos mínimos acumulados';

insert into public.niveles (nombre, puntos_min, icono_svg, color) values
  ('Novato',      0,    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>', '#6B7280'),
  ('Aprendiz',    100,  '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', '#3B82F6'),
  ('Explorador',  300,  '<svg viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/></svg>', '#10B981'),
  ('Experto',     600,  '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>', '#8B5CF6'),
  ('Maestro',     1000, '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg>', '#F59E0B'),
  ('Leyenda',     2000, '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>', '#EF4444')
on conflict (nombre) do nothing;

-- ---------- Badges ----------
create table if not exists public.badges (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique,
  descripcion      text,
  icono_svg        text,
  criterio_tipo    text not null check (criterio_tipo in (
    'completar_curso', 'calificacion_minima', 'entregar_tiempo',
    'participar_foros', 'streak_dias', 'completar_modulo', 'primer_login'
  )),
  criterio_config  jsonb not null default '{}',
  puntos_otorga    int not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.badges is 'Logros desbloqueables del sistema de gamificación';
comment on column public.badges.criterio_config is 'Configuración específica del criterio (JSONB flexible)';

insert into public.badges (nombre, descripcion, criterio_tipo, criterio_config, puntos_otorga)
values
  ('Bienvenida', 'Iniciaste tu primera sesión', 'primer_login', '{}', 10),
  ('Primer paso', 'Completaste tu primera lección', 'completar_modulo', '{"modulo_orden": 1}', 20),
  ('Social', 'Participaste en 5 foros', 'participar_foros', '{"cantidad_min": 5}', 30),
  ('Aprobado', 'Obtuviste 70+ en una evaluación', 'calificacion_minima', '{"puntaje_min": 70}', 50),
  ('Constante', '7 días consecutivos de actividad', 'streak_dias', '{"dias_consecutivos": 7}', 100)
on conflict (nombre) do nothing;

-- ---------- Badge-Usuarios ----------
create table if not exists public.badge_usuarios (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  badge_id        uuid not null references public.badges(id) on delete cascade,
  desbloqueado_en timestamptz not null default now(),
  unique (usuario_id, badge_id)
);

comment on table public.badge_usuarios is 'Relación de badges desbloqueados por cada usuario';

-- ---------- Log de Puntos ----------
create table if not exists public.log_puntos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  fuente_tipo  text not null check (fuente_tipo in (
    'leccion_completada', 'quiz_aprobado', 'foro_post', 'entrega_tiempo',
    'badge_desbloqueado', 'login_diario', 'streak'
  )),
  fuente_id    uuid,
  puntos       int not null,
  descripcion  text,
  created_at   timestamptz not null default now()
);

create index if not exists log_puntos_usuario_idx on public.log_puntos(usuario_id, created_at desc);

create unique index if not exists log_puntos_unique_fuentes
  on public.log_puntos(usuario_id, fuente_tipo, fuente_id)
  where fuente_id is not null;

comment on table public.log_puntos is 'Registro inmutable de puntos otorgados a usuarios';

-- ---------- Condiciones de Desbloqueo ----------
create table if not exists public.condiciones_desbloqueo (
  id              uuid primary key default gen_random_uuid(),
  modulo_id       uuid not null references public.modulos(id) on delete cascade,
  tipo_condicion  text not null check (tipo_condicion in (
    'completar_modulo_previo', 'calificacion_minima', 'entregar_leccion',
    'dias_desde_inscripcion', 'badges_requeridos'
  )),
  config          jsonb not null default '{}',
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists condiciones_desbloqueo_modulo_idx on public.condiciones_desbloqueo(modulo_id, orden);

comment on table public.condiciones_desbloqueo is 'Reglas que determinan cuándo se desbloquea un módulo';

-- ---------- RLS ----------
alter table public.niveles                  enable row level security;
alter table public.badges                   enable row level security;
alter table public.badge_usuarios          enable row level security;
alter table public.log_puntos              enable row level security;
alter table public.condiciones_desbloqueo  enable row level security;

-- Niveles: lectura pública para autenticados
drop policy if exists "niveles_select_all" on public.niveles;
create policy "niveles_select_all"
  on public.niveles for select
  to authenticated
  using (true);

drop policy if exists "niveles_mod_admin" on public.niveles;
create policy "niveles_mod_admin"
  on public.niveles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Badges: lectura pública; modificación solo admin
drop policy if exists "badges_select_all" on public.badges;
create policy "badges_select_all"
  on public.badges for select
  to authenticated
  using (true);

drop policy if exists "badges_mod_admin" on public.badges;
create policy "badges_mod_admin"
  on public.badges for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Badge-Usuarios: cada usuario ve los propios; admin ve todos
drop policy if exists "badge_usuarios_select_self" on public.badge_usuarios;
create policy "badge_usuarios_select_self"
  on public.badge_usuarios for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "badge_usuarios_mod_admin" on public.badge_usuarios;
create policy "badge_usuarios_mod_admin"
  on public.badge_usuarios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Log Puntos: cada usuario ve los propios; admin ve todos
drop policy if exists "log_puntos_select_self" on public.log_puntos;
create policy "log_puntos_select_self"
  on public.log_puntos for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "log_puntos_mod_admin" on public.log_puntos;
create policy "log_puntos_mod_admin"
  on public.log_puntos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Condiciones Desbloqueo: lectura pública; modificación solo admin
drop policy if exists "condiciones_desbloqueo_select_all" on public.condiciones_desbloqueo;
create policy "condiciones_desbloqueo_select_all"
  on public.condiciones_desbloqueo for select
  to authenticated
  using (true);

drop policy if exists "condiciones_desbloqueo_mod_admin" on public.condiciones_desbloqueo;
create policy "condiciones_desbloqueo_mod_admin"
  on public.condiciones_desbloqueo for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ════════════════════════════════════════════════════════════════════
-- 040_triggers_puntos.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 040: Triggers y Vistas de Gamificación
-- =========================================================
--  * otorgar_puntos(): función security definer para insertar en log_puntos
--  * Triggers automáticos que otorgan puntos al completar lecciones,
--    aprobar evaluaciones y participar en foros.
--  * Vistas: v_puntos_usuario (suma total) y v_nivel_usuario (nivel actual).
-- =========================================================

-- ---------- Función para otorgar puntos ----------
create or replace function public.otorgar_puntos(
  p_usuario_id uuid,
  p_fuente_tipo text,
  p_fuente_id text default null,
  p_puntos int default 0,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow self or admin
  if p_usuario_id != auth.uid() and not public.is_admin() then
    raise exception 'No autorizado para otorgar puntos a este usuario';
  end if;

  -- Validate fuente_tipo
  if p_fuente_tipo not in ('leccion_completada', 'quiz_aprobado', 'foro_post', 'entrega_tiempo', 'badge_desbloqueado', 'login_diario', 'streak') then
    raise exception 'Tipo de fuente no válido: %', p_fuente_tipo;
  end if;

  insert into public.log_puntos (usuario_id, fuente_tipo, fuente_id, puntos, descripcion)
  values (p_usuario_id, p_fuente_tipo, p_fuente_id, p_puntos, p_descripcion)
  on conflict (usuario_id, fuente_tipo, fuente_id) where fuente_id is not null do nothing;
end;
$$;

grant execute on function public.otorgar_puntos(uuid, text, text, int, text) to authenticated;

-- ---------- Trigger: puntos por completar lección (10 pts) ----------
create or replace function public.trg_puntos_leccion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.completado is false and new.completado is true then
    perform public.otorgar_puntos(
      new.user_id,
      'leccion_completada',
      new.leccion_id,
      10,
      'Lección completada'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_puntos_leccion on public.progreso;
create trigger trg_puntos_leccion
  after update of completado on public.progreso
  for each row
  execute function public.trg_puntos_leccion_fn();

-- ---------- Trigger: puntos por aprobar evaluación (50 pts) ----------
-- Nota: la tabla real se llama intentos_evaluacion (aprobado boolean).
create or replace function public.trg_puntos_evaluacion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.aprobado is false and new.aprobado is true then
    perform public.otorgar_puntos(
      new.user_id,
      'quiz_aprobado',
      new.leccion_id,
      50,
      'Evaluación aprobada'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_puntos_evaluacion on public.intentos_evaluacion;
create trigger trg_puntos_evaluacion
  after update of aprobado on public.intentos_evaluacion
  for each row
  execute function public.trg_puntos_evaluacion_fn();

-- ---------- Trigger: puntos por crear hilo en foro (5 pts) ----------
create or replace function public.trg_puntos_foro_hilo_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.otorgar_puntos(
    new.autor_id,
    'foro_post',
    new.id,
    5,
    'Nuevo hilo en foro'
  );
  return new;
end $$;

drop trigger if exists trg_puntos_foro_hilo on public.foro_hilos;
create trigger trg_puntos_foro_hilo
  after insert on public.foro_hilos
  for each row
  execute function public.trg_puntos_foro_hilo_fn();

-- ---------- Trigger: puntos por responder en foro (5 pts) ----------
create or replace function public.trg_puntos_foro_resp_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.otorgar_puntos(
    new.autor_id,
    'foro_post',
    new.id,
    5,
    'Respuesta en foro'
  );
  return new;
end $$;

drop trigger if exists trg_puntos_foro_resp on public.foro_respuestas;
create trigger trg_puntos_foro_resp
  after insert on public.foro_respuestas
  for each row
  execute function public.trg_puntos_foro_resp_fn();

-- ---------- Vista: puntos totales por usuario ----------
create or replace view public.v_puntos_usuario as
select
  usuario_id,
  coalesce(sum(puntos), 0) as puntos_totales
from public.log_puntos
group by usuario_id;

comment on view public.v_puntos_usuario is 'Suma total de puntos acumulados por usuario';

-- ---------- Vista: nivel actual por usuario ----------
create or replace view public.v_nivel_usuario as
select
  pu.usuario_id,
  pu.puntos_totales,
  n.id   as nivel_id,
  n.nombre  as nivel_nombre,
  n.icono_svg as nivel_icono,
  n.color   as nivel_color
from public.v_puntos_usuario pu
left join lateral (
  select *
  from public.niveles
  where puntos_min <= pu.puntos_totales
  order by puntos_min desc
  limit 1
) n on true;

comment on view public.v_nivel_usuario is 'Nivel actual de cada usuario según sus puntos acumulados';

-- ---------- Grants sobre vistas ----------
grant select on public.v_puntos_usuario to authenticated;
grant select on public.v_nivel_usuario to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 041_feature_flag_gamificacion.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 041: Feature flag para gamificación
insert into public.feature_toggles (key, enabled)
values ('gamificacion', false)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- 042_lrs_statements.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 042: LRS Statements (xAPI-style learning records)
-- =========================================================
-- Módulo 3 — Analytics.
--  * Almacena eventos de aprendizaje (actor, verb, object, result).
--  * BRIN index en stored_at para consultas de rango temporal.
--  * RLS: admin lee todo; cada usuario inserta solo sus propios eventos.
-- =========================================================

create table if not exists public.lrs_statements (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users(id) on delete cascade,
  verb        text not null
                check (verb in ('initialized','completed','watched','answered',
                                'commented','submitted','logged_in','attempted',
                                'passed','failed')),
  object_type text not null
                check (object_type in ('course','lesson','quiz','forum',
                                       'assignment','platform')),
  object_id   uuid,
  result_json jsonb not null default '{}'::jsonb,
  timestamp   timestamptz not null default now(),
  stored_at   timestamptz not null default now()
);

create index if not exists lrs_statements_actor_timestamp_idx
  on public.lrs_statements(actor_id, timestamp desc);
create index if not exists lrs_statements_verb_timestamp_idx
  on public.lrs_statements(verb, timestamp desc);
create index if not exists lrs_statements_object_idx
  on public.lrs_statements(object_type, object_id);
create index if not exists lrs_statements_timestamp_brin_idx
  on public.lrs_statements using brin(stored_at);

-- ---------- RLS ----------
alter table public.lrs_statements enable row level security;

drop policy if exists "lrs_statements: leer admin" on public.lrs_statements;
create policy "lrs_statements: leer admin"
  on public.lrs_statements for select to authenticated
  using (public.is_admin());

drop policy if exists "lrs_statements: insertar propio" on public.lrs_statements;
create policy "lrs_statements: insertar propio"
  on public.lrs_statements for insert to authenticated
  with check (actor_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════
-- 043_analytics_views.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 043: Analytics views (engagement diario & riesgo alumno)
-- =========================================================
-- Módulo 3 — Analytics.
--  * v_engagement_diario: métricas por curso y día (logins, lecciones,
--    quizzes, foros) usando inscripciones, progreso, intentos_evaluación,
--    foros y lrs_statements.
--  * v_riesgo_alumno: score 0-100 de abandono por alumno y curso.
--    Fórmula exacta:
--      min(100, round(
--        min(dias_ultimo_login/30 * 30, 30) +
--        (100 - pct_lecciones) * 0.25 +
--        (100 - pct_quizzes) * 0.25 +
--        min(dias_ultima_entrega/60 * 20, 20)
--      ))
-- =========================================================

-- ---------- Engagement diario ----------
drop view if exists public.v_engagement_diario;
create view public.v_engagement_diario as
with daily_logins as (
  select date(ls.stored_at) as fecha,
         i.curso_id,
         count(*) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'logged_in'
  group by date(ls.stored_at), i.curso_id
),
daily_lecciones as (
  select date(p.completado_en) as fecha,
         m.curso_id,
         count(*) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and p.completado_en is not null
  group by date(p.completado_en), m.curso_id
),
daily_quizzes as (
  select date(creado_en) as fecha,
         curso_id,
         count(*) as n
  from public.intentos_evaluacion
  group by date(creado_en), curso_id
),
daily_foros_hilos as (
  select date(fh.creado_en) as fecha,
         fo.curso_id,
         count(*) as n
  from public.foro_hilos fh
  join public.foros fo on fo.id = fh.foro_id
  group by date(fh.creado_en), fo.curso_id
),
daily_foros_respuestas as (
  select date(fr.creado_en) as fecha,
         fo.curso_id,
         count(*) as n
  from public.foro_respuestas fr
  join public.foro_hilos fh on fh.id = fr.hilo_id
  join public.foros fo on fo.id = fh.foro_id
  group by date(fr.creado_en), fo.curso_id
),
fechas_cursos as (
  select fecha, curso_id from daily_logins
  union
  select fecha, curso_id from daily_lecciones
  union
  select fecha, curso_id from daily_quizzes
  union
  select fecha, curso_id from daily_foros_hilos
  union
  select fecha, curso_id from daily_foros_respuestas
)
select
  fc.fecha,
  fc.curso_id,
  coalesce(dl.n, 0) as logins,
  coalesce(dlec.n, 0) as lecciones_completadas,
  coalesce(dq.n, 0) as quizzes_respondidos,
  coalesce(dfh.n, 0) + coalesce(dfr.n, 0) as foros_posts
from fechas_cursos fc
left join daily_logins dl
  on dl.fecha = fc.fecha and dl.curso_id = fc.curso_id
left join daily_lecciones dlec
  on dlec.fecha = fc.fecha and dlec.curso_id = fc.curso_id
left join daily_quizzes dq
  on dq.fecha = fc.fecha and dq.curso_id = fc.curso_id
left join daily_foros_hilos dfh
  on dfh.fecha = fc.fecha and dfh.curso_id = fc.curso_id
left join daily_foros_respuestas dfr
  on dfr.fecha = fc.fecha and dfr.curso_id = fc.curso_id
order by fc.fecha desc, fc.curso_id;

-- ---------- Riesgo de abandono ----------
drop view if exists public.v_riesgo_alumno;
create view public.v_riesgo_alumno as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_quizzes as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where l.tipo_material = 'examen'
  group by m.curso_id
),
lecciones_completadas as (
  select p.user_id, m.curso_id, count(p.leccion_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by p.user_id, m.curso_id
),
quizzes_intentados as (
  select ie.user_id, ie.curso_id, count(distinct ie.leccion_id) as n
  from public.intentos_evaluacion ie
  group by ie.user_id, ie.curso_id
),
ultimo_login as (
  select actor_id as user_id, max(timestamp) as ultimo
  from public.lrs_statements
  where verb = 'logged_in'
  group by actor_id
),
ultima_entrega as (
  select el.user_id, el.curso_id, max(el.creado_en) as ultimo
  from public.entregas_leccion el
  group by el.user_id, el.curso_id
)
select
  i.user_id,
  i.curso_id,
  current_date - date(coalesce(ul.ultimo, i.inscrito_en)) as dias_ultimo_login,
  coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0) as pct_lecciones,
  coalesce(round(qi.n::numeric / nullif(tq.total, 0) * 100, 2), 0) as pct_quizzes,
  current_date - date(coalesce(ue.ultimo, i.inscrito_en)) as dias_ultima_entrega,
  least(100, round(
    least(
      (current_date - date(coalesce(ul.ultimo, i.inscrito_en)))::numeric / 30 * 30,
      30
    ) +
    (100 - coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0)) * 0.25 +
    (100 - coalesce(round(qi.n::numeric / nullif(tq.total, 0) * 100, 2), 0)) * 0.25 +
    least(
      (current_date - date(coalesce(ue.ultimo, i.inscrito_en)))::numeric / 60 * 20,
      20
    )
  ))::int as score_riesgo
from public.inscripciones i
left join total_lecciones tl on tl.curso_id = i.curso_id
left join total_quizzes tq on tq.curso_id = i.curso_id
left join lecciones_completadas lc
  on lc.user_id = i.user_id and lc.curso_id = i.curso_id
left join quizzes_intentados qi
  on qi.user_id = i.user_id and qi.curso_id = i.curso_id
left join ultimo_login ul on ul.user_id = i.user_id
left join ultima_entrega ue
  on ue.user_id = i.user_id and ue.curso_id = i.curso_id;


-- ════════════════════════════════════════════════════════════════════
-- 044_feature_flags_analytics.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 044: Feature flags para analytics
insert into public.feature_toggles (key, enabled)
values
  ('analytics', false),
  ('risk_dashboard', false),
  ('downloadable_reports', false)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- 045_ai_config.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 045: Configuración y caché de IA

create table if not exists public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  content_type text not null check (content_type in ('text', 'video')),
  summary_text text not null,
  model_used text,
  tokens_used int,
  created_at timestamptz not null default now(),
  unique (leccion_id, content_type)
);

comment on table public.ai_summaries is 'Caché de resúmenes de lecciones generados por IA';

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('quiz', 'summary', 'chat')),
  tokens_input int not null default 0,
  tokens_output int not null default 0,
  cost_usd decimal(10,6) not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_logs is 'Log de uso de IA para tracking de costos';

create table if not exists public.ai_config (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'claude')) default 'openai',
  model text not null default 'gpt-4o-mini',
  api_key_encrypted text, -- en producción usar vault o encrypt
  max_tokens_per_day int not null default 100000,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_config is 'Configuración global de IA';

-- Insertar config por defecto
insert into public.ai_config (provider, model, max_tokens_per_day)
values ('openai', 'gpt-4o-mini', 100000)
on conflict do nothing;

-- RLS
alter table public.ai_summaries enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_config enable row level security;

create policy "ai_summaries_select_all"
  on public.ai_summaries for select to authenticated using (true);

create policy "ai_usage_logs_select_admin"
  on public.ai_usage_logs for select to authenticated
  using (public.is_admin());

create policy "ai_config_select_all"
  on public.ai_config for select to authenticated using (true);

create policy "ai_config_mod_admin"
  on public.ai_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ════════════════════════════════════════════════════════════════════
-- 046_ai_feature_flags.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 046: Feature flags para IA

insert into public.feature_toggles (key, enabled)
values
  ('ai_quiz_generator', false),
  ('ai_summaries', false),
  ('ai_study_assistant', false)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- 047_pwa_offline.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 047: PWA Offline — push subscriptions y feature flags

insert into public.feature_toggles (key, enabled)
values
  ('pwa_offline', false),
  ('offline_video_cache', false),
  ('offline_sync', false),
  ('push_notifications', false)
on conflict (key) do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

comment on table public.push_subscriptions is 'Suscripciones Web Push por usuario';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════
-- 048_reportes_avanzados.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 048: Reportes Administrativos Avanzados (Fase H1)
-- =========================================================
-- Módulo 3 — Analytics.
--  * Feature flag reportes_avanzados.
--  * v_funnel_curso: funnel de conversión por curso.
--  * v_retencion_cohorte: retención por cohorte semanal.
--  * v_comparativa_cursos: métricas agregadas por curso.
-- =========================================================

-- ---------- Feature flag ----------
insert into public.feature_toggles (key, enabled)
values ('reportes_avanzados', false)
on conflict (key) do nothing;

-- ---------- Funnel de conversión por curso ----------
drop view if exists public.v_funnel_curso;
create view public.v_funnel_curso as
with visitantes as (
  select i.curso_id, count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i
    on i.user_id = ls.actor_id and i.curso_id = ls.object_id
  where ls.verb = 'viewed' and ls.object_type = 'curso'
  group by i.curso_id
),
registrados as (
  select i.curso_id, count(distinct au.id) as n
  from auth.users au
  join public.inscripciones i on i.user_id = au.id
  group by i.curso_id
),
inscritos as (
  select curso_id, count(*) as n
  from public.inscripciones
  group by curso_id
),
activos as (
  select i.curso_id, count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'logged_in'
  group by i.curso_id
),
completados as (
  select m.curso_id, count(distinct p.user_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by m.curso_id
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(v.n, 0) as visitantes,
  coalesce(r.n, 0) as registrados,
  coalesce(i.n, 0) as inscritos,
  coalesce(a.n, 0) as activos,
  coalesce(comp.n, 0) as completados
from public.cursos c
left join visitantes v on v.curso_id = c.id
left join registrados r on r.curso_id = c.id
left join inscritos i on i.curso_id = c.id
left join activos a on a.curso_id = c.id
left join completados comp on comp.curso_id = c.id;

-- ---------- Retención por cohorte (semana de inscripción) ----------
drop view if exists public.v_retencion_cohorte;
create view public.v_retencion_cohorte as
with inscripciones_cohorte as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana_inicio,
    to_char(date_trunc('week', i.inscrito_en), 'IYYY-IW') as semana,
    i.user_id,
    i.inscrito_en
  from public.inscripciones i
),
logins as (
  select actor_id as user_id, timestamp
  from public.lrs_statements
  where verb = 'logged_in'
),
retencion as (
  select
    ic.curso_id,
    ic.semana_inicio,
    ic.semana,
    ic.user_id,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '7 days' then 1 else 0 end) as d7,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '14 days' then 1 else 0 end) as d14,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '30 days' then 1 else 0 end) as d30,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '60 days' then 1 else 0 end) as d60,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '90 days' then 1 else 0 end) as d90
  from inscripciones_cohorte ic
  left join logins l on l.user_id = ic.user_id
  group by ic.curso_id, ic.semana_inicio, ic.semana, ic.user_id
)
select
  curso_id,
  semana,
  count(*) as total_inscritos,
  sum(d7) as activos_d7,
  sum(d14) as activos_d14,
  sum(d30) as activos_d30,
  sum(d60) as activos_d60,
  sum(d90) as activos_d90,
  round(coalesce(sum(d7)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d7,
  round(coalesce(sum(d14)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d14,
  round(coalesce(sum(d30)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d30,
  round(coalesce(sum(d60)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d60,
  round(coalesce(sum(d90)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d90
from retencion
group by curso_id, semana_inicio, semana
order by semana_inicio desc;

-- ---------- Métricas agregadas por curso ----------
drop view if exists public.v_comparativa_cursos;
create view public.v_comparativa_cursos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_inscritos as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
lecciones_completadas as (
  select p.user_id, m.curso_id, count(p.leccion_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by p.user_id, m.curso_id
),
total_completados as (
  select lc.curso_id, count(distinct lc.user_id) as total
  from lecciones_completadas lc
  join total_lecciones tl on tl.curso_id = lc.curso_id
  where lc.n = tl.total
  group by lc.curso_id
),
engagement as (
  select i.curso_id, count(ls.id)::numeric / nullif(count(distinct i.user_id), 0) as avg_activities
  from public.inscripciones i
  left join public.lrs_statements ls on ls.actor_id = i.user_id
  group by i.curso_id
),
calificaciones as (
  select curso_id, avg(puntaje)::numeric as avg_cal
  from public.intentos_evaluacion
  where aprobado
  group by curso_id
),
dias_por_estudiante as (
  select m.curso_id, p.user_id, max(date(p.completado_en) - date(i.inscrito_en)) as dias
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  join public.inscripciones i on i.user_id = p.user_id and i.curso_id = m.curso_id
  where p.completado and p.completado_en is not null
  group by m.curso_id, p.user_id
  having count(p.leccion_id) = (
    select count(l2.id)
    from public.lecciones l2
    join public.modulos m2 on m2.id = l2.modulo_id
    where m2.curso_id = m.curso_id
  )
),
dias_completar as (
  select curso_id, round(avg(dias)::numeric, 1) as avg_dias
  from dias_por_estudiante
  group by curso_id
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(ti.total, 0) as total_inscritos,
  coalesce(tc.total, 0) as total_completados,
  round(coalesce(tc.total::numeric / nullif(ti.total, 0) * 100, 0), 1) as tasa_finalizacion,
  round(coalesce(e.avg_activities, 0), 1) as engagement_promedio,
  round(coalesce(ca.avg_cal, 0), 1) as calificacion_promedio,
  coalesce(dc.avg_dias, 0) as dias_promedio_completar
from public.cursos c
left join total_inscritos ti on ti.curso_id = c.id
left join total_completados tc on tc.curso_id = c.id
left join engagement e on e.curso_id = c.id
left join calificaciones ca on ca.curso_id = c.id
left join dias_completar dc on dc.curso_id = c.id;


-- ════════════════════════════════════════════════════════════════════
-- 049_reportes_instructor.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 049: Reportes por Instructor + Análisis de Contenido (Fase H2)
-- =========================================================
-- Módulo 3 — Analytics.
--  * v_instructor_cursos: métricas agregadas de los cursos asignados a
--    cada instructor (alumnos, aprobación, calificación, tiempo de
--    finalización, lecciones y módulos).
--  * v_instructor_alumnos: desglose por alumno y curso (progreso,
--    calificación, tiempo dedicado/activo, última actividad,
--    participación en foros y entregas).
--  * v_leccion_analytics: métricas por lección (visualizaciones,
--    completitud, tiempo promedio visto, comentarios, entregas,
--    foros, evaluaciones y calificación promedio).
-- =========================================================

-- ---------- Cursos del instructor con métricas agregadas ----------
drop view if exists public.v_instructor_cursos;
create view public.v_instructor_cursos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_modulos as (
  select curso_id, count(*) as total
  from public.modulos
  group by curso_id
),
total_alumnos as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
aprobados as (
  select curso_id, count(*) as total
  from public.intentos_evaluacion
  where aprobado
  group by curso_id
),
promedio_calif as (
  select curso_id, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by curso_id
),
alumnos_completados as (
  select i.curso_id, i.user_id, max(p.completado_en) as ultima_leccion
  from public.inscripciones i
  join public.progreso p on p.user_id = i.user_id
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and p.completado_en is not null and m.curso_id = i.curso_id
  group by i.curso_id, i.user_id
  having count(p.leccion_id) = (
    select count(l2.id)
    from public.lecciones l2
    join public.modulos m2 on m2.id = l2.modulo_id
    where m2.curso_id = i.curso_id
  )
),
tiempo_completar as (
  select ac.curso_id,
         round(avg(extract(epoch from (ac.ultima_leccion - i.inscrito_en)) / 86400)::numeric, 1) as avg_dias
  from alumnos_completados ac
  join public.inscripciones i on i.curso_id = ac.curso_id and i.user_id = ac.user_id
  group by ac.curso_id
)
select
  ci.user_id as instructor_id,
  ci.curso_id,
  c.titulo as curso_titulo,
  coalesce(ta.total, 0) as total_alumnos,
  round(coalesce(ap.total::numeric / nullif(ta.total, 0) * 100, 0), 1) as tasa_aprobacion,
  coalesce(pc.avg_puntaje, 0) as promedio_calificacion,
  coalesce(tc.avg_dias, 0) as tiempo_promedio_completar,
  coalesce(tl.total, 0) as total_lecciones,
  coalesce(tm.total, 0) as total_modulos
from public.cursos_instructores ci
join public.cursos c on c.id = ci.curso_id
left join total_alumnos ta on ta.curso_id = ci.curso_id
left join aprobados ap on ap.curso_id = ci.curso_id
left join promedio_calif pc on pc.curso_id = ci.curso_id
left join tiempo_completar tc on tc.curso_id = ci.curso_id
left join total_lecciones tl on tl.curso_id = ci.curso_id
left join total_modulos tm on tm.curso_id = ci.curso_id;

-- ---------- Alumnos por curso del instructor ----------
drop view if exists public.v_instructor_alumnos;
create view public.v_instructor_alumnos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
lecciones_completadas as (
  select p.user_id, m.curso_id, count(p.leccion_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by p.user_id, m.curso_id
),
calif_promedio as (
  select user_id, curso_id, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by user_id, curso_id
),
tiempo_dedicado as (
  select p.user_id, m.curso_id, sum(p.segundos_vistos) as total_segundos
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  group by p.user_id, m.curso_id
),
tiempo_activo as (
  select user_id, curso_id, sum(segundos_activos) as total_segundos
  from public.tiempo_curso
  group by user_id, curso_id
),
ultima_actividad as (
  select actor_id as user_id, max(timestamp) as ultimo
  from public.lrs_statements
  group by actor_id
),
foros_hilos_user as (
  select fh.autor_id as user_id, f.curso_id, count(*) as n
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  group by fh.autor_id, f.curso_id
),
foros_respuestas_user as (
  select fr.autor_id as user_id, f.curso_id, count(*) as n
  from public.foro_respuestas fr
  join public.foro_hilos fh on fh.id = fr.hilo_id
  join public.foros f on f.id = fh.foro_id
  group by fr.autor_id, f.curso_id
),
entregas_user as (
  select user_id, curso_id, count(*) as n
  from public.entregas_leccion
  group by user_id, curso_id
)
select
  i.user_id,
  p.nombres_completos,
  p.correo,
  i.curso_id,
  c.titulo as curso_titulo,
  coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0) as pct_progreso,
  coalesce(cp.avg_puntaje, 0) as calificacion_promedio,
  coalesce(td.total_segundos, 0) as tiempo_dedicado_segundos,
  coalesce(ta.total_segundos, 0) as tiempo_activo_segundos,
  ult.ultimo as ultima_actividad,
  coalesce(fh.n, 0) + coalesce(fr.n, 0) as foros_posts,
  coalesce(eu.n, 0) as entregas_realizadas
from public.inscripciones i
join public.perfiles p on p.id = i.user_id
join public.cursos c on c.id = i.curso_id
left join total_lecciones tl on tl.curso_id = i.curso_id
left join lecciones_completadas lc
  on lc.user_id = i.user_id and lc.curso_id = i.curso_id
left join calif_promedio cp
  on cp.user_id = i.user_id and cp.curso_id = i.curso_id
left join tiempo_dedicado td
  on td.user_id = i.user_id and td.curso_id = i.curso_id
left join tiempo_activo ta
  on ta.user_id = i.user_id and ta.curso_id = i.curso_id
left join ultima_actividad ult on ult.user_id = i.user_id
left join foros_hilos_user fh
  on fh.user_id = i.user_id and fh.curso_id = i.curso_id
left join foros_respuestas_user fr
  on fr.user_id = i.user_id and fr.curso_id = i.curso_id
left join entregas_user eu
  on eu.user_id = i.user_id and eu.curso_id = i.curso_id;

-- ---------- Métricas por lección ----------
drop view if exists public.v_leccion_analytics;
create view public.v_leccion_analytics as
with total_inscritos_curso as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
vieron as (
  select p.leccion_id, count(distinct p.user_id) as n
  from public.progreso p
  where p.segundos_vistos > 0
  group by p.leccion_id
),
completaron as (
  select leccion_id, count(*) as n
  from public.progreso
  where completado
  group by leccion_id
),
tiempo_visto as (
  select leccion_id, round(avg(segundos_vistos)::numeric, 1) as avg_segundos
  from public.progreso
  where segundos_vistos > 0
  group by leccion_id
),
comentarios as (
  select leccion_id, count(*) as n
  from public.comentarios
  group by leccion_id
),
entregas as (
  select leccion_id, count(*) as n
  from public.entregas_leccion
  group by leccion_id
),
evaluaciones as (
  select leccion_id, count(*) as n, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by leccion_id
),
foro_hilos_curso as (
  select f.curso_id, count(*) as n
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  group by f.curso_id
)
select
  l.id as leccion_id,
  l.titulo as leccion_titulo,
  m.titulo as modulo_titulo,
  m.curso_id,
  coalesce(v.n, 0) as total_alumnos_vieron,
  coalesce(c.n, 0) as total_completaron,
  round(coalesce(c.n::numeric / nullif(tic.total, 0) * 100, 0), 1) as tasa_completitud,
  coalesce(tv.avg_segundos, 0) as tiempo_promedio_visto_segundos,
  coalesce(com.n, 0) as total_comentarios,
  coalesce(ent.n, 0) as total_entregas,
  coalesce(fhc.n, 0) as total_foro_hilos,
  coalesce(ev.n, 0) as total_evaluaciones,
  coalesce(ev.avg_puntaje, 0) as calificacion_promedio
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
left join total_inscritos_curso tic on tic.curso_id = m.curso_id
left join vieron v on v.leccion_id = l.id
left join completaron c on c.leccion_id = l.id
left join tiempo_visto tv on tv.leccion_id = l.id
left join comentarios com on com.leccion_id = l.id
left join entregas ent on ent.leccion_id = l.id
left join evaluaciones ev on ev.leccion_id = l.id
left join foro_hilos_curso fhc on fhc.curso_id = m.curso_id;


-- ════════════════════════════════════════════════════════════════════
-- 050_reportes_personalizables.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 050: Reportes Personalizables + Financieros (Fase H3)
-- =========================================================
-- Módulo 3 — Analytics.
--  * reportes_favoritos: filtros guardados por usuario.
--  * reportes_programados: reportes con ejecución recurrente.
--  * reportes_historial: log de ejecuciones programadas.
--  * v_costos_infraestructura: estimación de costos de storage + IA.
--  * v_inscripciones_tiempo: inscripciones agregadas por día.
--  * v_cursos_populares: ranking de cursos por inscripciones y finalización.
-- =========================================================

-- ---------- Ajuste de schema para vistas financieras ----------
-- La vista de costos requiere tamanio_bytes en videos.
alter table public.videos
  add column if not exists tamanio_bytes bigint not null default 0;

-- ---------- Tablas de reportes personalizables ----------

create table if not exists public.reportes_favoritos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  nombre       text not null,
  tipo_reporte text not null check (tipo_reporte in ('instructor','admin','financiero','engagement')),
  filtros      jsonb not null default '{}',
  creado_en    timestamptz not null default now()
);

create index if not exists reportes_favoritos_usuario_idx
  on public.reportes_favoritos(usuario_id);

alter table public.reportes_favoritos enable row level security;

drop policy if exists "reportes_favoritos: usuario ve lo suyo" on public.reportes_favoritos;
create policy "reportes_favoritos: usuario ve lo suyo"
  on public.reportes_favoritos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


create table if not exists public.reportes_programados (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users(id) on delete cascade,
  nombre            text not null,
  tipo_reporte      text not null,
  filtros           jsonb not null default '{}',
  frecuencia        text not null check (frecuencia in ('diario','semanal','mensual')),
  ultima_ejecucion  timestamptz,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

create index if not exists reportes_programados_usuario_idx
  on public.reportes_programados(usuario_id);

alter table public.reportes_programados enable row level security;

drop policy if exists "reportes_programados: usuario ve lo suyo" on public.reportes_programados;
create policy "reportes_programados: usuario ve lo suyo"
  on public.reportes_programados for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


create table if not exists public.reportes_historial (
  id                uuid primary key default gen_random_uuid(),
  programado_id     uuid not null references public.reportes_programados(id) on delete cascade,
  estado            text not null check (estado in ('exitoso','error')),
  resultado_resumen  jsonb not null default '{}',
  ejecutado_en      timestamptz not null default now()
);

create index if not exists reportes_historial_programado_idx
  on public.reportes_historial(programado_id);

alter table public.reportes_historial enable row level security;

drop policy if exists "reportes_historial: usuario ve lo suyo" on public.reportes_historial;
create policy "reportes_historial: usuario ve lo suyo"
  on public.reportes_historial for all to authenticated
  using (
    programado_id in (
      select id from public.reportes_programados where usuario_id = auth.uid()
    )
  );


-- ---------- Vista: costos de infraestructura ----------
drop view if exists public.v_costos_infraestructura;
create view public.v_costos_infraestructura as
with videos_stats as (
  select
    count(*) as total_videos,
    coalesce(sum(tamanio_bytes), 0)::numeric / 1e9 as gb
  from public.videos
),
-- Usamos entregas_leccion como proxy de documentos almacenados,
-- ya que el LMS no cuenta con una tabla central de documentos.
documentos_stats as (
  select
    count(*) as total_documentos,
    coalesce(sum(archivo_bytes), 0)::numeric / 1e9 as gb
  from public.entregas_leccion
),
ia_stats as (
  select
    count(*) as total_llamadas,
    coalesce(sum(tokens_input + tokens_output), 0) as total_tokens,
    coalesce(sum(cost_usd), 0)::numeric as costo_ia_usd
  from public.ai_usage_logs
)
select
  v.total_videos,
  round(v.gb, 3) as almacenamiento_videos_gb,
  d.total_documentos,
  round(d.gb, 3) as almacenamiento_docs_gb,
  ia.total_llamadas,
  ia.total_tokens,
  round(ia.costo_ia_usd, 4) as costo_ia_usd,
  round(
    coalesce(v.gb * 0.023, 0)
    + coalesce(d.gb * 0.023, 0)
    + coalesce(ia.costo_ia_usd, 0),
    4
  ) as costo_total_estimado_usd
from videos_stats v
cross join documentos_stats d
cross join ia_stats ia;


-- ---------- Vista: inscripciones en el tiempo ----------
drop view if exists public.v_inscripciones_tiempo;
create view public.v_inscripciones_tiempo as
select
  date(inscrito_en) as fecha,
  count(*) as total_inscripciones,
  count(distinct curso_id) as cursos_distintos
from public.inscripciones
group by date(inscrito_en)
order by fecha desc;


-- ---------- Vista: cursos más populares ----------
drop view if exists public.v_cursos_populares;
create view public.v_cursos_populares as
with lecciones_por_curso as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_inscritos as (
  select curso_id, count(*) as n
  from public.inscripciones
  group by curso_id
),
lecciones_completadas as (
  select i.curso_id, i.user_id, count(p.leccion_id) as n
  from public.inscripciones i
  join public.progreso p on p.user_id = i.user_id
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and m.curso_id = i.curso_id
  group by i.curso_id, i.user_id
),
total_completados as (
  select lc.curso_id, count(*) as n
  from lecciones_completadas lc
  join lecciones_por_curso lpc on lpc.curso_id = lc.curso_id
  where lc.n = lpc.total
  group by lc.curso_id
),
total_eventos as (
  select
    coalesce(cm.id, lm.curso_id) as curso_id,
    count(ls.id) as n
  from public.lrs_statements ls
  left join public.cursos cm
    on cm.id = ls.object_id and ls.object_type = 'course'
  left join public.lecciones l
    on l.id = ls.object_id and ls.object_type = 'lesson'
  left join public.modulos lm
    on lm.id = l.modulo_id
  where cm.id is not null or lm.curso_id is not null
  group by coalesce(cm.id, lm.curso_id)
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(ti.n, 0) as total_inscripciones,
  coalesce(tc.n, 0) as total_completados,
  coalesce(te.n, 0) as total_eventos,
  round(
    coalesce(tc.n::numeric / nullif(ti.n, 0) * 100, 0),
    1
  ) as tasa_finalizacion
from public.cursos c
left join total_inscritos ti on ti.curso_id = c.id
left join total_completados tc on tc.curso_id = c.id
left join total_eventos te on te.curso_id = c.id
order by coalesce(ti.n, 0) desc;


-- ════════════════════════════════════════════════════════════════════
-- 051_notificaciones.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 051: Sistema de Notificaciones (Fase I)
-- =========================================================
--  * notificaciones: cola principal de notificaciones
--  * notificacion_plantillas: plantillas por tipo de evento
--  * email_configuracion: configuración singleton de email
--  * notificacion_preferencias: preferencias por usuario
--  * anuncios: anuncios publicados por instructores
--  * Triggers para 7 eventos automáticos
--  * Funciones cron para deadlines, alertas de riesgo y SLA
--  * Jobs pg_cron para ejecutar workers
-- =========================================================
--
-- ── Enum values actually used in this migration ──
--   canal:   'in_app', 'email', 'push', 'sms'
--   estado:  'pendiente', 'enviado', 'fallido', 'cancelado'
--   proveedor (email): 'sendgrid', 'mailgun', 'smtp', 'aws_ses'
--
--   NOTE: badge_usuarios.usuario_id references auth.users(id)
--         while notificaciones.usuario_id references perfiles(id).
--         They are expected to hold the same UUID, but this is a
--         latent FK mismatch that should be resolved in a future
--         migration (e.g., add a surrogate perfiles.id or unify
--         the badge table reference).
-- =========================================================

-- pg_cron es requerido para los jobs programados
create extension if not exists pg_cron;
-- pg_net es requerido para que el cron job llame al Edge Function vía HTTP
create extension if not exists pg_net;


-- ==========================================================
-- Step 1 — Tablas base
-- ==========================================================

-- ---------- Notificaciones ----------
create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  tipo        text not null,
  titulo      text not null,
  cuerpo      text,
  datos       jsonb not null default '{}',
  canal       text not null default 'in_app' check (canal in ('in_app','email','push','sms')),
  estado      text not null default 'pendiente' check (estado in ('pendiente','enviado','fallido','cancelado')),
  leido       boolean not null default false,
  enviado_en  timestamptz,
  creado_en   timestamptz not null default now()
);

create index if not exists notificaciones_usuario_idx
  on public.notificaciones(usuario_id, creado_en desc);
create index if not exists notificaciones_estado_idx
  on public.notificaciones(estado) where estado = 'pendiente';
create index if not exists notificaciones_tipo_idx
  on public.notificaciones(tipo);

comment on table public.notificaciones is 'Cola principal de notificaciones del LMS';
comment on column public.notificaciones.datos is 'Payload JSONB con contexto específico del evento';
comment on column public.notificaciones.canal is 'Canal de entrega: in_app, email, push, sms';
comment on column public.notificaciones.estado is 'Estado de entrega: pendiente, enviado, fallido, cancelado';

alter table public.notificaciones enable row level security;

drop policy if exists "notificaciones: usuario ve las propias" on public.notificaciones;
create policy "notificaciones: usuario ve las propias"
  on public.notificaciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "notificaciones: admin ve todas" on public.notificaciones;
create policy "notificaciones: admin ve todas"
  on public.notificaciones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Plantillas de notificación ----------
create table if not exists public.notificacion_plantillas (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null unique,
  asunto          text,
  titulo_template text not null,
  cuerpo_template text not null,
  canal_default   text not null default 'in_app' check (canal_default in ('in_app','email','push','sms')),
  activa          boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on table public.notificacion_plantillas is 'Plantillas de notificación por tipo de evento';

alter table public.notificacion_plantillas enable row level security;

drop policy if exists "plantillas: lectura publica" on public.notificacion_plantillas;
create policy "plantillas: lectura publica"
  on public.notificacion_plantillas for select to authenticated
  using (true);

drop policy if exists "plantillas: admin escribe" on public.notificacion_plantillas;
create policy "plantillas: admin escribe"
  on public.notificacion_plantillas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Configuración de email (singleton) ----------
create table if not exists public.email_configuracion (
  id                int primary key default 1 check (id = 1),
  proveedor         text not null check (proveedor in ('sendgrid','mailgun','smtp','aws_ses','resend')),
  api_key           text,
  remitente_email   text not null default 'noreply@cursos-amx.local',
  remitente_nombre  text not null default 'Cursos AMX',
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

comment on table public.email_configuracion is 'Configuración singleton del proveedor de email';

alter table public.email_configuracion enable row level security;

drop policy if exists "email_config: admin" on public.email_configuracion;
create policy "email_config: admin"
  on public.email_configuracion for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.email_configuracion (id, proveedor, remitente_email, remitente_nombre)
values (1, 'resend', 'noreply@cursos-amx.local', 'Cursos AMX')
on conflict (id) do nothing;


-- ---------- Preferencias de notificación por usuario ----------
create table if not exists public.notificacion_preferencias (
  usuario_id      uuid primary key references public.perfiles(id) on delete cascade,
  silenciados     text[] not null default '{}',
  canal_default   text not null default 'in_app' check (canal_default in ('in_app','email','push','sms')),
  updated_at      timestamptz not null default now()
);

comment on table public.notificacion_preferencias is 'Preferencias de notificación por usuario (tipos silenciados, canal default)';

alter table public.notificacion_preferencias enable row level security;

drop policy if exists "preferencias: usuario propio" on public.notificacion_preferencias;
create policy "preferencias: usuario propio"
  on public.notificacion_preferencias for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "preferencias: admin" on public.notificacion_preferencias;
create policy "preferencias: admin"
  on public.notificacion_preferencias for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Anuncios de instructor ----------
create table if not exists public.anuncios (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  titulo        text not null,
  cuerpo        text,
  instructor_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en     timestamptz not null default now()
);

create index if not exists anuncios_curso_idx
  on public.anuncios(curso_id, creado_en desc);

comment on table public.anuncios is 'Anuncios publicados por instructores para los cursos';

alter table public.anuncios enable row level security;

drop policy if exists "anuncios: leer inscritos" on public.anuncios;
create policy "anuncios: leer inscritos"
  on public.anuncios for select to authenticated
  using (
    public.esta_inscrito(curso_id)
    or public.is_instructor_de(curso_id)
    or public.is_admin()
  );

drop policy if exists "anuncios: instructor escribe" on public.anuncios;
create policy "anuncios: instructor escribe"
  on public.anuncios for all to authenticated
  using (public.is_instructor_de(curso_id))
  with check (public.is_instructor_de(curso_id));


-- ==========================================================
-- Step 2 — Plantillas default
-- ==========================================================

insert into public.notificacion_plantillas (tipo, asunto, titulo_template, cuerpo_template, canal_default)
values
  ('curso_asignado',       'Nuevo curso asignado',           'Nuevo curso asignado',                     'Se te ha asignado al curso {{curso_titulo}}.',                               'in_app'),
  ('evaluacion_calificada','Evaluación calificada',          'Evaluación calificada',                    'Tu evaluación "{{evaluacion_titulo}}" fue calificada con {{calificacion}}.','in_app'),
  ('badge_desbloqueado',   'Nuevo badge',                    'Badge desbloqueado',                       'Desbloqueaste el badge "{{badge_nombre}}" y ganaste {{puntos}} puntos.',    'in_app'),
  ('foro_respuesta',       'Nueva respuesta en foro',        'Nueva respuesta en tu hilo',               'Hay una nueva respuesta en tu hilo del foro.',                               'in_app'),
  ('certificacion_lista',  'Certificación lista',            'Tu certificación está lista',              'Tu constancia para "{{curso_titulo}}" está disponible.',                     'in_app'),
  ('deadline_proximo',     'Deadline próximo',               'Evaluación por cerrar',                    'Tienes una evaluación que cierra pronto: "{{evaluacion_titulo}}".',          'email'),
  ('reporte_listo',        'Reporte listo',                  'Reporte listo',                            'Tu reporte "{{reporte_nombre}}" ha finalizado correctamente.',               'in_app'),
  ('alerta_riesgo',        'Alerta de riesgo',               'Estudiante con bajo progreso',             'Un estudiante tiene bajo progreso en el curso.',                              'in_app'),
  ('sla_respuesta',        'SLA de respuesta',               'Evaluaciones pendientes de calificar',     'Hay evaluaciones pendientes de calificar por más de 3 días.',               'in_app')
on conflict (tipo) do nothing;


-- ==========================================================
-- Step 3 — Función helper y triggers
-- ==========================================================

-- Helper para insertar notificaciones desde triggers respetando preferencias
create or replace function public.crear_notificacion(
  p_usuario_id uuid,
  p_tipo       text,
  p_titulo     text,
  p_cuerpo     text,
  p_datos      jsonb default '{}',
  p_canal      text default 'in_app'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_pref     public.notificacion_preferencias;
begin
  -- Si el usuario silenció este tipo, no crear notificación
  select * into v_pref
  from public.notificacion_preferencias
  where usuario_id = p_usuario_id;

  if found and p_tipo = any(v_pref.silenciados) then
    return null;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
  values (p_usuario_id, p_tipo, p_titulo, p_cuerpo, p_datos, coalesce(v_pref.canal_default, p_canal))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_notificacion(uuid, text, text, text, jsonb, text) to authenticated;


-- ---------- 1. curso_asignado ----------
create or replace function public.trg_notif_curso_asignado_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_titulo text;
begin
  select titulo into v_curso_titulo from public.cursos where id = new.curso_id;

  perform public.crear_notificacion(
    new.user_id,
    'curso_asignado',
    'Nuevo curso asignado',
    'Se te ha asignado al curso: ' || coalesce(v_curso_titulo, 'Sin título'),
    jsonb_build_object('curso_id', new.curso_id, 'inscripcion_id', new.id),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_curso_asignado on public.inscripciones;
create trigger trg_notif_curso_asignado
  after insert on public.inscripciones
  for each row
  execute function public.trg_notif_curso_asignado_fn();


-- ---------- 2. evaluacion_calificada ----------
create or replace function public.trg_notif_eval_calificada_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lec_titulo text;
begin
  if old.aprobado is false and new.aprobado is true then
    select titulo into v_lec_titulo from public.lecciones where id = new.leccion_id;

    perform public.crear_notificacion(
      new.user_id,
      'evaluacion_calificada',
      'Evaluación aprobada',
      'Aprobaste la evaluación "' || coalesce(v_lec_titulo, 'Sin título') || '" con ' || new.puntaje || '/100',
      jsonb_build_object('leccion_id', new.leccion_id, 'curso_id', new.curso_id, 'puntaje', new.puntaje),
      'in_app'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_eval_calificada on public.intentos_evaluacion;
create trigger trg_notif_eval_calificada
  after update of aprobado on public.intentos_evaluacion
  for each row
  execute function public.trg_notif_eval_calificada_fn();


-- ---------- 3. badge_desbloqueado ----------
-- NOTE: new.usuario_id comes from badge_usuarios.usuario_id which references
-- auth.users(id), while notificaciones.usuario_id references perfiles(id).
-- They are expected to hold the same UUID, but this is a latent FK mismatch.
create or replace function public.trg_notif_badge_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge_nombre text;
  v_badge_puntos int;
begin
  select nombre, puntos_otorga into v_badge_nombre, v_badge_puntos
  from public.badges where id = new.badge_id;

  perform public.crear_notificacion(
    new.usuario_id,
    'badge_desbloqueado',
    'Badge desbloqueado: ' || coalesce(v_badge_nombre, 'Nuevo logro'),
    'Desbloqueaste el badge "' || coalesce(v_badge_nombre, 'Nuevo logro') || '" y ganaste ' || coalesce(v_badge_puntos::text, '0') || ' puntos.',
    jsonb_build_object('badge_id', new.badge_id, 'badge_nombre', v_badge_nombre, 'puntos', v_badge_puntos),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_badge on public.badge_usuarios;
create trigger trg_notif_badge
  after insert on public.badge_usuarios
  for each row
  execute function public.trg_notif_badge_fn();


-- ---------- 4. foro_respuesta ----------
create or replace function public.trg_notif_foro_resp_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hilo_autor  uuid;
  v_foro_titulo text;
  v_curso_id    uuid;
begin
  select fh.autor_id, f.titulo, f.curso_id
  into v_hilo_autor, v_foro_titulo, v_curso_id
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  where fh.id = new.hilo_id;

  if v_hilo_autor is not null and v_hilo_autor <> new.autor_id then
    perform public.crear_notificacion(
      v_hilo_autor,
      'foro_respuesta',
      'Nueva respuesta en tu hilo',
      'Alguien respondió en tu hilo del foro "' || coalesce(v_foro_titulo, 'Foro') || '"',
      jsonb_build_object('hilo_id', new.hilo_id, 'respuesta_id', new.id, 'curso_id', v_curso_id, 'autor_id', new.autor_id),
      'in_app'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_foro_resp on public.foro_respuestas;
create trigger trg_notif_foro_resp
  after insert on public.foro_respuestas
  for each row
  execute function public.trg_notif_foro_resp_fn();


-- ---------- 5. anuncio_instructor ----------
create or replace function public.trg_notif_anuncio_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select user_id from public.inscripciones where curso_id = new.curso_id
  loop
    perform public.crear_notificacion(
      r.user_id,
      'anuncio_instructor',
      'Anuncio: ' || new.titulo,
      coalesce(new.cuerpo, 'Tu instructor publicó un nuevo anuncio.'),
      jsonb_build_object('curso_id', new.curso_id, 'anuncio_id', new.id, 'instructor_id', new.instructor_id),
      'in_app'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notif_anuncio on public.anuncios;
create trigger trg_notif_anuncio
  after insert on public.anuncios
  for each row
  execute function public.trg_notif_anuncio_fn();


-- ---------- 6. certificacion_lista ----------
-- (adaptado: la constancia se genera al completar todas las lecciones)
create or replace function public.trg_notif_certificacion_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_titulo text;
begin
  select titulo into v_curso_titulo from public.cursos where id = new.curso_id;

  perform public.crear_notificacion(
    new.user_id,
    'certificacion_lista',
    'Certificación lista',
    'Tu constancia para "' || coalesce(v_curso_titulo, 'el curso') || '" está disponible.',
    jsonb_build_object('curso_id', new.curso_id, 'constancia_id', new.id, 'folio', new.folio),
    'in_app'
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_certificacion on public.constancias;
create trigger trg_notif_certificacion
  after insert on public.constancias
  for each row
  execute function public.trg_notif_certificacion_fn();


-- ---------- 7. reporte_listo ----------
create or replace function public.trg_notif_reporte_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id     uuid;
  v_reporte_nombre text;
begin
  if old.estado <> 'exitoso' and new.estado = 'exitoso' then
    select rp.usuario_id, rp.nombre into v_usuario_id, v_reporte_nombre
    from public.reportes_programados rp
    where rp.id = new.programado_id;

    if v_usuario_id is not null then
      perform public.crear_notificacion(
        v_usuario_id,
        'reporte_listo',
        'Reporte listo: ' || coalesce(v_reporte_nombre, 'Reporte'),
        'Tu reporte programado ha finalizado correctamente.',
        jsonb_build_object('reporte_historial_id', new.id, 'programado_id', new.programado_id, 'resultado', new.resultado_resumen),
        'in_app'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_reporte on public.reportes_historial;
create trigger trg_notif_reporte
  after update of estado on public.reportes_historial
  for each row
  execute function public.trg_notif_reporte_fn();


-- ==========================================================
-- Step 4 — Funciones cron
-- ==========================================================

-- ---------- Deadline próximo ----------
create or replace function public.notificar_deadlines_proximos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stub: no existe columna fecha_cierre en lecciones/evaluaciones.
  -- Cuando se implementen deadlines, buscar evaluaciones que cierren en <24h
  -- donde el alumno no ha completado un intento, e insertar notificación.
  null;
end;
$$;

grant execute on function public.notificar_deadlines_proximos() to authenticated;


-- ---------- Alertas de riesgo ----------
create or replace function public.notificar_alertas_riesgo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    with lecciones_por_curso as (
      select m.curso_id, count(l.id) as total
      from public.lecciones l
      join public.modulos m on m.id = l.modulo_id
      group by m.curso_id
    ),
    progreso_por_usuario_curso as (
      select p.user_id, m.curso_id, count(p.leccion_id) as completadas
      from public.progreso p
      join public.lecciones l on l.id = p.leccion_id
      join public.modulos m on m.id = l.modulo_id
      where p.completado
      group by p.user_id, m.curso_id
    ),
    riesgo as (
      select
        i.user_id as estudiante_id,
        i.curso_id,
        coalesce(ppu.completadas, 0)::numeric / nullif(lpc.total, 0) * 100 as pct
      from public.inscripciones i
      join lecciones_por_curso lpc on lpc.curso_id = i.curso_id
      left join progreso_por_usuario_curso ppu
        on ppu.user_id = i.user_id and ppu.curso_id = i.curso_id
      where i.inscrito_en < now() - interval '7 days'
        and coalesce(ppu.completadas, 0)::numeric / nullif(lpc.total, 0) < 0.5
    )
    select
      r2.estudiante_id,
      r2.curso_id,
      r2.pct,
      ci.user_id as instructor_id
    from riesgo r2
    join public.cursos_instructores ci on ci.curso_id = r2.curso_id
    where not exists (
      select 1 from public.notificaciones n
      where n.usuario_id = ci.user_id
        and n.tipo = 'alerta_riesgo'
        and n.datos->>'estudiante_id' = r2.estudiante_id::text
        and n.datos->>'curso_id' = r2.curso_id::text
        and n.creado_en > now() - interval '7 days'
    )
  loop
    perform public.crear_notificacion(
      r.instructor_id,
      'alerta_riesgo',
      'Alerta de riesgo: estudiante con bajo progreso',
      'Un estudiante tiene ' || round(r.pct, 1) || '% de progreso en el curso.',
      jsonb_build_object('estudiante_id', r.estudiante_id, 'curso_id', r.curso_id, 'pct_progreso', round(r.pct, 1)),
      'in_app'
    );
  end loop;
end;
$$;

grant execute on function public.notificar_alertas_riesgo() to authenticated;


-- ---------- SLA respuesta ----------
create or replace function public.notificar_sla_respuesta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stub: las evaluaciones en este schema son auto-calificadas.
  -- Cuando exista calificación manual, buscar intentos con estado
  -- "pendiente_calificacion" creados hace >3 días e insertar notificación.
  null;
end;
$$;

grant execute on function public.notificar_sla_respuesta() to authenticated;


-- ==========================================================
-- Step 5 — Cron jobs
-- ==========================================================

do $$
begin
  perform cron.unschedule('notifications-worker');
  perform cron.unschedule('deadline-proximo');
  perform cron.unschedule('alerta-riesgo');
  perform cron.unschedule('sla-respuesta');
exception when others then
  null;
end $$;

select cron.schedule('notifications-worker', '* * * * *', $$
  select net.http_get(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/notifications-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'))
  );
$$);
select cron.schedule('deadline-proximo',     '0 8 * * *', 'select public.notificar_deadlines_proximos()');
select cron.schedule('alerta-riesgo',        '0 9 * * *', 'select public.notificar_alertas_riesgo()');
select cron.schedule('sla-respuesta',        '0 9 * * *', 'select public.notificar_sla_respuesta()');


-- ════════════════════════════════════════════════════════════════════
-- 052_video_analytics.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 052: Video Analytics (Fase J — Task 1)
-- =========================================================
--  * video_eventos: eventos crudos del reproductor
--  * video_intervalos: buckets agregados de 10 s
--  * video_analytics_config: configuración singleton
--  * v_video_leccion_stats: métricas por lección
--  * v_curso_video_stats: métricas por curso
--  * agregar_video_intervalos(p_fecha): función de agregación
--  * Cron job para ejecutar la agregación diaria a las 02:00
-- =========================================================

create extension if not exists pg_cron;

-- ==========================================================
-- Step 1 — Tablas base
-- ==========================================================

-- ---------- video_eventos ----------
create table if not exists public.video_eventos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.perfiles(id) on delete cascade,
  leccion_id    uuid not null references public.lecciones(id) on delete cascade,
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  video_id      uuid references public.videos(id) on delete set null,
  evento        text not null
                  check (evento in ('play', 'pause', 'seek', 'tick', 'complete', 'ratechange')),
  tiempo_video  int not null default 0,
  datos         jsonb not null default '{}',
  creado_en     timestamptz not null default now()
);

create index if not exists idx_video_eventos_user_leccion
  on public.video_eventos(user_id, leccion_id, creado_en desc);
create index if not exists video_eventos_curso_idx
  on public.video_eventos(curso_id, creado_en desc);
create index if not exists video_eventos_evento_idx
  on public.video_eventos(evento, creado_en desc);

comment on table public.video_eventos is 'Eventos crudos del reproductor de video (play, pause, seek, tick, complete, ratechange)';
comment on column public.video_eventos.evento is 'Tipo de evento: play, pause, seek, tick, complete, ratechange';
comment on column public.video_eventos.tiempo_video is 'Tiempo en segundos dentro del video cuando ocurrió el evento';
comment on column public.video_eventos.datos is 'Payload JSONB adicional (velocidad, calidad, error_code, etc.)';

alter table public.video_eventos enable row level security;

drop policy if exists "video_eventos: usuario inserta propio" on public.video_eventos;
create policy "video_eventos: usuario inserta propio"
  on public.video_eventos for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "video_eventos: usuario lee propio" on public.video_eventos;
create policy "video_eventos: usuario lee propio"
  on public.video_eventos for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "video_eventos: admin lee todo" on public.video_eventos;
create policy "video_eventos: admin lee todo"
  on public.video_eventos for select to authenticated
  using (public.is_admin());

drop policy if exists "video_eventos: instructor lee curso" on public.video_eventos;
create policy "video_eventos: instructor lee curso"
  on public.video_eventos for select to authenticated
  using (public.is_instructor_de(curso_id));


-- ---------- video_intervalos ----------
create table if not exists public.video_intervalos (
  id              uuid primary key default gen_random_uuid(),
  leccion_id      uuid not null references public.lecciones(id) on delete cascade,
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  fecha           date not null,
  intervalo_inicio int not null,
  duracion_bucket  int not null default 10,
  vistas_unicas   int not null default 0,
  total_visto     int not null default 0,
  abandonos       int not null default 0,
  saltos_adelante int not null default 0,
  saltos_atras    int not null default 0,
  unique (leccion_id, fecha, intervalo_inicio)
);

create index if not exists video_intervalos_leccion_fecha_idx
  on public.video_intervalos(leccion_id, fecha);
create index if not exists video_intervalos_curso_fecha_idx
  on public.video_intervalos(curso_id, fecha);

comment on table public.video_intervalos is 'Buckets agregados de 10 segundos con métricas de reproducción por lección y día';
comment on column public.video_intervalos.intervalo_inicio is 'Segundo de inicio del bucket (0, 10, 20, ...)';
comment on column public.video_intervalos.vistas_unicas is 'Usuarios distintos que reprodujeron este bucket';
comment on column public.video_intervalos.total_visto is 'Segundos totales reproducidos en este bucket (vistas_unicas × duracion_bucket aprox)';
comment on column public.video_intervalos.abandonos is 'Usuarios cuyo último evento del día fue pause/seek/buffer antes del 90% del video';
comment on column public.video_intervalos.saltos_adelante is 'Saltos hacia adelante que aterrizaron en este bucket';
comment on column public.video_intervalos.saltos_atras is 'Saltos hacia atrás que aterrizaron en este bucket';

alter table public.video_intervalos enable row level security;

drop policy if exists "video_intervalos: usuario lee propio" on public.video_intervalos;
create policy "video_intervalos: usuario lee propio"
  on public.video_intervalos for select to authenticated
  using (exists (
    select 1 from public.video_eventos ve
    where ve.leccion_id = video_intervalos.leccion_id
      and ve.user_id = auth.uid()
  ));

drop policy if exists "video_intervalos: admin lee todo" on public.video_intervalos;
create policy "video_intervalos: admin lee todo"
  on public.video_intervalos for select to authenticated
  using (public.is_admin());

drop policy if exists "video_intervalos: instructor lee curso" on public.video_intervalos;
create policy "video_intervalos: instructor lee curso"
  on public.video_intervalos for select to authenticated
  using (public.is_instructor_de(curso_id));


-- ---------- video_analytics_config (singleton) ----------
create table if not exists public.video_analytics_config (
  id                    int primary key default 1 check (id = 1),
  tracking_activo       boolean not null default true,
  bucket_segundos       int not null default 10,
  eventos_batch_interval int not null default 60,
  guardar_eventos_crudos boolean not null default true
);

comment on table public.video_analytics_config is 'Configuración singleton del sistema de analytics de video';
comment on column public.video_analytics_config.bucket_segundos is 'Tamaño de cada bucket de agregación en segundos';
comment on column public.video_analytics_config.eventos_batch_interval is 'Intervalo en segundos para envío batch de eventos desde el cliente';
comment on column public.video_analytics_config.guardar_eventos_crudos is 'Si se deben persistir los eventos crudos además de los buckets agregados';

alter table public.video_analytics_config enable row level security;

drop policy if exists "video_analytics_config: admin" on public.video_analytics_config;
create policy "video_analytics_config: admin"
  on public.video_analytics_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "video_analytics_config: authenticated read" on public.video_analytics_config;
create policy "video_analytics_config: authenticated read"
  on public.video_analytics_config for select to authenticated
  using (true);

insert into public.video_analytics_config (id, tracking_activo, bucket_segundos, eventos_batch_interval, guardar_eventos_crudos)
values (1, true, 10, 60, true)
on conflict (id) do nothing;


-- ==========================================================
-- Step 2 — Vistas
-- ==========================================================

-- ---------- v_video_leccion_stats ----------
drop view if exists public.v_video_leccion_stats;
create view public.v_video_leccion_stats as
with event_stats as (
  select
    ve.leccion_id,
    count(distinct ve.user_id) as total_vistas_unicas,
    count(*) filter (where ve.evento = 'complete') as total_completados
  from public.video_eventos ve
  group by ve.leccion_id
),
interval_stats as (
  select
    leccion_id,
    coalesce(sum(total_visto), 0)     as total_segundos_vistos,
    coalesce(sum(abandonos), 0)       as total_abandonos,
    coalesce(sum(saltos_adelante), 0) as total_saltos_adelante,
    coalesce(sum(saltos_atras), 0)    as total_saltos_atras
  from public.video_intervalos
  group by leccion_id
)
select
  l.id as leccion_id,
  m.curso_id,
  l.titulo as leccion_titulo,
  coalesce(v.duracion_seg, l.duracion_seg, 0) as duracion_segundos,
  coalesce(es.total_vistas_unicas, 0)     as total_vistas_unicas,
  coalesce(is_.total_segundos_vistos, 0)  as total_segundos_vistos,
  round(
    coalesce(es.total_completados::numeric / nullif(es.total_vistas_unicas, 0) * 100, 0),
    2
  ) as tasa_completitud_pct,
  round(
    coalesce(is_.total_abandonos::numeric / nullif(es.total_vistas_unicas, 0) * 100, 0),
    2
  ) as tasa_abandono_pct,
  round(
    coalesce(is_.total_saltos_adelante::numeric / nullif(es.total_vistas_unicas, 0), 0),
    2
  ) as avg_saltos_adelante,
  round(
    coalesce(is_.total_saltos_atras::numeric / nullif(es.total_vistas_unicas, 0), 0),
    2
  ) as avg_saltos_atras
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
left join public.videos v on v.leccion_id = l.id
left join event_stats es on es.leccion_id = l.id
left join interval_stats is_ on is_.leccion_id = l.id
where l.tipo_material = 'video';

comment on view public.v_video_leccion_stats is 'Métricas agregadas de reproducción por lección (completitud, abandono, tiempo visto)';


-- ---------- v_curso_video_stats ----------
drop view if exists public.v_curso_video_stats;
create view public.v_curso_video_stats as
select
  v.curso_id,
  c.titulo as curso_titulo,
  count(*) as total_lecciones_video,
  round(coalesce(avg(v.tasa_completitud_pct), 0), 2)       as avg_tasa_completitud,
  round(coalesce(avg(v.total_segundos_vistos::numeric / nullif(v.duracion_segundos, 0)), 0), 2) as avg_ratio_visto,
  round(coalesce(max(v.tasa_abandono_pct), 0), 2)          as max_tasa_abandono,
  round(coalesce(min(v.tasa_completitud_pct), 0), 2)       as min_tasa_completitud
from public.v_video_leccion_stats v
join public.cursos c on c.id = v.curso_id
group by v.curso_id, c.titulo;

comment on view public.v_curso_video_stats is 'Métricas agregadas de reproducción por curso (avg completitud, max abandono)';


-- ==========================================================
-- Step 3 — Función de agregación y cron
-- ==========================================================

create or replace function public.agregar_video_intervalos(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket int;
begin
  -- Tamaño del bucket desde configuración
  select bucket_segundos into v_bucket
  from public.video_analytics_config
  where id = 1;

  if v_bucket is null or v_bucket <= 0 then
    v_bucket := 10;
  end if;

  -- Idempotencia: eliminar buckets existentes del día
  delete from public.video_intervalos where fecha = p_fecha;

  -- -----------------------------------------------------------------
  -- 1. Buckets base: vistas únicas y tiempo visto a partir de
  --    eventos 'tick'. Cada evento de tick implica que el
  --    usuario estaba reproduciendo el bucket que contiene
  --    tiempo_video.
  -- -----------------------------------------------------------------
  with tick_buckets as (
    select distinct
      leccion_id,
      curso_id,
      user_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start
    from public.video_eventos
    where date(creado_en) = p_fecha
      and evento = 'tick'
  ),
  bucket_agg as (
    select
      leccion_id,
      curso_id,
      p_fecha as fecha,
      bucket_start as intervalo_inicio,
      v_bucket as duracion_bucket,
      count(distinct user_id) as vistas_unicas,
      count(distinct user_id) * v_bucket as total_visto
    from tick_buckets
    group by leccion_id, curso_id, bucket_start
  )
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto)
  select * from bucket_agg;

  -- -----------------------------------------------------------------
  -- 2. Abandonos: usuarios cuyo último evento del día para esa
  --    lección fue pause/seek/buffer (no 'complete') y antes del 90%
  --    de la duración del video.
  -- -----------------------------------------------------------------
  with last_events as (
    select distinct on (leccion_id, user_id)
      leccion_id,
      user_id,
      curso_id,
      evento,
      tiempo_video
    from public.video_eventos
    where date(creado_en) = p_fecha
    order by leccion_id, user_id, creado_en desc
  ),
  video_durations as (
    select
      l.id as leccion_id,
      coalesce(v.duracion_seg, l.duracion_seg, 0) as duracion
    from public.lecciones l
    left join public.videos v on v.leccion_id = l.id
  )
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, abandonos)
  select
    le.leccion_id,
    le.curso_id,
    p_fecha,
    (le.tiempo_video / v_bucket) * v_bucket,
    v_bucket,
    0,
    0,
    count(*)
  from last_events le
  join video_durations vd on vd.leccion_id = le.leccion_id
  where le.evento in ('pause', 'seek', 'buffer')
    and vd.duracion > 0
    and le.tiempo_video < (vd.duracion * 0.9)
  group by le.leccion_id, le.curso_id, (le.tiempo_video / v_bucket) * v_bucket
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set abandonos = public.video_intervalos.abandonos + excluded.abandonos;

  -- -----------------------------------------------------------------
  -- 3. Saltos hacia adelante y hacia atrás. Comparamos tiempo_video
  --    con el evento inmediatamente anterior del mismo usuario en
  --    la misma lección.
  -- -----------------------------------------------------------------
  with seek_events as (
    select
      leccion_id,
      user_id,
      tiempo_video,
      lag(tiempo_video) over (
        partition by leccion_id, user_id order by creado_en
      ) as prev_tiempo,
      curso_id
    from public.video_eventos
    where date(creado_en) = p_fecha
      and evento = 'seek'
  ),
  forward_seeks as (
    select
      leccion_id,
      curso_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start,
      count(*) as n
    from seek_events
    where tiempo_video > coalesce(prev_tiempo, 0)
    group by leccion_id, curso_id, (tiempo_video / v_bucket) * v_bucket
  ),
  backward_seeks as (
    select
      leccion_id,
      curso_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start,
      count(*) as n
    from seek_events
    where tiempo_video < coalesce(prev_tiempo, 0)
    group by leccion_id, curso_id, (tiempo_video / v_bucket) * v_bucket
  )
  -- Merge forward seeks
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, saltos_adelante)
  select
    leccion_id,
    curso_id,
    p_fecha,
    bucket_start,
    v_bucket,
    0,
    0,
    n
  from forward_seeks
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set saltos_adelante = public.video_intervalos.saltos_adelante + excluded.saltos_adelante;

  -- Merge backward seeks
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, saltos_atras)
  select
    leccion_id,
    curso_id,
    p_fecha,
    bucket_start,
    v_bucket,
    0,
    0,
    n
  from backward_seeks
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set saltos_atras = public.video_intervalos.saltos_atras + excluded.saltos_atras;

end;
$$;

grant execute on function public.agregar_video_intervalos(date) to authenticated;


-- ---------- Cron job ----------
do $$
begin
  perform cron.unschedule('video-analytics-aggregate');
exception when others then
  null;
end $$;

select cron.schedule(
  'video-analytics-aggregate',
  '0 2 * * *',
  'select public.agregar_video_intervalos(current_date - 1)'
);


-- ════════════════════════════════════════════════════════════════════
-- 053_entregas_rubricas.sql
-- ════════════════════════════════════════════════════════════════════

-- Migration 053: Entregas, Rúbricas y Calificaciones (Fase K)
-- ============================================================

-- 1. Enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entrega_estado') THEN
    CREATE TYPE entrega_estado AS ENUM ('pendiente', 'entregada', 'calificada', 'devuelta');
  END IF;
END$$;

-- 2. Table: tareas
CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  modulo_id uuid REFERENCES modulos(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  instrucciones jsonb,
  fecha_apertura timestamptz,
  fecha_limite timestamptz,
  maximo_archivos int DEFAULT 5 CHECK (maximo_archivos > 0 AND maximo_archivos <= 10),
  peso_maximo_mb int DEFAULT 10 CHECK (peso_maximo_mb > 0 AND peso_maximo_mb <= 100),
  permitir_retraso boolean DEFAULT false,
  penalizacion_retraso_pct int DEFAULT 0 CHECK (penalizacion_retraso_pct >= 0 AND penalizacion_retraso_pct <= 100),
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now()
);

-- 3. Table: entregas
CREATE TABLE IF NOT EXISTS entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado entrega_estado NOT NULL DEFAULT 'pendiente',
  entregado_en timestamptz,
  calificado_en timestamptz,
  calificado_por uuid REFERENCES auth.users(id),
  puntaje_final numeric(5,2) CHECK (puntaje_final >= 0 AND puntaje_final <= 100),
  comentario_instructor jsonb,
  version_actual int DEFAULT 0,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now(),
  UNIQUE(tarea_id, user_id)
);

-- 4. Table: entrega_versiones
CREATE TABLE IF NOT EXISTS entrega_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  numero_version int NOT NULL,
  texto jsonb,
  archivos text[],
  entregado_en timestamptz DEFAULT now(),
  comentario_alumno text,
  UNIQUE(entrega_id, numero_version)
);

-- 5. Table: rubricas
CREATE TABLE IF NOT EXISTS rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('niveles', 'puntaje_libre')),
  titulo text NOT NULL,
  puntaje_maximo int DEFAULT 100,
  creado_en timestamptz DEFAULT now()
);

-- 6. Table: rubrica_criterios
CREATE TABLE IF NOT EXISTS rubrica_criterios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid NOT NULL REFERENCES rubricas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  orden int NOT NULL,
  peso numeric(3,2) DEFAULT 1.0 CHECK (peso > 0),
  puntaje_maximo int,
  UNIQUE(rubrica_id, orden)
);

-- 7. Table: rubrica_niveles
CREATE TABLE IF NOT EXISTS rubrica_niveles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid NOT NULL REFERENCES rubricas(id) ON DELETE CASCADE,
  etiqueta text NOT NULL,
  puntaje int NOT NULL CHECK (puntaje >= 0),
  orden int NOT NULL,
  UNIQUE(rubrica_id, orden)
);

-- 8. Table: calificaciones
CREATE TABLE IF NOT EXISTS calificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  criterio_id uuid NOT NULL REFERENCES rubrica_criterios(id) ON DELETE CASCADE,
  nivel_id uuid REFERENCES rubrica_niveles(id) ON DELETE SET NULL,
  puntaje numeric(5,2) CHECK (puntaje >= 0),
  comentario text,
  UNIQUE(entrega_id, criterio_id)
);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_entregas_tarea_user ON entregas(tarea_id, user_id);
CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
CREATE INDEX IF NOT EXISTS idx_entrega_versiones_entrega ON entrega_versiones(entrega_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_entrega ON calificaciones(entrega_id);

-- 10. View: v_entregas_pendientes_instructor
CREATE OR REPLACE VIEW v_entregas_pendientes_instructor
  WITH (security_invoker = on) AS
SELECT
  e.id AS entrega_id,
  e.tarea_id,
  e.user_id,
  e.estado,
  e.entregado_en,
  t.titulo AS tarea_titulo,
  t.curso_id,
  c.titulo AS curso_titulo,
  p.nombres AS alumno_nombres,
  -- perfiles no tiene `apellidos` ni `email`: son apellido_paterno /
  -- apellido_materno (con nombres_completos generada) y `correo`.
  trim(both from p.apellido_paterno || coalesce(' ' || p.apellido_materno, ''))
    AS alumno_apellidos,
  p.correo AS alumno_email
FROM entregas e
JOIN tareas t ON t.id = e.tarea_id
JOIN cursos c ON c.id = t.curso_id
JOIN perfiles p ON p.id = e.user_id
WHERE e.estado = 'entregada';

-- 11. RLS
-- Enable RLS on all tables
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrega_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrica_niveles ENABLE ROW LEVEL SECURITY;
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;

-- Helper function: is_instructor_of_course(curso_id)
CREATE OR REPLACE FUNCTION is_instructor_of_course(p_curso_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM cursos
    WHERE id = p_curso_id AND instructor_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: is_instructor_of_entrega(entrega_id)
CREATE OR REPLACE FUNCTION is_instructor_of_entrega(p_entrega_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM entregas e
    JOIN tareas t ON t.id = e.tarea_id
    WHERE e.id = p_entrega_id AND t.curso_id IN (
      SELECT id FROM cursos WHERE instructor_id = auth.uid()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- tareas policies
DROP POLICY IF EXISTS tareas_select_public ON tareas;
CREATE POLICY tareas_select_public ON tareas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tareas_insert_instructor ON tareas;
CREATE POLICY tareas_insert_instructor ON tareas
  FOR INSERT TO authenticated WITH CHECK (is_instructor_of_course(curso_id));

DROP POLICY IF EXISTS tareas_update_instructor ON tareas;
CREATE POLICY tareas_update_instructor ON tareas
  FOR UPDATE TO authenticated USING (is_instructor_of_course(curso_id));

DROP POLICY IF EXISTS tareas_delete_instructor ON tareas;
CREATE POLICY tareas_delete_instructor ON tareas
  FOR DELETE TO authenticated USING (is_instructor_of_course(curso_id));

-- entregas policies
DROP POLICY IF EXISTS entregas_select_own_or_instructor ON entregas;
CREATE POLICY entregas_select_own_or_instructor ON entregas
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR is_instructor_of_entrega(id)
  );

DROP POLICY IF EXISTS entregas_insert_own ON entregas;
CREATE POLICY entregas_insert_own ON entregas
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS entregas_update_instructor ON entregas;
CREATE POLICY entregas_update_instructor ON entregas
  FOR UPDATE TO authenticated USING (is_instructor_of_entrega(id));

DROP POLICY IF EXISTS entregas_update_own ON entregas;
CREATE POLICY entregas_update_own ON entregas
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- entrega_versiones policies
DROP POLICY IF EXISTS entrega_versiones_select_own_or_instructor ON entrega_versiones;
CREATE POLICY entrega_versiones_select_own_or_instructor ON entrega_versiones
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = entrega_versiones.entrega_id
      AND (e.user_id = auth.uid() OR is_instructor_of_entrega(e.id))
    )
  );

DROP POLICY IF EXISTS entrega_versiones_insert_own ON entrega_versiones;
CREATE POLICY entrega_versiones_insert_own ON entrega_versiones
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = entrega_versiones.entrega_id
      AND e.user_id = auth.uid()
    )
  );

-- rubricas policies
DROP POLICY IF EXISTS rubricas_select_public ON rubricas;
CREATE POLICY rubricas_select_public ON rubricas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubricas_insert_instructor ON rubricas;
CREATE POLICY rubricas_insert_instructor ON rubricas
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubricas_update_instructor ON rubricas;
CREATE POLICY rubricas_update_instructor ON rubricas
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubricas_delete_instructor ON rubricas;
CREATE POLICY rubricas_delete_instructor ON rubricas
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tareas t
      WHERE t.id = rubricas.tarea_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- rubrica_criterios policies
DROP POLICY IF EXISTS rubrica_criterios_select_public ON rubrica_criterios;
CREATE POLICY rubrica_criterios_select_public ON rubrica_criterios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubrica_criterios_insert_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_insert_instructor ON rubrica_criterios
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_criterios_update_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_update_instructor ON rubrica_criterios
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_criterios_delete_instructor ON rubrica_criterios;
CREATE POLICY rubrica_criterios_delete_instructor ON rubrica_criterios
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_criterios.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- rubrica_niveles policies
DROP POLICY IF EXISTS rubrica_niveles_select_public ON rubrica_niveles;
CREATE POLICY rubrica_niveles_select_public ON rubrica_niveles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rubrica_niveles_insert_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_insert_instructor ON rubrica_niveles
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_niveles_update_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_update_instructor ON rubrica_niveles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

DROP POLICY IF EXISTS rubrica_niveles_delete_instructor ON rubrica_niveles;
CREATE POLICY rubrica_niveles_delete_instructor ON rubrica_niveles
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rubricas r
      JOIN tareas t ON t.id = r.tarea_id
      WHERE r.id = rubrica_niveles.rubrica_id AND is_instructor_of_course(t.curso_id)
    )
  );

-- calificaciones policies
DROP POLICY IF EXISTS calificaciones_select_own_or_instructor ON calificaciones;
CREATE POLICY calificaciones_select_own_or_instructor ON calificaciones
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id
      AND (e.user_id = auth.uid() OR is_instructor_of_entrega(e.id))
    )
  );

DROP POLICY IF EXISTS calificaciones_insert_instructor ON calificaciones;
CREATE POLICY calificaciones_insert_instructor ON calificaciones
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id AND is_instructor_of_entrega(e.id)
    )
  );

DROP POLICY IF EXISTS calificaciones_update_instructor ON calificaciones;
CREATE POLICY calificaciones_update_instructor ON calificaciones
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM entregas e
      WHERE e.id = calificaciones.entrega_id AND is_instructor_of_entrega(e.id)
    )
  );

-- 12. Trigger: trg_nueva_entrega (notify instructor when student submits)
CREATE OR REPLACE FUNCTION fn_trg_nueva_entrega()
RETURNS trigger AS $$
DECLARE
  v_curso_id uuid;
  v_instructor_id uuid;
  v_curso_titulo text;
  v_tarea_titulo text;
BEGIN
  SELECT t.curso_id, c.titulo, t.titulo
  INTO v_curso_id, v_curso_titulo, v_tarea_titulo
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.tarea_id;

  SELECT instructor_id INTO v_instructor_id
  FROM cursos WHERE id = v_curso_id;

  INSERT INTO notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  VALUES (
    v_instructor_id,
    'nueva_entrega',
    'Nueva entrega recibida',
    format('El alumno ha entregado la tarea "%s" del curso "%s".', v_tarea_titulo, v_curso_titulo),
    jsonb_build_object(
      'entrega_id', NEW.id,
      'tarea_id', NEW.tarea_id,
      'curso_id', (SELECT curso_id FROM tareas WHERE id = NEW.tarea_id),
      'alumno_id', NEW.user_id
    ),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_nueva_entrega ON entregas;
CREATE TRIGGER trg_nueva_entrega
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'pendiente' AND NEW.estado = 'entregada')
  EXECUTE FUNCTION fn_trg_nueva_entrega();

-- 13. Trigger: trg_entrega_calificada (notify student when graded)
CREATE OR REPLACE FUNCTION fn_trg_entrega_calificada()
RETURNS trigger AS $$
DECLARE
  v_tarea_titulo text;
  v_curso_titulo text;
BEGIN
  SELECT t.titulo, c.titulo
  INTO v_tarea_titulo, v_curso_titulo
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.tarea_id;

  INSERT INTO notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  VALUES (
    NEW.user_id,
    'entrega_calificada',
    'Tu entrega ha sido calificada',
    format('La tarea "%s" del curso "%s" ha sido calificada.', v_tarea_titulo, v_curso_titulo),
    jsonb_build_object(
      'entrega_id', NEW.id,
      'tarea_id', NEW.tarea_id,
      'curso_id', (SELECT curso_id FROM tareas WHERE id = NEW.tarea_id),
      'puntaje_final', NEW.puntaje_final
    ),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_entrega_calificada ON entregas;
CREATE TRIGGER trg_entrega_calificada
  AFTER UPDATE OF estado ON entregas
  FOR EACH ROW
  WHEN (OLD.estado = 'entregada' AND NEW.estado = 'calificada')
  EXECUTE FUNCTION fn_trg_entrega_calificada();


-- ════════════════════════════════════════════════════════════════════
-- 054_sesiones_virtuales_unificadas.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 054: sesiones virtuales unificadas — calendario,
-- RSVP, Zoom / Jitsi dual, notificaciones
-- =========================================================
-- ADAPTA la tabla existente (migración 026) sin perder datos.
--  * Añade campos nuevos: modulo_id, descripcion, fin, plataforma,
--    zoom_meeting_id, zoom_join_url
--  * Conserva columnas legacy: programada_en, instructor_id,
--    jitsi_room_id, estado, grabacion_url, iniciada_en, terminada_en
--  * Nuevas tablas: sesiones_rsvp, zoom_configuracion
--  * Vista unificada: v_calendario_curso
--  * Trigger: notificar_nueva_sesion
-- =========================================================

-- ---------- 1. Tipos enumerados ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_plataforma') THEN
    CREATE TYPE tipo_plataforma AS ENUM ('jitsi', 'zoom');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_rsvp') THEN
    CREATE TYPE estado_rsvp AS ENUM ('confirmado', 'cancelado', 'asistio', 'no_asistio');
  END IF;
END$$;

-- ---------- 2. ALTER sesiones_virtuales existente ----------
ALTER TABLE public.sesiones_virtuales
  ADD COLUMN IF NOT EXISTS modulo_id      uuid REFERENCES public.modulos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descripcion    text,
  ADD COLUMN IF NOT EXISTS fin            timestamptz,
  ADD COLUMN IF NOT EXISTS plataforma     tipo_plataforma DEFAULT 'jitsi',
  ADD COLUMN IF NOT EXISTS zoom_meeting_id  text,
  ADD COLUMN IF NOT EXISTS zoom_join_url    text;

-- Backfill: sesiones existentes sin plataforma explícita son Jitsi
UPDATE public.sesiones_virtuales
  SET plataforma = 'jitsi'
  WHERE plataforma IS NULL;

-- Índice adicional para consultas por curso + inicio
CREATE INDEX IF NOT EXISTS idx_sesiones_curso_inicio
  ON public.sesiones_virtuales(curso_id, programada_en);

-- ---------- 3. Tabla RSVP ----------
CREATE TABLE IF NOT EXISTS public.sesiones_rsvp (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado        estado_rsvp NOT NULL DEFAULT 'confirmado',
  confirmado_en timestamptz DEFAULT now(),
  asistio_en    timestamptz,
  UNIQUE(sesion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_rsvp_sesion ON public.sesiones_rsvp(sesion_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_rsvp_user   ON public.sesiones_rsvp(user_id);

-- ---------- 4. Tabla Zoom Configuración ----------
CREATE TABLE IF NOT EXISTS public.zoom_configuracion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL,
  client_secret text NOT NULL,
  account_id    text NOT NULL,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  creado_en     timestamptz DEFAULT now()
);

-- ---------- 5. Vista v_calendario_curso ----------
CREATE OR REPLACE VIEW public.v_calendario_curso AS
SELECT 'sesion' AS tipo,
       sv.id,
       sv.titulo,
       sv.programada_en AS fecha,
       sv.fin,
       sv.curso_id,
       sv.plataforma::text AS extra
FROM public.sesiones_virtuales sv
UNION ALL
SELECT 'tarea_deadline' AS tipo,
       t.id,
       t.titulo,
       t.fecha_limite AS fecha,
       NULL AS fin,
       t.curso_id,
       NULL AS extra
FROM public.tareas t
WHERE t.fecha_limite IS NOT NULL
-- NOTA: aquí había una rama 'curso_fecha' que leía c.fecha_inicio / c.fecha_fin.
-- `public.cursos` (001_schema.sql) no tiene esas columnas y nunca las ha
-- tenido: un curso en este producto no tiene ventana de vigencia, se toma a
-- ritmo propio. La rama hacía fallar la migración entera. Si en el futuro se
-- añaden fechas al curso, esta rama vuelve en su propia migración.
UNION ALL
SELECT 'anuncio' AS tipo,
       a.id,
       a.titulo,
       a.creado_en AS fecha,
       NULL AS fin,
       a.curso_id,
       NULL AS extra
FROM public.anuncios a;

-- ---------- 6. RLS sesiones_rsvp ----------
ALTER TABLE public.sesiones_rsvp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rsvp: leer" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: leer"
  ON public.sesiones_rsvp FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    -- `cursos` no tiene instructor_id: la relación vive en
    -- public.cursos_instructores (023). is_instructor_de() ya cubre admin.
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      WHERE sv.id = sesiones_rsvp.sesion_id
        AND public.is_instructor_de(sv.curso_id)
    )
  );

DROP POLICY IF EXISTS "rsvp: insertar propio" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: insertar propio"
  ON public.sesiones_rsvp FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rsvp: actualizar propio" ON public.sesiones_rsvp;
CREATE POLICY "rsvp: actualizar propio"
  ON public.sesiones_rsvp FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ---------- 7. RLS zoom_configuracion (solo admin) ----------
ALTER TABLE public.zoom_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zoomcfg: admin leer" ON public.zoom_configuracion;
CREATE POLICY "zoomcfg: admin leer"
  ON public.zoom_configuracion FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true));

DROP POLICY IF EXISTS "zoomcfg: admin actualizar" ON public.zoom_configuracion;
CREATE POLICY "zoomcfg: admin actualizar"
  ON public.zoom_configuracion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true));

-- ---------- 8. Trigger notificación nueva sesión ----------
CREATE OR REPLACE FUNCTION public.notificar_nueva_sesion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notificaciones (user_id, tipo, titulo, contenido, metadata, leida)
  SELECT i.user_id,
         'nueva_sesion',
         'Nueva sesión programada',
         format('Se programó "%s" para el %s',
                NEW.titulo,
                to_char(NEW.programada_en, 'DD/MM/YYYY HH24:MI')),
         jsonb_build_object('sesion_id', NEW.id, 'curso_id', NEW.curso_id),
         false
  FROM public.inscripciones i
  WHERE i.curso_id = NEW.curso_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nueva_sesion ON public.sesiones_virtuales;
CREATE TRIGGER trg_nueva_sesion
  AFTER INSERT ON public.sesiones_virtuales
  FOR EACH ROW EXECUTE FUNCTION public.notificar_nueva_sesion();

-- ---------- 9. Actualizar RLS de sesiones_virtuales (mantener existentes + añadir admin) ----------
-- Las políticas de la migración 026 ya existen; no las tocamos para no romper
-- la app en producción.  El campo 'plataforma' y 'zoom_meeting_id' heredan
-- las mismas reglas de visibilidad porque están en la misma tabla.

-- ---------- 10. Realtime para RSVP ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones_rsvp;


-- ════════════════════════════════════════════════════════════════════
-- 055_grabaciones_transcripciones.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================
-- Migration 055: grabaciones y transcripciones de sesiones
-- =========================================================
--  * sesiones_grabaciones: metadatos de grabaciones Zoom
--    (almacenadas en Supabase Storage, URL referenciada aquí)
--  * sesiones_transcripciones: texto completo + segmentos
--    con índice GIN para full-text search en español
-- =========================================================

-- ---------- 1. Grabaciones ----------
CREATE TABLE IF NOT EXISTS public.sesiones_grabaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  url_grabacion   text NOT NULL,
  duracion_segundos int,
  tamano_mb       numeric(10,2),
  estado          text DEFAULT 'procesando' CHECK (estado IN ('procesando', 'lista', 'error')),
  creado_en       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grabaciones_sesion ON public.sesiones_grabaciones(sesion_id);

-- ---------- 2. Transcripciones ----------
CREATE TABLE IF NOT EXISTS public.sesiones_transcripciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid NOT NULL REFERENCES public.sesiones_virtuales(id) ON DELETE CASCADE,
  grabacion_id    uuid REFERENCES public.sesiones_grabaciones(id) ON DELETE SET NULL,
  texto_completo  text NOT NULL DEFAULT '',
  idioma          text DEFAULT 'es',
  segmentos       jsonb,
  costo_usd       numeric(10,4),
  estado          text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completada', 'error')),
  creado_en       timestamptz DEFAULT now(),
  UNIQUE(sesion_id)
);

CREATE INDEX IF NOT EXISTS idx_transcripciones_sesion ON public.sesiones_transcripciones(sesion_id);
CREATE INDEX IF NOT EXISTS idx_transcripciones_fts ON public.sesiones_transcripciones USING gin(to_tsvector('spanish', texto_completo));

-- ---------- 3. RLS ----------
ALTER TABLE public.sesiones_grabaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_transcripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grabaciones: inscrito leer" ON public.sesiones_grabaciones;
CREATE POLICY "grabaciones: inscrito leer"
  ON public.sesiones_grabaciones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.inscripciones i ON sv.curso_id = i.curso_id
      WHERE sv.id = sesiones_grabaciones.sesion_id AND i.user_id = auth.uid()
    )
    -- `cursos` no tiene instructor_id: la relación instructor-curso vive en
    -- public.cursos_instructores (023). Se usa is_instructor_de(), que además
    -- ya contempla a los administradores.
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      WHERE sv.id = sesiones_grabaciones.sesion_id
        AND public.is_instructor_de(sv.curso_id)
    )
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true)
  );

DROP POLICY IF EXISTS "transcripciones: inscrito leer" ON public.sesiones_transcripciones;
CREATE POLICY "transcripciones: inscrito leer"
  ON public.sesiones_transcripciones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      JOIN public.inscripciones i ON sv.curso_id = i.curso_id
      WHERE sv.id = sesiones_transcripciones.sesion_id AND i.user_id = auth.uid()
    )
    -- `cursos` no tiene instructor_id: la relación instructor-curso vive en
    -- public.cursos_instructores (023). Se usa is_instructor_de(), que además
    -- ya contempla a los administradores.
    OR EXISTS (
      SELECT 1 FROM public.sesiones_virtuales sv
      WHERE sv.id = sesiones_transcripciones.sesion_id
        AND public.is_instructor_de(sv.curso_id)
    )
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.es_admin = true)
  );

-- ---------- 4. Función RPC búsqueda full-text ----------
CREATE OR REPLACE FUNCTION public.buscar_transcripciones(p_query text)
RETURNS TABLE (
  sesion_id uuid,
  titulo text,
  snippet text,
  rank real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.sesion_id,
    sv.titulo,
    ts_headline('spanish', t.texto_completo, plainto_tsquery('spanish', p_query), 'MaxFragments=1,MaxWords=20,MinWords=5') AS snippet,
    ts_rank(to_tsvector('spanish', t.texto_completo), plainto_tsquery('spanish', p_query))::real AS rank
  FROM public.sesiones_transcripciones t
  JOIN public.sesiones_virtuales sv ON t.sesion_id = sv.id
  WHERE to_tsvector('spanish', t.texto_completo) @@ plainto_tsquery('spanish', p_query)
    AND t.estado = 'completada'
  ORDER BY rank DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_transcripciones(text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 056_curso_tutorial.sql
-- ════════════════════════════════════════════════════════════════════

-- ==========================================================
-- Migration 056: curso tutorial de la propia plataforma
-- ==========================================================
-- Siembra el curso "Cómo usar Cursos AMX", disponible por defecto en
-- toda instalación (nueva o existente) al correr scripts/migrate.sh.
--
-- Restricciones de diseño, para que funcione en una instalación limpia:
--   * TODAS las lecciones son tipo 'lectura' con `contenido` (Tiptap JSON).
--     No dependen de video HLS, YouTube ni de archivos en Storage: no hay
--     assets que subir y el curso se puede completar de inmediato.
--   * NO se siembra ninguna lección tipo 'examen': el panel de evaluación
--     está detrás del flag de build VITE_FEATURE_EVALUACIONES, apagado por
--     default (ver src/lib/featureFlags.ts). Una lección 'examen' con el
--     flag apagado sería imposible de completar y bloquearía la constancia.
--     El examen final opcional vive en supabase/seeds/tutorial_examen.sql.
--   * Todos los módulos van con requiere_previo = false: es un tutorial de
--     consulta, se debe poder saltar directo al módulo de instructor o de
--     administración.
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO UPDATE. Reaplicar el archivo
-- refresca el contenido sin duplicar filas ni perder el progreso de nadie
-- (progreso/inscripciones cuelgan de estos mismos IDs).
--
-- Para desinstalarlo: supabase/seeds/tutorial_uninstall.sql
-- ==========================================================

-- ---------- Curso ----------
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado)
values (
  'a0000007-0000-4000-8000-000000000001',
  'tutorial-plataforma',
  'Cómo usar Cursos AMX',
  'Recorrido completo por la plataforma: desde crear tu cuenta y tomar tu primer curso hasta publicar el tuyo como instructor y administrar la instalación.',
  'Fundamental',
  145,
  true
)
on conflict (id) do update set
  slug         = excluded.slug,
  titulo       = excluded.titulo,
  descripcion  = excluded.descripcion,
  nivel        = excluded.nivel,
  duracion_min = excluded.duracion_min,
  publicado    = excluded.publicado;

-- ---------- Módulos ----------
insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000007-0001-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 1,
   'Primeros pasos',
   'Qué es la plataforma, cómo crear tu cuenta y cómo inscribirte a tu primer curso.', false),
  ('b0000007-0002-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 2,
   'El reproductor de lecciones',
   'La pantalla donde vas a pasar la mayor parte del tiempo: diseños, tipos de lección y registro de progreso.', false),
  ('b0000007-0003-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 3,
   'Evaluaciones y constancias',
   'Cómo se califican los exámenes, cómo se emite tu constancia y cómo cualquiera puede verificarla.', false),
  ('b0000007-0004-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 4,
   'Participación: foros, chat y entregas',
   'Los módulos sociales del curso y la entrega de tareas con retroalimentación por rúbrica.', false),
  ('b0000007-0005-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 5,
   'Modo instructor',
   'Construir un curso: módulos, lecciones, video HLS y evaluaciones.', false),
  ('b0000007-0006-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 6,
   'Administración de la plataforma',
   'Panel de administración, usuarios, cohortes, sesiones en vivo y reportes.', false),
  ('b0000007-0007-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 7,
   'Configuración e identidad',
   'Feature flags, personalización de marca y plantilla de constancias.', false),
  ('b0000007-0008-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 8,
   'Cierre',
   'Accesibilidad, idioma, modo offline y qué hacer después de este curso.', false)
on conflict (id) do update set
  curso_id        = excluded.curso_id,
  orden           = excluded.orden,
  titulo          = excluded.titulo,
  descripcion     = excluded.descripcion,
  requiere_previo = excluded.requiere_previo;

-- ==========================================================
-- Módulo 1 — Primeros pasos
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0101-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 1,
 'Bienvenida: qué es Cursos AMX', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Cursos AMX es una plataforma de aprendizaje en línea (LMS) de código abierto. Sirve para publicar cursos, darles seguimiento y emitir constancias verificables. Este curso es, a la vez, el manual de uso y una demostración: cada cosa que se explica aquí la estás usando en este momento."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué vas a encontrar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se organiza en tres niveles de uso, y este curso los recorre en ese orden:"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Alumno"},{"type":"text","text":" (módulos 1 a 4): inscribirte, ver lecciones, participar en foros, presentar evaluaciones y obtener tu constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Instructor"},{"type":"text","text":" (módulo 5): construir un curso, subir video y armar evaluaciones."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Administrador"},{"type":"text","text":" (módulos 6 y 7): gestionar usuarios, cohortes, reportes, módulos activables e identidad gráfica."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo está hecha"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El frontend es una aplicación Vue 3 con Vite. El backend es Supabase autoalojado: Postgres para los datos, Auth para las cuentas, Storage para archivos, Edge Functions para la lógica de servidor y Realtime para el chat y las notificaciones. El video se transcodifica a HLS con un worker de ffmpeg aparte."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Nada de eso hace falta entenderlo para usar la plataforma. Lo mencionamos porque explica por qué algunas funciones se pueden encender y apagar por instalación, algo que veremos en el módulo 7."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cómo avanzar en este curso: "},{"type":"text","text":"al terminar de leer cada lección, presiona el botón «Marcar completada» al final del texto. Cuando las 26 lecciones estén marcadas, la plataforma emite tu constancia automáticamente."}]}]}
]}
$j$::jsonb),

('c0000007-0102-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 2,
 'Tu cuenta y tu perfil', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El registro es un asistente de cuatro pasos. Se puede abandonar y retomar: nada se guarda hasta el último paso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los cuatro pasos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Datos personales."},{"type":"text","text":" Nombres, apellido paterno y apellido materno. Se guardan por separado porque la constancia se imprime con el nombre completo tal como lo escribas aquí."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Datos institucionales."},{"type":"text","text":" Dependencia o área y cargo. Es lo que después permite a un administrador sacar reportes por área."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cuenta."},{"type":"text","text":" Correo, teléfono y contraseña. El correo es tu identificador único y no se puede repetir."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Aviso de privacidad."},{"type":"text","text":" Aceptación explícita. Sin ella no se crea la cuenta."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Corregir tus datos después"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Todo lo anterior es editable desde «Mi perfil», salvo el correo. Conviene revisar la ortografía de tu nombre antes de terminar tu primer curso: la constancia toma el nombre que exista al momento de emitirse."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Roles"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Toda cuenta nace como alumno. Los roles de instructor y de administrador los asigna un administrador desde el panel; no son algo que se pida al registrarse. Si eres el operador de una instalación nueva, el primer administrador se marca directamente en la base de datos."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Si tu institución usa inicio de sesión único (SSO/SAML), estos pasos los reemplaza tu proveedor de identidad y el perfil se llena solo."}]}]}
]}
$j$::jsonb),

('c0000007-0103-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 3,
 'Catálogo, niveles e inscripción', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El catálogo muestra los cursos publicados. Un curso sin publicar solo lo ven su instructor y los administradores, lo cual permite prepararlo con calma antes de abrirlo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo leer una tarjeta de curso"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Nivel."},{"type":"text","text":" Fundamental, Intermedio o Avanzado. Es una etiqueta de dificultad, no un requisito: no bloquea la inscripción."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Duración."},{"type":"text","text":" La suma de la duración de todas las lecciones. En los cursos con video se calcula sola a partir del archivo transcodificado."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Módulos y lecciones."},{"type":"text","text":" El módulo agrupa lecciones; la lección es la unidad mínima de progreso."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Inscribirte"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al entrar al detalle del curso verás el temario completo y el botón de inscripción. La inscripción es el permiso: sin ella no puedes reproducir el video, abrir los documentos ni presentar las evaluaciones, aunque veas los títulos en el temario."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Esto no es solo una regla de la interfaz. Las funciones del servidor que entregan un video o un documento comprueban la inscripción antes de responder, así que el contenido no se puede obtener por otra vía."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Módulos con prerrequisito"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un módulo puede exigir que termines el anterior antes de abrirse; aparece con candado hasta que lo completas. Este curso tutorial tiene esa opción desactivada a propósito, para que puedas saltar directo al módulo que te interese."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 2 — El reproductor de lecciones
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0201-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 1,
 'Anatomía del reproductor', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Esta pantalla, la que estás viendo, es el reproductor. Es donde se consume todo el contenido, sea video, texto, documento o examen. Vale la pena reconocer sus cuatro zonas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"1. La barra superior"}]},
 {"type":"paragraph","content":[{"type":"text","text":"A la izquierda, «Salir del curso» te regresa al detalle del curso sin perder nada de lo avanzado, junto con el módulo y el número de la lección actual. A la derecha está el selector de diseño, que veremos en la siguiente lección."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"2. La superficie de contenido"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El área grande. Cambia de forma según el tipo de lección: un video con controles, un visor de PDF, un texto como este o un examen. La plataforma elige la superficie automáticamente; no hay nada que configurar del lado del alumno."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"3. El navegador de lecciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La lista lateral con todas las lecciones del curso agrupadas por módulo. Muestra cuáles ya completaste y te permite saltar a cualquiera. Arriba tienes el contador de avance, por ejemplo «7/26», y el porcentaje del curso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"4. El panel de conversación"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Comentarios y chat en vivo de la lección. Es uno de los módulos activables: si tu instalación lo tiene apagado, el panel simplemente no aparece y el reproductor usa todo el ancho."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"En pantallas angostas las cuatro zonas se apilan en vertical y el navegador de lecciones se vuelve desplegable. El reproductor está pensado para funcionar igual en teléfono."}]}]}
]}
$j$::jsonb),

('c0000007-0202-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 2,
 'Los tres diseños: Split, Chat inferior y Enfoque', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El selector de la barra superior cambia cómo se reparten el espacio el contenido y la conversación. La elección se recuerda entre lecciones y entre sesiones, así que la configuras una vez."}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Split."},{"type":"text","text":" Contenido a la izquierda y conversación a la derecha, lado a lado. Es el diseño por defecto y el que mejor funciona en pantallas anchas cuando el curso tiene discusión activa."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chat inferior."},{"type":"text","text":" El contenido ocupa el ancho completo y la conversación baja debajo. Útil cuando el video trae texto pequeño o diagramas, o cuando lees en una pantalla vertical."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Enfoque."},{"type":"text","text":" Solo el contenido: se ocultan la conversación y el navegador de lecciones. Para estudiar sin distracciones."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Otros ajustes de lectura"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El tema Claro / Oscuro / Sistema se cambia desde el menú de tu cuenta y aplica a toda la plataforma, reproductor incluido. La opción «Sistema» sigue la preferencia de tu computadora o teléfono y cambia sola al anochecer si así lo tienes configurado."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El idioma de la interfaz también se elige desde ahí. Ojo con la diferencia: el idioma cambia los textos de la plataforma (botones, menús, avisos), no el contenido de los cursos, que se queda en el idioma en que lo escribió su autor."}]}
]}
$j$::jsonb),

('c0000007-0203-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 3,
 'Los cinco tipos de lección', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una lección puede tomar cinco formas. Reconocerlas ayuda a saber qué esperar y, sobre todo, cómo se marca cada una como completada."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Video HLS"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El formato principal. El archivo original se transcodifica a varias calidades y el reproductor elige la que aguante tu conexión, subiendo o bajando sobre la marcha. Se completa al llegar al final del video."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Video de YouTube"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Alternativa para cursos que reutilizan material ya publicado. Se incrusta el reproductor de YouTube y también se completa al terminar. No consume almacenamiento de tu instalación."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Documento"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un PDF o una imagen, mostrados en un visor dentro de la plataforma. El archivo no es público: el servidor comprueba tu inscripción antes de entregarlo. Se completa cuando llegas al final del documento."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Texto"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Contenido escrito directamente en la plataforma, con títulos, listas, citas, enlaces e imágenes. Es lo que estás leyendo ahora. Se completa con el botón «Marcar completada» que aparece al final."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Evaluación"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un examen con preguntas. Se completa al aprobarlo, no al abrirlo. Es el único tipo que puede rechazarte y pedirte otro intento; lo vemos a fondo en el módulo 3."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Un tipo más, «recurso», existe en la base de datos para material de apoyo descargable. Su comportamiento es el de una lección sin reproductor."}]}]}
]}
$j$::jsonb),

('c0000007-0204-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 4,
 'Cómo se registra tu progreso', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El progreso se guarda en el servidor, por lección y por usuario. No vive en el navegador: puedes empezar una lección en la computadora de la oficina y seguirla en el teléfono sin perder nada."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dos cosas distintas se guardan"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Si la lección está completada."},{"type":"text","text":" Un sí o un no. Es lo que cuenta para el porcentaje del curso y para la constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Dónde te quedaste."},{"type":"text","text":" En los videos se guarda el segundo exacto cada pocos segundos, para que al volver retomes en ese punto. Este marcador nunca retrocede: si adelantas y luego regresas, se conserva el avance máximo."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tiempo activo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Aparte del progreso, la plataforma acumula tu tiempo activo por curso. Solo cuenta con la pestaña visible y con actividad real, y el servidor aplica un tope para que dejar la ventana abierta toda la noche no infle la cifra. Es el número que ves en tu perfil y el que aparece en los reportes del instructor."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Volver a ver una lección"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una lección completada no se cierra. Puedes regresar cuantas veces quieras después de terminar el curso; el progreso ya registrado no se pierde ni se recalcula."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 3 — Evaluaciones y constancias
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0301-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 1,
 'Cómo funcionan las evaluaciones', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una evaluación es una lección con preguntas. La plataforma la califica sola, en el servidor, en el momento en que envías tus respuestas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los seis tipos de pregunta"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Opción única."},{"type":"text","text":" Varias opciones, una sola correcta."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Opción múltiple."},{"type":"text","text":" Varias correctas. Para acertar hay que marcarlas todas y ninguna de más: no hay crédito parcial."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Verdadero o falso."},{"type":"text","text":" Caso particular de opción única."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Emparejamiento."},{"type":"text","text":" Relacionar dos columnas. Todos los pares deben quedar bien."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Rellenar huecos."},{"type":"text","text":" Escribir la palabra que falta. La comparación ignora mayúsculas y espacios sobrantes."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Ensayo."},{"type":"text","text":" Respuesta abierta. No la califica la máquina: queda pendiente de revisión del instructor."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puntaje mínimo e intentos"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada evaluación define su puntaje mínimo para aprobar y su número máximo de intentos. Los valores de fábrica son 70 sobre 100 y tres intentos. Antes de empezar verás cuántos intentos te quedan, y cada intento se registra con su calificación aunque lo repruebes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al aprobar, la lección se marca completada en el mismo movimiento. Si la evaluación incluye preguntas de ensayo, la lección queda en espera hasta que el instructor revise, porque su calificación todavía no es definitiva."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Por qué no se pueden filtrar las respuestas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El navegador nunca recibe cuál opción es la correcta. Al abrir el examen, el servidor manda las preguntas y las opciones sin esa marca; al enviar, compara del lado del servidor y devuelve solo el resultado. Ni inspeccionando la página ni interceptando la respuesta se puede ver el examen resuelto."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Las evaluaciones son un módulo activable. Si en tu instalación está apagado, los cursos que las usen mostrarán la lección pero no el panel de preguntas."}]}]}
]}
$j$::jsonb),

('c0000007-0302-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 2,
 'Tu constancia verificable', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La constancia se emite sola. En cuanto marcas la última lección pendiente de un curso, el servidor comprueba que estén todas y genera el documento. No hay que solicitarla ni esperar aprobación de nadie."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué lleva"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Tu nombre completo"},{"type":"text","text":", tal como está en tu perfil al momento de la emisión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El nombre del curso"},{"type":"text","text":" y la fecha de emisión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Un folio único"},{"type":"text","text":", con el año y un identificador del curso."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El nombre y cargo del titular"},{"type":"text","text":" que firma, configurables por el administrador."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Un código QR"},{"type":"text","text":" que apunta a la página pública de verificación."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Verificación pública"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Quien reciba tu constancia puede escanear el QR o teclear el folio en la página de verificación. No necesita cuenta ni iniciar sesión. La página responde con el nombre de la persona, el curso y la fecha; si el folio no existe, lo dice."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La verificación solo expone esos datos públicos, nunca el correo ni el resto del expediente de quien la obtuvo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Descargarla"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde «Mis constancias» puedes verla en pantalla y descargarla en PDF, listo para imprimir o adjuntar. El PDF se arma en tu navegador a partir de los mismos datos, así que la copia descargada y la que se verifica en línea siempre coinciden."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Una constancia por curso y por persona. Volver a entrar a un curso terminado no genera otra ni cambia el folio."}]}]}
]}
$j$::jsonb),

('c0000007-0303-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 3,
 'Tu perfil: progreso y logros', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"«Mi perfil» reúne todo lo que la plataforma sabe de tu avance. Es el lugar al que volver cuando quieres retomar algo a medias o necesitas una constancia."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué encuentras ahí"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus cursos en curso, con el porcentaje de cada uno y un acceso directo a la lección donde te quedaste."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus cursos terminados y sus constancias, con descarga en PDF."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tu tiempo activo acumulado y un mapa de calor de los días en que estudiaste."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus datos personales e institucionales, editables."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puntos, niveles e insignias"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si tu instalación tiene encendida la gamificación, el perfil suma una capa más: puntos automáticos por completar lecciones, aprobar evaluaciones y participar en foros; niveles que van de Novato a Leyenda; e insignias que se desbloquean con criterios que define el administrador."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada curso puede además mostrar su tabla de clasificación. Es opcional y no afecta la constancia: los puntos son un incentivo, no un requisito académico."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 4 — Participación: foros, chat y entregas
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0401-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 1,
 'Foros del curso', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El foro es la conversación asíncrona del curso: preguntas que no se resuelven en un comentario suelto y que conviene dejar escritas para quienes vengan después."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo se organiza"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un curso puede tener varios foros («Dudas generales», «Proyecto final», «Avisos»). Dentro de cada foro se abren hilos, y cada hilo admite respuestas. El anidamiento llega hasta dos niveles: una respuesta a un hilo y una respuesta a esa respuesta. Más allá, la conversación se aplana a propósito, para que un hilo largo siga siendo legible."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Quién puede participar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los inscritos al curso, sus instructores y los administradores. Alguien que solo esté viendo el catálogo no ve el foro."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor puede fijar hilos importantes para que queden arriba y cerrarlos cuando el tema se agotó: un hilo cerrado se sigue leyendo pero ya no admite respuestas nuevas. Las acciones de moderación quedan registradas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Foros de cohorte"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si el curso se imparte por generaciones, cada cohorte puede tener su propio foro privado, separado del general. Sirve para que la generación de marzo no vea las discusiones de la de enero."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Los foros son un módulo activable. Con el módulo apagado, la pestaña no aparece en el curso."}]}]}
]}
$j$::jsonb),

('c0000007-0402-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 2,
 'Chat en vivo de la lección', 'lectura', 240, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El panel lateral del reproductor es un chat por lección, no por curso. Cada lección tiene su propio hilo de comentarios, así que la duda queda pegada al minuto exacto del material que la provocó."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"En vivo de verdad"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los mensajes aparecen sin recargar la página. Si dos personas ven la misma lección al mismo tiempo, se ven escribir. Si nadie más está conectado, el chat funciona igual como un tablón: tu mensaje queda ahí y el instructor lo contesta después."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Chat y foro no son lo mismo"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chat:"},{"type":"text","text":" corto, atado a una lección, ideal para «no entendí este ejemplo»."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Foro:"},{"type":"text","text":" largo, del curso completo, ideal para una discusión que vale la pena conservar y encontrar después."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Si el diseño «Enfoque» te oculta el panel, no perdiste nada: los mensajes siguen llegando y los ves al volver a Split o a Chat inferior."}]}
]}
$j$::jsonb),

('c0000007-0403-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 3,
 'Entregas de tareas y rúbricas', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una lección puede pedir que subas un archivo: un ensayo, una hoja de cálculo, una fotografía de un ejercicio. Cuando es así, aparece el área de entrega debajo del contenido."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué puedes subir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor define qué formatos acepta y cuál es el tamaño máximo. Las dos restricciones se comprueban en el servidor, no solo en el navegador, así que un archivo fuera de lo permitido se rechaza siempre y con un mensaje claro."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puedes reemplazarla"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Volver a subir no borra lo anterior: crea una versión nueva y la anterior queda archivada. La vigente es siempre la última. Así, si te equivocaste de archivo, se corrige sin perder el historial ni el registro de a qué hora entregaste la primera vez."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Tu entrega es privada. La ven solo tú, los instructores del curso y los administradores; nunca el resto del grupo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Revisión y rúbricas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor revisa y devuelve un estado con comentarios. Cuando la tarea tiene rúbrica, la retroalimentación llega desglosada: cada criterio con el nivel de desempeño que alcanzaste y el motivo. Es más trabajo para quien califica, pero convierte una nota en algo accionable."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una rúbrica es reutilizable: se define una vez, con sus criterios y niveles, y se asigna a las tareas o a las preguntas de ensayo que la necesiten."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 5 — Modo instructor
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0501-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 1,
 'El rol de instructor', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"A partir de aquí el curso cambia de lado del escritorio. Si solo vas a tomar cursos, puedes saltar directo al módulo 8; nada de lo que sigue te hace falta."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Instructor no es administrador"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un administrador puede todo en toda la plataforma. Un instructor puede todo, pero solo en los cursos que tiene asignados. Es una distinción deliberada: permite que cada área lleve su propio curso sin darle acceso al resto de la instalación."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La asignación se hace curso por curso desde el panel de administración. Un curso puede tener varios instructores y una persona puede dar varios cursos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué te habilita"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Crear y editar los módulos, lecciones y evaluaciones de tus cursos."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ver la lista de alumnos inscritos y su avance."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Revisar y calificar entregas."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Moderar el foro: fijar, cerrar y borrar."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Programar sesiones en vivo y consultar los reportes de tus cursos."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Este límite no es solo de la interfaz. La base de datos comprueba en cada operación que seas instructor de ese curso, así que no hay forma de tocar un curso ajeno por otra ruta."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Publicado y sin publicar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un curso nuevo nace sin publicar. Puedes armarlo, verlo tal como lo verá el alumno y corregirlo cuantas veces quieras sin que aparezca en el catálogo. Publicarlo es un interruptor, y se puede volver a apagar."}]}
]}
$j$::jsonb),

('c0000007-0502-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 2,
 'Construir un curso', 'lectura', 480, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Un curso se arma en tres niveles: el curso, sus módulos y las lecciones de cada módulo. El editor sigue exactamente esa estructura."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"1. Los datos del curso"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Título, descripción, nivel e imagen de portada. La descripción es lo que decide si alguien se inscribe: conviene decir qué va a saber hacer al terminar, no qué temas se tocan."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La dirección web del curso se deriva del título. Cámbiala antes de publicar si tienes que cambiarla: después, cualquier enlace que ya se haya compartido dejaría de servir."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"2. Los módulos"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada módulo lleva título, descripción y una decisión importante: si exige haber terminado el anterior. Actívalo cuando el orden realmente importe. Un curso de consulta, como este tutorial, se aprovecha mejor sin candados."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"3. Las lecciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Por cada lección eliges su fuente: video subido, video de YouTube, documento, texto escrito aquí mismo o evaluación. El editor de texto tiene títulos, listas, citas, negritas, enlaces e imágenes; guarda solo, cada pocos segundos, mientras escribes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El orden se cambia arrastrando, y una lección se puede mover de un módulo a otro dentro del mismo curso. El reacomodo se guarda de una sola vez: o entra completo o no entra, nunca queda a medias."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dos editores"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma trae un editor clásico por formularios, siempre disponible, y un constructor visual con arrastrar y soltar que se enciende con el módulo activable «visual_builder», apagado de fábrica. Los dos escriben lo mismo: puedes empezar en uno y seguir en el otro."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Consejo: arma primero el esqueleto completo, con todas las lecciones vacías y bien ordenadas. Llenarlas después es mucho más rápido que reordenar contenido ya escrito."}]}]}
]}
$j$::jsonb),

('c0000007-0503-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 3,
 'Subir video: de tu archivo a HLS', 'lectura', 420, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El video es el único contenido que no se guarda tal cual lo subes. Pasa por un proceso, y entender ese proceso evita sustos la primera vez."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"La subida se puede interrumpir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El archivo se manda por partes. Si se cae la conexión o cierras la pestaña a medio camino, al volver retoma donde iba en vez de empezar de cero. Para un archivo de varios gigabytes, esa es la diferencia entre poder subirlo y no."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los cinco estados"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Subiendo."},{"type":"text","text":" El archivo va en camino."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"En espera."},{"type":"text","text":" Llegó completo y está formado para procesarse."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Procesando."},{"type":"text","text":" Se está transcodificando a varias calidades y generando la miniatura."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Listo."},{"type":"text","text":" Reproducible. La duración de la lección se rellena sola con la del archivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Falló."},{"type":"text","text":" Con el motivo del error. Suele ser un archivo corrupto o un códec no soportado."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los estados se actualizan solos en pantalla: no hay que recargar para saber si ya terminó. Puedes cerrar el editor y volver después; el procesamiento ocurre en el servidor, no en tu navegador."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cuánto tarda"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Depende del servidor y de la duración del video, y varios videos en cola se procesan uno tras otro. Si tu instalación tiene varios procesadores en paralelo, se reparten el trabajo sin pisarse ni tomar dos veces el mismo archivo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Por qué HLS"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un mismo video queda guardado en varias calidades. El reproductor mide la conexión de cada alumno y elige la que aguanta, cambiando sobre la marcha. Quien entra desde datos móviles ve el curso, en menor calidad, en lugar de quedarse mirando una rueda girar."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Si tu instalación no tiene el procesador de video corriendo, usa lecciones de YouTube o de texto. El resto de la plataforma funciona igual."}]}]}
]}
$j$::jsonb),

('c0000007-0504-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 4,
 'Armar una evaluación', 'lectura', 420, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una evaluación se crea como cualquier otra lección, eligiendo el tipo «evaluación». Lo que cambia es lo que hay debajo: la configuración del examen y sus preguntas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los dos ajustes que importan"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Puntaje mínimo."},{"type":"text","text":" De 0 a 100, por defecto 70. Con pocas preguntas, cuida la aritmética: en un examen de cinco preguntas, exigir 70 es en realidad exigir cuatro de cinco."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Intentos máximos."},{"type":"text","text":" Por defecto tres. Cuando se acaban, el alumno no puede volver a presentar y necesita que un administrador intervenga."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Escribir las preguntas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada pregunta tiene su enunciado, su tipo y su respuesta correcta. En opción única y en verdadero o falso se marca una opción; en opción múltiple, todas las que correspondan, recordando que el alumno debe acertarlas todas y ninguna de más."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los tipos de emparejamiento, rellenar huecos y ensayo forman parte del módulo activable de evaluaciones avanzadas. Con ese módulo apagado, dispones de los tres tipos básicos, que cubren la mayoría de los casos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Preguntas de ensayo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Úsalas sabiendo lo que implican: la máquina no las califica, así que el examen queda pendiente de tu revisión y la lección no se completa hasta que revises. Si el curso es masivo, considéralo antes de incluirlas. Una rúbrica hace esa revisión mucho más rápida y más pareja entre alumnos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Generación asistida"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si tu instalación tiene encendido el módulo de inteligencia artificial, puedes pedir un borrador de preguntas a partir del contenido de una lección. Es un borrador: llega a tu editor para que lo revises y corrijas antes de guardarlo, nunca se publica solo."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Prueba siempre tu examen desde una cuenta de alumno antes de publicar. Es la única forma de ver lo que el alumno ve."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 6 — Administración de la plataforma
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0601-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 1,
 'El panel de administración', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El panel de administración es la consola de la instalación completa. Solo lo ven las cuentas marcadas como administradoras."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"El tablero"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al entrar verás el pulso de la plataforma: cursos publicados, personas registradas, inscripciones, constancias emitidas y las altas recientes. Sirve para responder de un vistazo «cómo vamos» sin abrir un reporte."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Las secciones"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cursos."},{"type":"text","text":" Crear, editar, publicar y asignar instructores."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Usuarios."},{"type":"text","text":" Buscar personas, cambiar roles y dar de alta en lote."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cohortes y sesiones."},{"type":"text","text":" Generaciones de un curso y clases en vivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Reportes."},{"type":"text","text":" Avance, analítica de aprendizaje y consumo de video."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Configuración."},{"type":"text","text":" Constancias, notificaciones, insignias e integraciones."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"El menú se adapta a lo que está encendido: las secciones de los módulos apagados no aparecen. Si buscas algo que no está en el menú, es probable que su módulo esté apagado y no que no exista."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"El primer administrador de una instalación nueva se marca directamente en la base de datos. A partir de ahí, ya puede nombrar a los demás desde el panel."}]}]}
]}
$j$::jsonb),

('c0000007-0602-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 2,
 'Usuarios, áreas e importación masiva', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La gestión de personas tiene dos caminos: uno a uno para casos puntuales, y por lote cuando hay que dar de alta a un área completa."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Uno a uno"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde la lista de usuarios puedes buscar por nombre, correo o área, revisar el avance de una persona y cambiar su rol: alumno, instructor o administrador. Los cambios de rol surten efecto la próxima vez que la persona cargue la plataforma."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dependencias y áreas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El catálogo de dependencias es lo que hace útiles los reportes: sin él, no se puede responder «cuánto avanzó Recursos Humanos». Conviene definirlo antes de abrir el registro, porque reasignar áreas a cientos de personas ya registradas es tedioso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Importación por lote"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Con el módulo de importación masiva encendido puedes cargar un archivo de valores separados por comas con las personas a invitar. La plataforma lo valida antes de ejecutar nada y te muestra fila por fila qué está bien y qué no: correos mal escritos, duplicados, áreas inexistentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Solo después de esa revisión se envían las invitaciones. Cada persona recibe un correo para fijar su contraseña; nunca se crean cuentas con contraseñas asignadas por el administrador."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Prueba siempre con un archivo de tres o cuatro filas antes de cargar el de trescientas. La validación previa es buena, pero un ensayo pequeño es mejor."}]}]}
]}
$j$::jsonb),

('c0000007-0603-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 3,
 'Cohortes y sesiones en vivo', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Hasta aquí el curso ha sido a ritmo libre: cada quien entra cuando puede. Las cohortes y las sesiones en vivo son las piezas para dar un curso con calendario y con grupo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cohortes"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una cohorte es una generación de un mismo curso: la de enero y la de marzo, con su fecha de inicio, su fecha de cierre y su cupo máximo. Al llenarse el cupo, la plataforma deja de aceptar inscripciones a esa cohorte."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada cohorte puede tener su foro privado, de modo que las discusiones de una generación no se mezclen con las de otra. Los reportes también se pueden filtrar por cohorte, que suele ser la comparación que de verdad interesa."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Sesiones en vivo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una sesión es una clase con fecha y hora. Aparece en el calendario del curso y en el calendario personal de cada alumno, con recordatorio previo. La plataforma registra la asistencia de quienes entran."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La videollamada puede correr en una instancia propia de la plataforma, sin cuentas adicionales, o integrarse con Zoom si tu institución ya lo tiene contratado. Las dos opciones conviven: se elige por sesión."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Grabaciones y transcripción"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una sesión grabada queda archivada en el curso y se puede buscar después. Con el módulo de transcripción encendido, además se genera el texto de lo dicho, lo que permite buscar por palabra dentro de una clase de dos horas y llegar al minuto exacto. Es también lo que hace accesible el material a quien no puede escucharlo."}]}
]}
$j$::jsonb),

('c0000007-0604-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 4,
 'Reportes y analítica', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Los reportes existen para responder tres preguntas distintas. Conviene saber cuál estás haciendo antes de abrir una pantalla llena de gráficas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Quién cumplió?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Avance por persona, por curso, por área y por cohorte, con las constancias emitidas. Es el reporte de cumplimiento, el que se manda hacia arriba, y se puede exportar para trabajarlo en una hoja de cálculo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Dónde se atora la gente?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El embudo del curso muestra cuántos llegan a cada lección y dónde se caen. Una lección donde abandona la mitad del grupo no es un problema de los alumnos: es una lección que hay que rehacer."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La analítica de video afina esa lectura: qué partes se ven completas, cuáles se adelantan y en qué segundo exacto se cierra la ventana. Los resultados de las evaluaciones, pregunta por pregunta, señalan además qué tema no quedó explicado."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Cuánto cuesta?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El consumo de almacenamiento, de procesamiento de video y, si usas el módulo de inteligencia artificial, el gasto de sus servicios. Sirve para dimensionar el servidor y para no llevarse sorpresas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Reportes propios y notificaciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si ninguno de los reportes de fábrica dice lo que necesitas, puedes armar uno eligiendo columnas y filtros, y guardarlo para repetirlo cada mes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Con el módulo de notificaciones encendido, algunas de estas señales dejan de requerir que alguien entre a mirar: la plataforma avisa por sí sola cuando un curso está por vencer, cuando hay entregas sin revisar o cuando un grupo lleva semanas sin actividad."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 7 — Configuración e identidad
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0701-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 1,
 'Módulos activables: enciende solo lo que uses', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Esta plataforma trae muchas más funciones de las que una institución necesita al mismo tiempo. Por eso casi todo se puede apagar, y casi todo viene apagado de fábrica."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Empieza en pequeño"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La recomendación es arrancar con lo mínimo —cursos, video, constancias— y encender un módulo cuando alguien lo pida. Una plataforma con foros vacíos, chats sin nadie y cinco tableros que nadie abre se siente abandonada aunque funcione perfecto."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hay dos clases de interruptor"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"De instalación."},{"type":"text","text":" Se definen en la configuración del entorno y se aplican al compilar la aplicación. Cambiarlos exige volver a publicar el sitio. Aquí viven los módulos grandes: foros, chat, entregas, aulas, evaluaciones, gamificación, analítica, inteligencia artificial, notificaciones y modo sin conexión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"De operación."},{"type":"text","text":" Viven en una tabla de la base de datos y se cambian en caliente, sin volver a publicar nada. Aquí están cosas como el constructor visual, las evaluaciones avanzadas, las rúbricas, las cohortes y la importación masiva."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los interruptores de operación se leen con una caché corta, así que un cambio tarda unos minutos en verse en las sesiones abiertas. Los de instalación requieren compilar y desplegar de nuevo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Apagar no borra"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al apagar un módulo desaparece su interfaz y sus rutas dejan de existir, pero sus datos quedan intactos en la base. Si lo vuelves a encender, los foros, las entregas y los intentos de evaluación siguen ahí, tal como estaban. Esto hace que probar un módulo sea barato y reversible."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Este curso tutorial está escrito para funcionar con todos los módulos apagados. Por eso no incluye examen: sus lecciones son de texto y se marcan completadas a mano."}]}]}
]}
$j$::jsonb),

('c0000007-0702-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 2,
 'Identidad gráfica de tu institución', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma está pensada para llevar la marca de quien la instala, no la de quien la programó. La personalización es una capa aparte: se cambia sin tocar el código de la aplicación."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tres cosas y ya"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El archivo de configuración del tema."},{"type":"text","text":" Nombre de la institución, textos de la portada, paleta de colores, tipografías y datos de contacto del pie de página."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Los archivos de imagen."},{"type":"text","text":" Logotipo, ícono del navegador, imágenes de la portada y de las constancias."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Las secciones de la portada."},{"type":"text","text":" Opcional. Si la portada de fábrica no te sirve, se pueden sustituir sus bloques por otros propios."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los colores se definen una sola vez y de ahí salen los dos temas, claro y oscuro, y todos los componentes. Cambiar el color principal repinta la plataforma completa, constancias incluidas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Actualizar sin perder tu marca"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Como la personalización vive fuera del código de la aplicación, actualizar a una versión nueva no te la borra ni te obliga a rehacerla. Es la razón de que esté separada, y conviene resistir la tentación de meter cambios de marca directamente en los componentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El detalle de cada opción está en la documentación de personalización del repositorio."}]}
]}
$j$::jsonb),

('c0000007-0703-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 3,
 'Configurar las constancias', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La constancia es lo único de la plataforma que sale del sistema y llega a manos de terceros. Vale la pena dejarla lista antes de que se emita la primera."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Quién firma"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde la configuración de constancias se define el nombre y el cargo del titular que aparece firmando, y el lugar de expedición. Viene con valores de ejemplo que hay que cambiar: una constancia firmada por «Nombre Completo Del Titular» no es un detalle menor."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cuándo cambiarlo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El nombre del firmante se toma al momento de mostrar la constancia, no al emitirla. Un cambio de titular se refleja también en las constancias ya emitidas. Tenlo presente si tu institución necesita que un documento conserve el firmante que estaba en funciones ese día."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Antes de abrir el primer curso"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pon el firmante, el cargo y el lugar reales."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Sube el logotipo institucional definitivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Termina un curso corto con una cuenta de prueba y revisa la constancia impresa."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Escanea el código de verificación desde un teléfono ajeno a la red interna, para confirmar que la dirección pública es la correcta."}]}]}
 ]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Ese último punto es el que más se olvida: si la plataforma está publicada con una dirección interna, el código de verificación no abrirá desde fuera."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;


-- ==========================================================
-- Módulo 8 — Cierre
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0801-4000-8000-000000000001', 'b0000007-0008-4000-8000-000000000001', 1,
 'Idioma, accesibilidad y modo sin conexión', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Tres funciones transversales que no pertenecen a ningún módulo en particular pero cambian bastante quién puede usar la plataforma."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Idioma"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La interfaz viene en español y en inglés, y cada persona elige el suyo desde el menú de su cuenta. Agregar otro idioma es cuestión de traducir un archivo de textos, sin tocar los componentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Insistimos en la distinción, porque genera confusión: el idioma cambia la plataforma, no los cursos. Un curso escrito en español se lee en español aunque la interfaz esté en inglés. Para ofrecer un curso en dos idiomas, se publican dos cursos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Accesibilidad"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se recorre completa con el teclado y está construida para que un lector de pantalla anuncie los controles. El tema oscuro y el respeto al tamaño de letra del sistema ayudan a quien tiene baja visión."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Buena parte de la accesibilidad, sin embargo, depende de quien escribe el curso: subtitular los videos, describir las imágenes y no dejar información importante únicamente en un color o en un audio. La herramienta acompaña, no sustituye."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Modo sin conexión"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se puede instalar como aplicación desde el navegador, con su ícono propio. Con el módulo sin conexión encendido, además guarda las lecciones ya vistas para consultarlas sin señal, y tu progreso se sincroniza solo al recuperar la conexión."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Importa donde la conectividad es intermitente: quien va en el transporte público puede seguir leyendo, y lo que avanzó no se pierde."}]}
]}
$j$::jsonb),

('c0000007-0802-4000-8000-000000000001', 'b0000007-0008-4000-8000-000000000001', 2,
 'Ejercicio final y siguientes pasos', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Ya recorriste la plataforma completa. Falta lo único que de verdad enseña: usarla."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si vas a tomar cursos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Revisa tu nombre completo en tu perfil. Es el que llevará tu constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Inscríbete a un curso del catálogo y deja una duda en su foro o en el chat de una lección."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Termina este tutorial: marca la lección que estás leyendo y recoge tu primera constancia."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si vas a dar cursos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Crea un curso de prueba sin publicar, con dos módulos y tres lecciones."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Haz una de texto, una de video o documento y una evaluación de tres preguntas."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Recórrelo desde una cuenta de alumno, de principio a fin, hasta ver la constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Recién entonces arma el curso de verdad. La primera vuelta siempre revela algo."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si administras la instalación"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Carga el catálogo de dependencias antes de abrir el registro."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Configura el firmante de las constancias y la identidad gráfica."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Enciende solo los módulos que alguien vaya a usar esta semana."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Verifica una constancia desde fuera de la red interna."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dónde seguir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La documentación técnica vive en el repositorio: la guía general, la de personalización de marca, la de la interfaz de programación, la de inicio de sesión único y el manual de actualización. Es software libre: puedes leer el código, adaptarlo y proponer mejoras."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Este curso también es tuyo. Está sembrado como cualquier otro, así que puedes editarlo desde el panel para ajustarlo a tu institución: quitar los módulos que no apliquen, cambiar los ejemplos, agregar tus propias reglas de uso."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Marca esta lección como completada para cerrar el curso y emitir tu constancia. Gracias por llegar hasta aquí."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Consistencia: la duración declarada del curso = suma real de lecciones
-- ==========================================================
update public.cursos c
set duracion_min = greatest(1, (
  select round(sum(l.duracion_seg)::numeric / 60)
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = c.id
))
where c.id = 'a0000007-0000-4000-8000-000000000001';


-- ════════════════════════════════════════════════════════════════════
-- 057_hardening_roles_y_dependencias.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 057: blindaje de roles en perfiles + RLS en dependencias
-- =========================================================================
-- Cierra dos huecos que permitían escalada de privilegios y escritura
-- anónima al catálogo:
--
--  (1) `perfiles: actualizar el propio` (001_schema.sql:183) restringe la
--      FILA, no las COLUMNAS. es_admin y es_instructor viven en esa fila,
--      así que cualquier usuario autenticado podía volverse administrador
--      con un PATCH /rest/v1/perfiles?id=eq.<su-uuid>.
--
--  (2) public.dependencias nunca recibió `enable row level security`, con
--      lo que su política de lectura (003) era inerte y la tabla quedaba
--      expuesta a los GRANT por defecto del schema public.
-- =========================================================================

-- ---------------------------------------------------------------------
-- (1) perfiles: los campos de rol solo los cambia un administrador
-- ---------------------------------------------------------------------

-- OJO: este revoke NO es suficiente por sí solo, aunque lo parezca.
-- Supabase concede UPDATE a nivel de TABLA sobre todo `public` a los roles
-- anon/authenticated, y en PostgreSQL un revoke de COLUMNA no anula un grant
-- de TABLA. Se conserva como capa adicional, pero la defensa efectiva es el
-- trigger de más abajo. Ver la migración 069, que lo documenta y lo refuerza.
revoke update (es_admin, es_instructor) on public.perfiles from authenticated, anon;

-- DEFENSA EFECTIVA. Es lo único que bloquea de verdad la escalada, verificado
-- en producción. No lo retires pensando que basta con el revoke de arriba.
create or replace function public.perfiles_guard_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.es_admin is distinct from old.es_admin
     or new.es_instructor is distinct from old.es_instructor then
    -- auth.uid() nulo = no hay sesión de PostgREST: es el propio backend
    -- (migraciones, worker, service_role, psql del operador). Se permite.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'no autorizado para modificar es_admin/es_instructor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists perfiles_guard_roles on public.perfiles;
create trigger perfiles_guard_roles
  before update on public.perfiles
  for each row execute function public.perfiles_guard_roles();

-- ---------------------------------------------------------------------
-- (2) dependencias: habilitar RLS (la política de lectura ya viene de 003)
-- ---------------------------------------------------------------------
alter table public.dependencias enable row level security;

-- Catálogo: lo lee cualquiera (lo necesita el formulario de registro, que
-- se llena antes de tener sesión), lo escribe solo un administrador.
drop policy if exists "dependencias: leer" on public.dependencias;
create policy "dependencias: leer" on public.dependencias
  for select using (true);

drop policy if exists "dependencias: admin escribir" on public.dependencias;
create policy "dependencias: admin escribir" on public.dependencias
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ════════════════════════════════════════════════════════════════════
-- 058_perfiles_publicos.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 058: acotar los datos personales visibles entre co-inscritos
-- =========================================================================
-- La política "perfiles: leer companeros de curso" (027_chat.sql) daba SELECT
-- sobre la FILA COMPLETA de perfiles a cualquiera que compartiera curso:
-- correo, telefono_movil, cargo, dependencia_id y es_admin incluidos. Como la
-- inscripción es auto-servicio, bastaba registrarse e inscribirse para
-- inventariar el padrón de datos de contacto de todo el curso.
--
-- Enfoque: la política amplia se elimina y su caso de uso legítimo —mostrar
-- el NOMBRE del autor de un comentario, hilo o mensaje— se atiende con una
-- vista de proyección mínima. La tabla `perfiles` queda restringida a:
--   * la fila propia            (001)
--   * instructor → sus alumnos  (023)
--   * administrador → todos     (007)
--
-- Nota sobre `dependencia_id`: se conserva en la vista a propósito. Mostrar
-- "Ana Alumna · SEP" junto a un comentario es la funcionalidad; las siglas de
-- la dependencia no son dato de contacto. Correo y teléfono sí, y salen.
-- =========================================================================

drop policy if exists "perfiles: leer companeros de curso" on public.perfiles;

-- Vista sin security_invoker: se ejecuta con los permisos de su dueño, así
-- que NO hereda las políticas de `perfiles`. Por eso el acotamiento tiene que
-- estar aquí dentro, y por eso la proyección de columnas es la defensa real.
create or replace view public.perfiles_publicos as
select
  p.id,
  p.nombres,
  p.apellido_paterno,
  p.apellido_materno,
  p.nombres_completos,
  p.dependencia_id,
  p.es_instructor
from public.perfiles p
where
  -- la propia
  p.id = auth.uid()
  -- o alguien con quien comparto curso (compañero o instructor del curso)
  or public.comparte_curso_con(p.id)
  -- o cualquiera, si quien pregunta es instructor del alumno / admin
  or public.instructor_puede_ver_perfil(p.id)
  or public.is_admin();

comment on view public.perfiles_publicos is
  'Proyección mínima de perfiles para embeds de foros/chat/comentarios. '
  'NUNCA expone correo, telefono_movil, cargo ni es_admin. '
  'Ver migración 058 para el porqué.';

revoke all on public.perfiles_publicos from anon;
grant select on public.perfiles_publicos to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 059_progreso_integridad.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 060_fix_otorgar_puntos.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 060: corregir otorgar_puntos (bug de runtime en 040)
-- =========================================================================
-- 040_triggers_puntos.sql declara `p_fuente_id text`, pero la columna
-- public.log_puntos.fuente_id es `uuid` (039_gamificacion.sql), y los cuatro
-- triggers le pasan un uuid (new.leccion_id / new.id).
--
-- PostgreSQL no convierte uuid -> text implícitamente al resolver funciones,
-- así que la llamada del trigger fallaba con:
--     function public.otorgar_puntos(uuid, unknown, uuid, integer, unknown)
--     does not exist
--
-- Efecto en producción: `trg_puntos_leccion` corre AFTER UPDATE OF completado
-- sobre `progreso`, y NO consulta el feature flag de gamificación. Como el
-- reproductor siempre crea la fila de progreso antes (guardar_posicion),
-- completar una lección es siempre un UPDATE: es decir, COMPLETAR CUALQUIER
-- LECCIÓN devolvía error. La migración 040 se aplica sin problema — el fallo
-- es de ejecución, por eso ninguna prueba de esquema lo veía.
--
-- Se corrige la firma (uuid) y se recrean los triggers que la referencian.
-- =========================================================================

drop function if exists public.otorgar_puntos(uuid, text, text, int, text);

create or replace function public.otorgar_puntos(
  p_usuario_id  uuid,
  p_fuente_tipo text,
  p_fuente_id   uuid default null,
  p_puntos      int  default 0,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_usuario_id <> auth.uid() and not public.is_admin() then
    raise exception 'No autorizado para otorgar puntos a este usuario'
      using errcode = '42501';
  end if;

  if p_fuente_tipo not in (
    'leccion_completada', 'quiz_aprobado', 'foro_post', 'entrega_tiempo',
    'badge_desbloqueado', 'login_diario', 'streak'
  ) then
    raise exception 'Tipo de fuente no válido: %', p_fuente_tipo;
  end if;

  insert into public.log_puntos (usuario_id, fuente_tipo, fuente_id, puntos, descripcion)
  values (p_usuario_id, p_fuente_tipo, p_fuente_id, p_puntos, p_descripcion)
  on conflict (usuario_id, fuente_tipo, fuente_id) where fuente_id is not null
    do nothing;
end $$;

grant execute on function public.otorgar_puntos(uuid, text, uuid, int, text) to authenticated;

-- Los triggers guardan la referencia por OID de función, pero sus cuerpos
-- resuelven otorgar_puntos por nombre en cada ejecución. Se recrean para que
-- queden compilados contra la firma nueva y para dejar constancia de cuáles
-- estaban afectados.
create or replace function public.trg_puntos_leccion_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.completado is false and new.completado is true then
    perform public.otorgar_puntos(
      new.user_id, 'leccion_completada', new.leccion_id, 10, 'Lección completada');
  end if;
  return new;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 061_folio_y_rate_limit.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 061: folio no enumerable + límite de tasa en la verificación
-- =========================================================================
-- El folio se generaba así (012_emitir_constancia_extensions.sql:38):
--
--   'CON-' || YYYY || '-' || upper(substr(curso_id,1,4)) || '-' ||
--   lpad(floor(random()*99999), 5, '0')
--
-- Tres problemas:
--
--  (a) ENUMERABLE. El año es obvio y el prefijo del curso es público (va en
--      la URL /curso/:id). Solo quedan 100 000 sufijos. La RPC pública
--      verificar_constancia() —concedida a anon, sin límite de tasa— devuelve
--      nombre completo y curso. 100 000 peticiones = padrón de egresados.
--
--  (b) NO CRIPTOGRÁFICO. random() es un PRNG predecible, no pgcrypto.
--
--  (c) COLISIONES. `folio` es unique, pero el ON CONFLICT apunta a
--      (user_id, curso_id). Con 100 000 valores, la probabilidad de colisión
--      pasa del 50% hacia la constancia ~372 (paradoja del cumpleaños). Una
--      colisión lanzaba unique_violation sin capturar DENTRO de
--      marcar_leccion_completada, revirtiendo también el registro del
--      progreso: el alumno terminaba el curso, no obtenía constancia y perdía
--      la marca de la última lección.
--
-- Los folios YA EMITIDOS no se tocan: están impresos y en circulación. Esta
-- migración solo cambia cómo se generan los nuevos.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Generación de folio: 48 bits de pgcrypto, agrupados para teclear
-- ---------------------------------------------------------------------
create or replace function public.generar_folio_constancia()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  -- CON-2026-A3F1-9B2C-7D04 · 6 bytes = 2.8e14 combinaciones.
  -- Hexadecimal a propósito: sin las letras O/I/L, que se confunden al
  -- transcribir un folio a mano desde un PDF impreso.
  select 'CON-' || to_char(now(), 'YYYY') || '-' ||
         upper(
           substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
         )
  from (select encode(extensions.gen_random_bytes(6), 'hex') as h) s;
$$;

revoke all on function public.generar_folio_constancia() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Emisión con reintento ante colisión
-- ---------------------------------------------------------------------
create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso  uuid;
  v_total  int;
  v_hechas int;
  v_intento int := 0;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m   on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  if v_curso is null then return; end if;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_total = 0 or v_hechas < v_total then
    return;
  end if;

  -- Ya la tiene: nada que hacer (y nunca se le cambia el folio).
  if exists (select 1 from public.constancias
              where user_id = p_user and curso_id = v_curso) then
    return;
  end if;

  -- Reintento acotado: una colisión de folio es astronómicamente improbable
  -- con 48 bits, pero si ocurre NO debe tumbar la transacción que la llamó.
  loop
    v_intento := v_intento + 1;
    begin
      insert into public.constancias (user_id, curso_id, folio, hash_verif)
      values (
        p_user,
        v_curso,
        public.generar_folio_constancia(),
        encode(extensions.gen_random_bytes(16), 'hex')
      )
      on conflict (user_id, curso_id) do nothing;
      return;
    exception when unique_violation then
      if v_intento >= 5 then
        raise warning 'no se pudo generar folio único para % / % tras % intentos',
          p_user, v_curso, v_intento;
        return;   -- se prefiere no emitir a revertir el progreso del alumno
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Límite de tasa de la verificación pública
-- ---------------------------------------------------------------------
create table if not exists public.verificacion_rate (
  bucket         text primary key,
  ventana_inicio timestamptz not null default now(),
  intentos       int not null default 0
);

alter table public.verificacion_rate enable row level security;
-- Sin políticas a propósito: solo escribe la función security definer.
comment on table public.verificacion_rate is
  'Contador por IP para verificar_constancia(). Sin políticas RLS: solo la '
  'RPC security definer la toca. Ver migración 061.';

create or replace function public.verificacion_rate_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_bucket   text;
  v_ventana  interval := interval '1 minute';
  v_max      int := 20;
  v_inicio   timestamptz;
  v_intentos int;
begin
  -- PostgREST expone las cabeceras de la petición en request.headers.
  -- Si no hay IP (llamada interna, o un proxy que no la reenvía) se cae a un
  -- bucket global: sigue frenando la enumeración masiva, que es el objetivo.
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_bucket := coalesce(split_part(v_ip, ',', 1), 'global');

  insert into public.verificacion_rate (bucket, ventana_inicio, intentos)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update set
    ventana_inicio = case
      when public.verificacion_rate.ventana_inicio < now() - v_ventana
        then now() else public.verificacion_rate.ventana_inicio end,
    intentos = case
      when public.verificacion_rate.ventana_inicio < now() - v_ventana
        then 1 else public.verificacion_rate.intentos + 1 end
  returning ventana_inicio, intentos into v_inicio, v_intentos;

  if v_intentos > v_max then
    raise exception 'demasiadas verificaciones, intenta en un minuto'
      using errcode = '53400';
  end if;

  -- Poda oportunista: sin esto la tabla crece con cada IP que pase por aquí.
  if random() < 0.01 then
    delete from public.verificacion_rate
     where ventana_inicio < now() - interval '1 hour';
  end if;
end $$;

revoke all on function public.verificacion_rate_check() from public, anon, authenticated;

-- Se mantiene la firma de retorno: VerificarPage.vue consume estos campos.
create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio          text,
  emitida_en     timestamptz,
  hash_verif     text,
  nombre_persona text,
  titulo_curso   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verificacion_rate_check();

  return query
    select co.folio, co.emitida_en, co.hash_verif, p.nombres_completos, cu.titulo
    from public.constancias co
    join public.perfiles p on p.id = co.user_id
    join public.cursos cu  on cu.id = co.curso_id
    where co.folio = p_folio
    limit 1;
end $$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 062_cron_notificaciones_service_role.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 062: el cron de notificaciones debe autenticarse de verdad
-- =========================================================================
-- 051_notificaciones.sql agenda el job así:
--
--   headers := jsonb_build_object('Authorization',
--              'Bearer ' || current_setting('app.settings.supabase_anon_key'))
--
-- Dos problemas:
--
--  (a) La anon key es PÚBLICA (va en el bundle del navegador): no autentica
--      nada. Ahora que notifications-worker exige la service_role key, este
--      job dejaría de funcionar si no se reprograma.
--
--  (b) Ni app.settings.supabase_url ni app.settings.supabase_anon_key se
--      definen en ninguna migración, en docker-compose ni en el .env. Con
--      current_setting() sin el segundo argumento, la ausencia del GUC lanza
--      excepción: el job de notificaciones NUNCA ha llegado a ejecutarse.
--
-- El operador debe fijar los GUCs una vez, en el servidor:
--
--   alter database postgres set app.settings.supabase_url        = 'http://kong:8000';
--   alter database postgres set app.settings.service_role_key    = '<SERVICE_ROLE_KEY>';
--
-- Se usa current_setting(..., true) para que la ausencia del GUC no reviente
-- la migración; el job simplemente no se agenda y se avisa por NOTICE.
-- =========================================================================

do $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  -- pg_cron y pg_net solo existen en la imagen supabase/postgres.
  if to_regproc('cron.schedule(text,text,text)') is null then
    raise notice '[062] pg_cron no disponible: no se reprograma el job de notificaciones.';
    return;
  end if;

  begin
    perform cron.unschedule('notifications-worker');
  exception when others then null;
  end;

  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice '[062] Falta configuración del cron de notificaciones. Ejecuta en el servidor:';
    raise notice '      alter database % set app.settings.supabase_url     = ''http://kong:8000'';',
      current_database();
    raise notice '      alter database % set app.settings.service_role_key = ''<SERVICE_ROLE_KEY>'';',
      current_database();
    raise notice '      ...y vuelve a aplicar esta migración (o agenda el job a mano).';
    return;
  end if;

  perform cron.schedule(
    'notifications-worker',
    '* * * * *',
    format(
      $cron$select net.http_get(
        url     := %L || '/functions/v1/notifications-worker',
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L)
      );$cron$,
      v_url, v_key
    )
  );
  raise notice '[062] job notifications-worker reprogramado con service_role.';
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 063_feature_flags_reales.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 063: los feature flags dejan de ser cosméticos
-- =========================================================================
-- Situación anterior:
--
--  (a) NINGUNA política RLS consultaba feature_toggles. Con "foros" apagado,
--      foro_hilos seguía aceptando INSERT por PostgREST; con "chat" apagado,
--      mensajes_chat igual. El flag ocultaba la interfaz, no cerraba la
--      puerta. El comentario de src/lib/featureFlags.ts que dice "los objetos
--      de base de datos quedan inertes" era falso.
--
--  (b) Dos sistemas de flags con conjuntos de claves casi disjuntos: 25 en
--      build-time (VITE_FEATURE_*) y 11 en runtime (feature_toggles), con
--      solo 5 en común. Los otros 20 exigían `npm run build` y republicar,
--      contradiciendo la promesa del README.
--
--  (c) feature_toggles no tenía política de escritura: ni un administrador
--      podía cambiar un flag sin entrar por psql al servidor.
--
-- Esta migración: siembra las 25 claves, permite escribirlas al admin, y
-- añade el apagado a nivel de datos con políticas RESTRICTIVAS (se combinan
-- en AND con las permisivas existentes, así que no hay que reescribirlas).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. feature_on(): consulta barata y cacheable dentro de la consulta
-- ---------------------------------------------------------------------
create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable                    -- stable => se evalúa una vez por consulta, no por fila
security definer
set search_path = public
as $$
  -- Ausente = apagado, salvo que nadie haya sembrado la clave todavía, en
  -- cuyo caso se deja pasar para no romper una base a medio migrar.
  select coalesce(
    (select enabled from public.feature_toggles where key = p_key),
    not exists (select 1 from public.feature_toggles where key = p_key)
  );
$$;

grant execute on function public.feature_on(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. El administrador puede escribir los flags
-- ---------------------------------------------------------------------
drop policy if exists "feature_toggles: admin escribir" on public.feature_toggles;
create policy "feature_toggles: admin escribir" on public.feature_toggles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Sembrar las 25 claves
-- ---------------------------------------------------------------------
-- Regla de siembra: un módulo cuyas tablas YA tienen datos se enciende; el
-- resto queda apagado. Así una instalación existente no pierde de golpe una
-- funcionalidad que estaba usando (p. ej. foros activados por
-- VITE_FEATURE_FOROS=true), y una instalación nueva arranca cerrada.
do $$
declare
  v_foros    boolean := exists (select 1 from public.foro_hilos);
  v_chat     boolean := exists (select 1 from public.mensajes_chat);
  v_entregas boolean := exists (select 1 from public.entregas_leccion)
                        or exists (select 1 from public.tareas);
  v_aulas    boolean := exists (select 1 from public.sesiones_virtuales);
  v_evals    boolean := exists (select 1 from public.preguntas);
begin
  insert into public.feature_toggles (key, enabled) values
    ('instructor',              true),
    ('foros',                   v_foros),
    ('chat',                    v_chat),
    ('entregas',                v_entregas),
    ('entregas_rubricas',       v_entregas),
    ('aulas',                   v_aulas),
    ('sesiones_virtuales',      v_aulas),
    ('evaluaciones',            v_evals),
    ('advanced_quizzes',        false),
    ('rubrics',                 v_entregas),
    ('cohorts',                 false),
    ('bulk_user_import',        false),
    ('gamificacion',            false),
    ('analytics',               false),
    ('risk_dashboard',          false),
    ('downloadable_reports',    false),
    ('reportes_avanzados',      false),
    ('ai_quiz_generator',       false),
    ('ai_summaries',            false),
    ('ai_study_assistant',      false),
    ('pwa_offline',             false),
    ('offline_video_cache',     false),
    ('offline_sync',            false),
    ('push_notifications',      false),
    ('notificaciones',          false),
    ('notificaciones_email',    false),
    ('video_analytics',         false),
    ('video_analytics_heatmap', false),
    ('zoom_integration',        false),
    ('sesiones_grabaciones',    false),
    ('transcripcion_whisper',   false)
  on conflict (key) do nothing;   -- nunca se pisa lo que el operador ya decidió
end $$;

-- ---------------------------------------------------------------------
-- 4. Apagado REAL: políticas restrictivas por módulo
-- ---------------------------------------------------------------------
-- Una política RESTRICTIVA se combina en AND con todas las permisivas de la
-- tabla. Es decir: se conserva intacta la lógica de autorización existente y
-- se le antepone "…y además el módulo debe estar encendido".
--
-- No se aplica a service_role (que además tiene BYPASSRLS): el worker, el
-- cron y las Edge Functions siguen operando con el módulo apagado, que es lo
-- que se quiere para tareas de mantenimiento y limpieza.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('foros',              'foros'),
      ('foro_hilos',         'foros'),
      ('foro_respuestas',    'foros'),
      ('mensajes_chat',      'chat'),
      ('entregas_leccion',   'entregas'),
      ('tareas',             'entregas'),
      ('entregas',           'entregas'),
      ('entrega_versiones',  'entregas'),
      ('calificaciones',     'entregas'),
      ('rubricas',           'entregas'),
      ('rubrica_criterios',  'entregas'),
      ('rubrica_niveles',    'entregas'),
      ('sesiones_virtuales', 'sesiones_virtuales'),
      ('sesiones_rsvp',      'sesiones_virtuales'),
      ('cohortes',           'cohorts'),
      ('miembros_cohorte',   'cohorts'),
      ('lrs_statements',     'analytics'),
      ('video_eventos',      'video_analytics'),
      ('ai_summaries',       'ai_summaries')
    ) as t(tabla, flag)
  loop
    if to_regclass('public.' || r.tabla) is null then
      continue;
    end if;
    execute format(
      'drop policy if exists %I on public.%I',
      'modulo apagado: ' || r.flag, r.tabla);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated '
      'using (public.feature_on(%L)) with check (public.feature_on(%L))',
      'modulo apagado: ' || r.flag, r.tabla, r.flag, r.flag);
  end loop;
end $$;

comment on function public.feature_on(text) is
  'Estado de un feature flag. La usan las políticas RESTRICTIVAS que apagan '
  'los módulos a nivel de datos (migración 063): un módulo apagado no solo '
  'oculta la interfaz, también cierra sus tablas.';


-- ════════════════════════════════════════════════════════════════════
-- 064_datos_personales_arco.sql
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 065_subtitulos_leccion.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 065: subtítulos de lección (WCAG 2.1 §1.2.2, nivel A)
-- =========================================================================
-- Ninguno de los dos elementos <video> del reproductor llevaba <track>, y el
-- worker de transcodificación no generaba WebVTT. Es un incumplimiento de
-- nivel A —el más básico— y una obligación dura para el sector público.
--
-- Las sesiones grabadas ya tenían de dónde sacarlos
-- (sesiones_transcripciones.segmentos, producido por Whisper). Las lecciones
-- no tenían dónde guardarlos.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `lecciones`:
-- el reproductor carga la lista completa de lecciones del curso con
-- `lecciones?select=*` (src/composables/useLessonNavigation.ts). Una columna
-- de texto con el WebVTT viajaría entera para las 26 lecciones del curso en
-- la carga inicial, cuando solo hace falta la de la lección que se está
-- viendo. En tabla aparte, se pide bajo demanda.
--
-- Se guarda el WebVTT ya montado, no los segmentos: así una institución puede
-- subir subtítulos revisados por una persona, que es lo que el criterio pide
-- de verdad — una transcripción automática sin revisar rara vez es un
-- "equivalente al contenido hablado".
-- =========================================================================

create table if not exists public.leccion_subtitulos (
  leccion_id     uuid primary key references public.lecciones(id) on delete cascade,
  idioma         text not null default 'es',
  contenido_vtt  text not null,
  actualizado_en timestamptz not null default now()
);

comment on table public.leccion_subtitulos is
  'Pista de subtítulos WebVTT por lección, servida al reproductor como '
  '<track>. En tabla aparte para no viajar en la lista de lecciones. '
  'Ver src/lib/webvtt.js y docs/CUMPLIMIENTO.md.';

alter table public.leccion_subtitulos enable row level security;

-- Lectura: la misma que las lecciones, que ya es pública ("lecciones: leer").
drop policy if exists "subtitulos: leer" on public.leccion_subtitulos;
create policy "subtitulos: leer" on public.leccion_subtitulos
  for select using (true);

-- Escritura: administrador o instructor del curso al que pertenece la lección.
drop policy if exists "subtitulos: escribir" on public.leccion_subtitulos;
create policy "subtitulos: escribir" on public.leccion_subtitulos
  for all to authenticated
  using (public.is_instructor_de(public.curso_de_leccion(leccion_id)))
  with check (public.is_instructor_de(public.curso_de_leccion(leccion_id)));

create or replace function public.leccion_subtitulos_touch()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists leccion_subtitulos_set_actualizado on public.leccion_subtitulos;
create trigger leccion_subtitulos_set_actualizado
  before update on public.leccion_subtitulos
  for each row execute function public.leccion_subtitulos_touch();

-- ---------------------------------------------------------------------
-- Informe de conformidad
-- ---------------------------------------------------------------------
-- Es la consulta que responde "¿puedo declarar conformidad con WCAG 1.2.2?".
create or replace view public.v_lecciones_sin_subtitulos as
select
  c.id     as curso_id,
  c.titulo as curso,
  m.orden  as modulo_orden,
  l.id     as leccion_id,
  l.orden  as leccion_orden,
  l.titulo as leccion,
  l.duracion_seg
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
join public.cursos  c on c.id = m.curso_id
left join public.leccion_subtitulos s on s.leccion_id = l.id
where l.tipo_material = 'video'
  and (s.leccion_id is null or coalesce(s.contenido_vtt, '') = '')
order by c.titulo, m.orden, l.orden;

comment on view public.v_lecciones_sin_subtitulos is
  'Lecciones de video sin pista de subtítulos. Si devuelve filas, la '
  'instalación NO cumple WCAG 2.1 §1.2.2 (nivel A).';

grant select on public.v_lecciones_sin_subtitulos to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 066_revocacion_constancias.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 066: revocación y corrección de constancias
-- =========================================================================
-- No existía forma de anular una constancia emitida por error. La única vía
-- era un DELETE manual en psql, que deja al portador con un PDF y un QR que
-- responde "no existe": indistinguible de una falsificación.
--
-- Con esto, la verificación pública pasa a distinguir tres estados —vigente,
-- revocada, inexistente— en vez de dos.
-- =========================================================================

alter table public.constancias
  add column if not exists revocada_en    timestamptz,
  add column if not exists revocada_por   uuid references public.perfiles(id),
  add column if not exists motivo_revocacion text;

comment on column public.constancias.revocada_en is
  'Nula = vigente. La fila NUNCA se borra al revocar: el folio sigue en '
  'circulación y su verificación tiene que poder decir "revocada" en vez de '
  '"no existe". Ver migración 066.';

create index if not exists constancias_revocada_idx
  on public.constancias(revocada_en) where revocada_en is not null;

-- ---------------------------------------------------------------------
-- Revocar (solo administrador)
-- ---------------------------------------------------------------------
create or replace function public.revocar_constancia(p_folio text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_ya timestamptz;
begin
  if not public.is_admin() then
    raise exception 'solo un administrador puede revocar constancias'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'el motivo de la revocación es obligatorio' using errcode = '22023';
  end if;

  select id, revocada_en into v_id, v_ya
    from public.constancias where folio = p_folio;

  if v_id is null then
    raise exception 'no existe una constancia con folio %', p_folio using errcode = 'P0002';
  end if;
  if v_ya is not null then
    return jsonb_build_object('ok', true, 'ya_estaba_revocada', true, 'revocada_en', v_ya);
  end if;

  update public.constancias
     set revocada_en = now(),
         revocada_por = auth.uid(),
         motivo_revocacion = trim(p_motivo)
   where id = v_id;

  return jsonb_build_object('ok', true, 'ya_estaba_revocada', false, 'revocada_en', now());
end $$;

grant execute on function public.revocar_constancia(text, text) to authenticated;

-- Reactivar, para el caso de una revocación equivocada.
create or replace function public.reactivar_constancia(p_folio text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'solo un administrador puede reactivar constancias'
      using errcode = '42501';
  end if;

  update public.constancias
     set revocada_en = null, revocada_por = null, motivo_revocacion = null
   where folio = p_folio;

  if not found then
    raise exception 'no existe una constancia con folio %', p_folio using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.reactivar_constancia(text) to authenticated;

-- ---------------------------------------------------------------------
-- La verificación pública distingue los tres estados
-- ---------------------------------------------------------------------
-- Cambia la forma del retorno, así que hay que soltar la versión anterior.
drop function if exists public.verificar_constancia(text);

create or replace function public.verificar_constancia(p_folio text)
returns table (
  folio          text,
  emitida_en     timestamptz,
  hash_verif     text,
  nombre_persona text,
  titulo_curso   text,
  estado         text,
  revocada_en    timestamptz,
  motivo_revocacion text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verificacion_rate_check();

  return query
    select
      co.folio,
      co.emitida_en,
      co.hash_verif,
      p.nombres_completos,
      cu.titulo,
      case when co.revocada_en is null then 'vigente' else 'revocada' end,
      co.revocada_en,
      co.motivo_revocacion
    from public.constancias co
    join public.perfiles p on p.id = co.user_id
    join public.cursos cu  on cu.id = co.curso_id
    where co.folio = p_folio
    limit 1;
end $$;

grant execute on function public.verificar_constancia(text) to anon, authenticated;

comment on function public.verificar_constancia(text) is
  'Verificación pública por folio. Devuelve estado "vigente" o "revocada"; '
  'cero filas significa que el folio no existe. Limitada por tasa para evitar '
  'la enumeración del padrón (migración 061).';


-- ════════════════════════════════════════════════════════════════════
-- 067_worker_reintentos.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 067: reintentos de los jobs de video
-- =========================================================================
-- runJob() mandaba cualquier excepción directo a status='failed', que es un
-- estado terminal: un corte de red al descargar el origen mataba el job de
-- forma definitiva y hacía falta intervención manual para reencolarlo.
-- =========================================================================

alter table public.videos
  add column if not exists intentos int not null default 0,
  add column if not exists ultimo_error_en timestamptz;

comment on column public.videos.intentos is
  'Veces que se ha intentado transcodificar. El worker reencola hasta '
  'JOB_MAX_RETRIES antes de marcar failed definitivamente.';

-- Jobs que fallaron de forma definitiva: es la consulta para el operador.
create or replace view public.v_videos_fallidos as
select v.id, v.leccion_id, l.titulo as leccion, v.intentos,
       v.error_msg, v.ultimo_error_en, v.creado_en
from public.videos v
left join public.lecciones l on l.id = v.leccion_id
where v.status = 'failed'
order by v.ultimo_error_en desc nulls last;

grant select on public.v_videos_fallidos to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 068_rate_limit_compartido.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 068: límite de tasa compartido para las Edge Functions
-- =========================================================================
-- supabase/functions/_shared/rateLimit.ts era un Map en memoria del isolate:
--
--   * se reinicia en cada cold start (frecuentes en Deno Deploy y en el
--     runtime self-hosted, que recicla isolates);
--   * no comparte estado entre isolates, así que N isolates concurrentes
--     admiten N × MAX_REQUESTS peticiones;
--   * el fallback de IP era la cadena literal 'unknown' cuando no había
--     x-forwarded-for, metiendo a todos los clientes en el mismo cubo.
--
-- En la práctica no limitaba nada. Aquí va el contador compartido: una tabla,
-- accesible solo con service_role, que es lo que usan las Edge Functions.
--
-- Generaliza el mecanismo que la migración 061 introdujo para
-- verificar_constancia, que ahora delega aquí.
-- =========================================================================

create table if not exists public.rate_limit (
  scope          text not null,
  bucket         text not null,
  ventana_inicio timestamptz not null default now(),
  intentos       int not null default 0,
  primary key (scope, bucket)
);

comment on table public.rate_limit is
  'Contador de peticiones por (scope, bucket). scope = función o endpoint; '
  'bucket = IP o identificador de usuario. Sin políticas RLS: solo la RPC '
  'security definer la toca, y esa RPC solo la puede llamar service_role.';

alter table public.rate_limit enable row level security;

create index if not exists rate_limit_ventana_idx on public.rate_limit(ventana_inicio);

-- ---------------------------------------------------------------------
-- Comprobación atómica
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_check(
  p_scope       text,
  p_bucket      text,
  p_max         int  default 60,
  p_ventana_seg int  default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana  interval := make_interval(secs => greatest(p_ventana_seg, 1));
  v_bucket   text := coalesce(nullif(trim(p_bucket), ''), 'desconocido');
  v_inicio   timestamptz;
  v_intentos int;
begin
  -- El upsert hace el conteo y la rotación de ventana en UNA sentencia: dos
  -- peticiones simultáneas no pueden leer el mismo valor y escribir encima.
  insert into public.rate_limit (scope, bucket, ventana_inicio, intentos)
  values (p_scope, v_bucket, now(), 1)
  on conflict (scope, bucket) do update set
    ventana_inicio = case
      when public.rate_limit.ventana_inicio < now() - v_ventana
        then now() else public.rate_limit.ventana_inicio end,
    intentos = case
      when public.rate_limit.ventana_inicio < now() - v_ventana
        then 1 else public.rate_limit.intentos + 1 end
  returning ventana_inicio, intentos into v_inicio, v_intentos;

  -- Poda oportunista: sin esto la tabla crece con cada IP que pase por aquí.
  if random() < 0.005 then
    delete from public.rate_limit where ventana_inicio < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed',     v_intentos <= p_max,
    'remaining',   greatest(p_max - v_intentos, 0),
    'reset_at',    v_inicio + v_ventana,
    'retry_after', greatest(ceil(extract(epoch from (v_inicio + v_ventana - now())))::int, 1)
  );
end $$;

-- Solo service_role: las Edge Functions. Un cliente no debe poder consumir ni
-- inspeccionar los contadores de otros.
revoke all on function public.rate_limit_check(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- verificar_constancia pasa a usar el contador compartido
-- ---------------------------------------------------------------------
create or replace function public.verificacion_rate_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text;
  v_res jsonb;
begin
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  v_res := public.rate_limit_check(
    'verificar_constancia',
    coalesce(split_part(v_ip, ',', 1), 'global'),
    20, 60
  );

  if not (v_res ->> 'allowed')::boolean then
    raise exception 'demasiadas verificaciones, intenta en un minuto'
      using errcode = '53400';
  end if;
end $$;

-- La tabla propia de 061 queda obsoleta.
drop table if exists public.verificacion_rate;


-- ════════════════════════════════════════════════════════════════════
-- 069_fix_guard_roles.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 069: corrige el blindaje de roles de la migración 057
-- =========================================================================
-- 057 hace:
--
--   revoke update (es_admin, es_instructor) on public.perfiles
--     from authenticated, anon;
--
-- y lo describe como "la defensa real". ES FALSO, y se comprobó en la
-- instalación de aprendo.mx: después de aplicar 057,
--
--   has_column_privilege('authenticated','public.perfiles','es_admin','UPDATE')
--
-- sigue devolviendo true. El motivo es que Supabase concede UPDATE a nivel de
-- TABLA sobre todo `public` a los roles anon/authenticated, y en PostgreSQL un
-- REVOKE de columna no anula un GRANT de tabla: mientras exista el privilegio
-- amplio, se aplica a todas las columnas.
--
-- Lo que sí bloquea la escalada —verificado en producción— es el trigger
-- perfiles_guard_roles, también de 057. Esta migración no cambia el
-- comportamiento: lo hace explícito, refuerza el trigger y deja constancia de
-- por qué el REVOKE no es suficiente, para que nadie lo retire creyendo que
-- basta con él.
--
-- NO se revoca el UPDATE de tabla: `authenticated` necesita poder actualizar
-- su propio perfil (nombre, teléfono, cargo) y un administrador necesita poder
-- marcar es_instructor desde el panel. Restringirlo por columnas obligaría a
-- mantener la lista de columnas editables en dos sitios y rompería el panel en
-- cuanto se añada una.
-- =========================================================================

-- El trigger es la defensa. Se recrea con dos mejoras:
--   * cubre también INSERT: sin esto, una fila podía nacer con es_admin=true
--     si algún día se abriera una política de INSERT sobre perfiles;
--   * mensaje uniforme, que src/lib/errors.ts ya traduce.
create or replace function public.perfiles_guard_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_previo      boolean := coalesce(old.es_admin, false);
  v_instructor_previo boolean := coalesce(old.es_instructor, false);
begin
  if tg_op = 'INSERT' then
    v_admin_previo := false;
    v_instructor_previo := false;
  end if;

  if coalesce(new.es_admin, false) is distinct from v_admin_previo
     or coalesce(new.es_instructor, false) is distinct from v_instructor_previo then
    -- auth.uid() nulo = no hay sesión de PostgREST: es el propio backend
    -- (migraciones, worker, service_role, psql del operador). Se permite.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'no autorizado para modificar es_admin/es_instructor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists perfiles_guard_roles on public.perfiles;
create trigger perfiles_guard_roles
  before insert or update on public.perfiles
  for each row execute function public.perfiles_guard_roles();

comment on function public.perfiles_guard_roles() is
  'ÚNICA defensa efectiva contra la escalada de privilegios en perfiles. El '
  'revoke de columna de la migración 057 NO sirve: Supabase concede UPDATE a '
  'nivel de tabla y un revoke de columna no lo anula. No retirar este trigger.';


-- ════════════════════════════════════════════════════════════════════
-- 070_constancias_disenos_firmantes.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 070: constancias por curso, con diseños y varios firmantes
-- =========================================================================
-- Hasta aquí la configuración era un SINGLETON global: un firmante, un texto,
-- para toda la instalación.
--
--   create table constancia_settings (
--     id boolean primary key default true check (id = true),  -- una sola fila
--     titular_nombre text, titular_cargo text, lugar text );
--
-- Se sustituye por tres piezas con responsabilidades separadas:
--
--   * funcionarios        — quién puede firmar (con su firma escaneada)
--   * constancia_disenos  — CÓMO SE VE (fondo, plecas, logo, colores)
--   * curso_constancia    — QUÉ DICE y qué diseño usa cada curso
--
-- El diseño es puramente visual: la estructura del texto es la misma en todas
-- las constancias, y lo que cambia por curso son las cadenas concretas. Por eso
-- los textos NO viven en el diseño —si vivieran ahí habría que duplicar un
-- diseño entero para cambiar una palabra— sino en la configuración del curso,
-- con los valores por defecto de la instalación como respaldo.
--
-- DECISIÓN IMPORTANTE — LA CONSTANCIA SE CONGELA AL EMITIRSE.
-- Firmantes y diseño se COPIAN a la fila de `constancias` al emitir, no se
-- resuelven por clave foránea al consultarla. Si un funcionario cambia de
-- cargo, se da de baja o se corrige un texto, las constancias ya emitidas no
-- pueden cambiar: su folio circula impreso y la verificación pública debe
-- seguir reflejando lo que se firmó. Resolver por FK haría que un documento de
-- 2024 mostrara el cargo de 2026.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Funcionarios que pueden firmar
-- ---------------------------------------------------------------------
create table if not exists public.funcionarios (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  cargo          text not null,
  -- Imagen escaneada de la firma (bucket constancia-firmas).
  firma_path     text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.funcionarios is
  'Personas facultadas para firmar constancias. Dar de baja (activo=false) no '
  'afecta a las constancias ya emitidas: esas guardan su propia copia.';

create index if not exists funcionarios_activo_idx on public.funcionarios(activo, nombre);

-- ---------------------------------------------------------------------
-- 2. Diseños: solo lo visual
-- ---------------------------------------------------------------------
create table if not exists public.constancia_disenos (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,
  nombre          text not null,
  descripcion     text,
  -- Rutas bajo public/theme/ o en el bucket constancia-disenos.
  fondo_path      text,
  pleca_path      text,
  logo_path       text,
  color_primario  text,
  color_texto     text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on table public.constancia_disenos is
  'Plantillas VISUALES de constancia: fondo, plecas, logo y colores. No '
  'contienen textos — la estructura textual es común y las cadenas concretas '
  'viven en curso_constancia / constancia_settings.';

-- ---------------------------------------------------------------------
-- 3. Textos por defecto de la instalación
-- ---------------------------------------------------------------------
-- Se amplía el singleton en vez de crear otra tabla: sigue siendo el lugar
-- donde viven los valores por defecto, ahora también los textuales.
alter table public.constancia_settings
  add column if not exists diseno_id    uuid references public.constancia_disenos(id) on delete set null,
  add column if not exists texto_pre    text not null default 'Otorga el presente',
  add column if not exists texto_titulo text not null default 'CONSTANCIA',
  add column if not exists texto_cuerpo text not null default
    'a {{nombre}} por haber acreditado el curso {{curso}}, con una duración de {{duracion}}.';

comment on column public.constancia_settings.texto_cuerpo is
  'Marcadores admitidos: {{nombre}}, {{curso}}, {{duracion}}, {{fecha}}, '
  '{{folio}}. Se sustituyen al renderizar (ver src/lib/constanciaTextos.js).';

-- ---------------------------------------------------------------------
-- 4. Configuración por curso
-- ---------------------------------------------------------------------
create table if not exists public.curso_constancia (
  curso_id        uuid primary key references public.cursos(id) on delete cascade,
  diseno_id       uuid references public.constancia_disenos(id) on delete set null,
  lugar           text,
  -- NULL = hereda de constancia_settings. Permite personalizar una sola
  -- cadena sin duplicar toda la configuración.
  texto_pre       text,
  texto_titulo    text,
  texto_cuerpo    text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);

comment on table public.curso_constancia is
  'Qué diseño usa cada curso y qué textos sobrescribe. Campo NULL = hereda de '
  'constancia_settings. Si el curso no tiene fila, se usa todo el default.';

-- ---------------------------------------------------------------------
-- 5. Firmantes de cada curso (varios, ordenados)
-- ---------------------------------------------------------------------
create table if not exists public.curso_firmantes (
  curso_id       uuid not null references public.cursos(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  orden          int  not null default 1,
  primary key (curso_id, funcionario_id)
);

comment on table public.curso_firmantes is
  'Firmantes del curso, de izquierda a derecha por `orden`. ON DELETE RESTRICT '
  'sobre funcionarios: no se borra a alguien que ya figura como firmante.';

create index if not exists curso_firmantes_orden_idx on public.curso_firmantes(curso_id, orden);

-- ---------------------------------------------------------------------
-- 6. Congelado en la constancia emitida
-- ---------------------------------------------------------------------
alter table public.constancias
  add column if not exists diseno    jsonb,
  add column if not exists firmantes jsonb,
  add column if not exists textos    jsonb;

comment on column public.constancias.firmantes is
  'Copia de los firmantes al emitir: [{nombre, cargo, firma_path, orden}]. NO '
  'es una referencia: un documento impreso no puede cambiar de firmante porque '
  'el catálogo se edite después.';

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
-- Lectura para cualquiera autenticado: el reproductor necesita resolver el
-- diseño y los firmantes para pintar la constancia. Escritura solo admin.
-- Nada aquí es dato personal del alumno; son datos institucionales que ya
-- aparecen impresos en el documento.
alter table public.funcionarios         enable row level security;
alter table public.constancia_disenos   enable row level security;
alter table public.curso_constancia     enable row level security;
alter table public.curso_firmantes      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['funcionarios','constancia_disenos','curso_constancia','curso_firmantes']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': leer', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || ': leer', t);

    execute format('drop policy if exists %I on public.%I', t || ': admin escribir', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin())',
      t || ': admin escribir', t);
  end loop;
end $$;

-- Bucket de firmas escaneadas.
--
-- Es PÚBLICO a propósito, con rutas basadas en uuid. La firma se imprime en la
-- propia constancia: quien tenga una ya puede extraerla de su PDF, así que
-- ocultar el archivo no aporta protección real. Lo que impide la falsificación
-- es el folio no enumerable y la verificación pública, no esconder la imagen.
-- Las rutas con uuid evitan que alguien recorra el bucket adivinando nombres.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('constancia-firmas', 'constancia-firmas', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Assets de diseño (fondos, plecas, logos). Mismo criterio: son la apariencia
-- del documento, no un secreto. Se admite tanto subirlos aquí como referenciar
-- rutas del tema (/theme/...), para que una institución pueda usar los assets
-- que ya trae su theme sin duplicarlos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('constancia-disenos', 'constancia-disenos', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "disenos: admin escribe" on storage.objects;
create policy "disenos: admin escribe" on storage.objects for insert to authenticated
  with check (bucket_id = 'constancia-disenos' and public.is_admin());

drop policy if exists "disenos: admin actualiza" on storage.objects;
create policy "disenos: admin actualiza" on storage.objects for update to authenticated
  using (bucket_id = 'constancia-disenos' and public.is_admin());

drop policy if exists "disenos: admin borra" on storage.objects;
create policy "disenos: admin borra" on storage.objects for delete to authenticated
  using (bucket_id = 'constancia-disenos' and public.is_admin());

drop policy if exists "firmas: admin escribe" on storage.objects;
create policy "firmas: admin escribe" on storage.objects for insert to authenticated
  with check (bucket_id = 'constancia-firmas' and public.is_admin());

drop policy if exists "firmas: admin actualiza" on storage.objects;
create policy "firmas: admin actualiza" on storage.objects for update to authenticated
  using (bucket_id = 'constancia-firmas' and public.is_admin());

drop policy if exists "firmas: admin borra" on storage.objects;
create policy "firmas: admin borra" on storage.objects for delete to authenticated
  using (bucket_id = 'constancia-firmas' and public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Configuración efectiva de un curso
-- ---------------------------------------------------------------------
-- Resuelve la herencia en un solo lugar: curso -> defaults de instalación.
-- La usan tanto el emisor (para congelar) como el panel de administración
-- (para previsualizar), de modo que no puedan divergir.
create or replace function public.constancia_config(p_curso uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.constancia_settings where id),
       c as (select * from public.curso_constancia where curso_id = p_curso),
       d as (
         select * from public.constancia_disenos
         where id = coalesce((select diseno_id from c), (select diseno_id from s))
       )
  select jsonb_build_object(
    'lugar',        coalesce((select lugar from c), (select lugar from s)),
    'texto_pre',    coalesce((select texto_pre from c), (select texto_pre from s)),
    'texto_titulo', coalesce((select texto_titulo from c), (select texto_titulo from s)),
    'texto_cuerpo', coalesce((select texto_cuerpo from c), (select texto_cuerpo from s)),
    'diseno', (select to_jsonb(d) from d),
    'firmantes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', f.nombre, 'cargo', f.cargo,
               'firma_path', f.firma_path, 'orden', cf.orden)
             order by cf.orden, f.nombre)
      from public.curso_firmantes cf
      join public.funcionarios f on f.id = cf.funcionario_id
      where cf.curso_id = p_curso
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.constancia_config(uuid) to authenticated;

comment on function public.constancia_config(uuid) is
  'Configuración efectiva de la constancia de un curso, resolviendo la '
  'herencia curso -> instalación. Única fuente para emitir y previsualizar.';

-- ---------------------------------------------------------------------
-- 9. Emitir congelando la configuración
-- ---------------------------------------------------------------------
create or replace function public._emitir_constancia_si_procede(p_user uuid, p_leccion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso   uuid;
  v_total   int;
  v_hechas  int;
  v_intento int := 0;
  v_cfg     jsonb;
begin
  select c.id into v_curso
  from public.cursos c
  join public.modulos m   on m.curso_id = c.id
  join public.lecciones l on l.modulo_id = m.id
  where l.id = p_leccion;

  if v_curso is null then return; end if;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = v_curso;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where pr.user_id = p_user and pr.completado and m.curso_id = v_curso;

  if v_total = 0 or v_hechas < v_total then
    return;
  end if;

  if exists (select 1 from public.constancias
              where user_id = p_user and curso_id = v_curso) then
    return;
  end if;

  -- Se congela aquí: a partir de este momento el documento es inmutable
  -- aunque el catálogo de funcionarios o el diseño cambien.
  v_cfg := public.constancia_config(v_curso);

  loop
    v_intento := v_intento + 1;
    begin
      insert into public.constancias
        (user_id, curso_id, folio, hash_verif, diseno, firmantes, textos)
      values (
        p_user,
        v_curso,
        public.generar_folio_constancia(),
        encode(extensions.gen_random_bytes(16), 'hex'),
        v_cfg -> 'diseno',
        v_cfg -> 'firmantes',
        jsonb_build_object(
          'lugar',        v_cfg ->> 'lugar',
          'texto_pre',    v_cfg ->> 'texto_pre',
          'texto_titulo', v_cfg ->> 'texto_titulo',
          'texto_cuerpo', v_cfg ->> 'texto_cuerpo'
        )
      )
      on conflict (user_id, curso_id) do nothing;
      return;
    exception when unique_violation then
      if v_intento >= 5 then
        raise warning 'no se pudo generar folio único para % / % tras % intentos',
          p_user, v_curso, v_intento;
        return;
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Diseño inicial, para que una instalación nueva funcione sin configurar
-- ---------------------------------------------------------------------
insert into public.constancia_disenos (clave, nombre, descripcion, fondo_path, pleca_path)
values ('institucional', 'Institucional',
        'Diseño por defecto: fondo y plecas del tema activo.',
        '/theme/constancia-fondo.webp', '/theme/constancia-pleca.webp')
on conflict (clave) do nothing;

update public.constancia_settings
   set diseno_id = (select id from public.constancia_disenos where clave = 'institucional')
 where id and diseno_id is null;

-- Migra el firmante único que existía a un funcionario del catálogo, para no
-- perder la configuración de una instalación que ya venía funcionando.
do $$
declare v_n text; v_c text; v_id uuid;
begin
  select titular_nombre, titular_cargo into v_n, v_c
    from public.constancia_settings where id;

  if v_n is not null and v_n <> 'Nombre Completo Del Titular'
     and not exists (select 1 from public.funcionarios where nombre = v_n and cargo = v_c) then
    insert into public.funcionarios (nombre, cargo) values (v_n, v_c) returning id into v_id;
    -- Se asigna a todos los cursos que no tengan firmantes todavía.
    insert into public.curso_firmantes (curso_id, funcionario_id, orden)
    select c.id, v_id, 1 from public.cursos c
    where not exists (select 1 from public.curso_firmantes cf where cf.curso_id = c.id)
    on conflict do nothing;
    raise notice '[070] Firmante «%» migrado al catálogo y asignado a los cursos.', v_n;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 072_progreso_por_modulo.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 072: avance por módulo
-- =========================================================================
-- Dos cosas:
--
-- (a) src/services/badgeEngine.js llama a curso_completado_por_usuario y a
--     modulo_completado_por_usuario. NINGUNA DE LAS DOS EXISTÍA en el esquema.
--     El cliente hace `const { data } = await supabase.rpc(...)` y devuelve
--     `data === true`: al fallar, data es null y el criterio evalúa false. Es
--     decir, las insignias de «completar curso» y «completar módulo» nunca se
--     desbloqueaban, y sin ningún error visible.
--
-- (b) El avance solo existía a nivel de curso. Esta migración añade la vista
--     que lo agrega por módulo, para el reproductor y el panel de instructor.
--
-- Nota de seguridad: las dos funciones reciben un p_user_id. Sin control, un
-- alumno podría consultar el avance de cualquier otro. Se restringen a uno
-- mismo, al instructor del curso y al administrador.
-- =========================================================================

create or replace function public.curso_completado_por_usuario(p_user_id uuid, p_curso_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_total int; v_hechas int;
begin
  if p_user_id <> auth.uid()
     and not public.is_instructor_de(p_curso_id)
     and auth.uid() is not null then
    raise exception 'no autorizado para consultar el avance de otra persona'
      using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = p_curso_id;

  if v_total = 0 then return false; end if;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where pr.user_id = p_user_id and pr.completado and m.curso_id = p_curso_id;

  return v_hechas >= v_total;
end $$;

create or replace function public.modulo_completado_por_usuario(p_user_id uuid, p_modulo_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_curso uuid; v_total int; v_hechas int;
begin
  select curso_id into v_curso from public.modulos where id = p_modulo_id;
  if v_curso is null then return false; end if;

  if p_user_id <> auth.uid()
     and not public.is_instructor_de(v_curso)
     and auth.uid() is not null then
    raise exception 'no autorizado para consultar el avance de otra persona'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.lecciones where modulo_id = p_modulo_id;
  if v_total = 0 then return false; end if;

  select count(*) into v_hechas
  from public.progreso pr
  join public.lecciones l on l.id = pr.leccion_id
  where pr.user_id = p_user_id and pr.completado and l.modulo_id = p_modulo_id;

  return v_hechas >= v_total;
end $$;

grant execute on function public.curso_completado_por_usuario(uuid, uuid)  to authenticated;
grant execute on function public.modulo_completado_por_usuario(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Vista de avance por módulo
-- ---------------------------------------------------------------------
-- Se filtra dentro de la vista, no por RLS: una vista corre con los permisos
-- de su dueño, así que sin este WHERE cualquiera vería el avance de todos.
-- Mismo criterio que las políticas de `progreso`: uno mismo, el instructor del
-- curso, o un administrador.
create or replace view public.v_progreso_modulo as
select
  i.user_id,
  m.curso_id,
  m.id                  as modulo_id,
  m.titulo              as modulo,
  m.orden               as modulo_orden,
  count(l.id)                                            as lecciones,
  count(*) filter (where pr.completado)                  as completadas,
  case when count(l.id) = 0 then 0
       else round(100.0 * count(*) filter (where pr.completado) / count(l.id))
  end                                                    as porcentaje,
  max(pr.actualizado_en)                                 as ultima_actividad
from public.inscripciones i
join public.modulos   m on m.curso_id = i.curso_id
join public.lecciones l on l.modulo_id = m.id
left join public.progreso pr on pr.leccion_id = l.id and pr.user_id = i.user_id
where i.user_id = auth.uid()
   or public.is_instructor_de(m.curso_id)
group by i.user_id, m.curso_id, m.id, m.titulo, m.orden;

comment on view public.v_progreso_modulo is
  'Avance por módulo y por persona. El filtro va DENTRO de la vista: una vista '
  'corre con los permisos de su dueño, así que sin él expondría el avance de '
  'todos los alumnos a cualquiera.';

grant select on public.v_progreso_modulo to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 073_paginas_institucionales.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 073: documentos institucionales versionados
-- =========================================================================
-- Hasta aquí, el aviso de privacidad, los términos de uso y el contacto eran
-- tres enlaces con href '#' en la configuración del tema, y el formulario de
-- alta recababa `perfiles.aviso_privacidad = true` señalando a uno de ellos.
-- Es decir: se guardaba el consentimiento contra un documento inexistente.
--
-- Aquí los documentos pasan a vivir en la base, versionados, y el
-- consentimiento deja de ser un booleano suelto para registrar CONTRA QUÉ
-- VERSIÓN se otorgó — que es lo único que permitiría demostrar, años después,
-- qué texto leyó una persona.
--
-- Dos decisiones que conviene no deshacer sin leer design.md del cambio
-- `paginas-institucionales`:
--
--   * NO hay columna `es_vigente`. La versión vigente es la de mayor `version`
--     entre las publicadas. Un booleano de vigencia hay que mantenerlo en dos
--     filas a la vez y admite estados imposibles (dos vigentes, ninguna).
--     Derivarlo no puede desincronizarse, y además hace la RLS trivial:
--     «publicado_en no nulo» ya deja el borrador invisible.
--
--   * La aceptación NO la escribe el cliente. Va por aceptar_aviso_vigente(),
--     que consulta ella misma cuál es la versión vigente. Si el cliente pudiera
--     mandar el número, alguien podría declararse al día con una versión que
--     nunca vio, y el registro dejaría de valer como prueba.
-- =========================================================================

-- ---------- 1. Documentos y sus versiones ----------

create table if not exists public.documento_versiones (
  slug                  text    not null
                          check (slug in ('aviso-privacidad', 'terminos-uso', 'contacto')),
  version               integer not null check (version > 0),
  contenido             jsonb   not null,
  publicado_en          timestamptz,
  requiere_reaceptacion boolean not null default false,
  publicado_por         uuid    references public.perfiles(id) on delete set null,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  primary key (slug, version)
);

comment on table public.documento_versiones is
  'Documentos institucionales versionados. publicado_en nulo = borrador. La '
  'versión vigente de un slug es la de mayor `version` entre las publicadas; '
  'no hay columna de vigencia a propósito (ver migración 073).';

-- Como mucho un borrador por documento: sin esto, «editar» podría dejar dos
-- textos sin publicar y ninguna forma de saber cuál se publica.
create unique index if not exists documento_borrador_unico
  on public.documento_versiones (slug)
  where publicado_en is null;

create index if not exists documento_publicadas_idx
  on public.documento_versiones (slug, version desc)
  where publicado_en is not null;

-- ---------- 2. La versión vigente ----------

create or replace view public.v_documento_vigente as
select distinct on (slug)
  slug, version, contenido, publicado_en, requiere_reaceptacion
from public.documento_versiones
where publicado_en is not null
order by slug, version desc;

comment on view public.v_documento_vigente is
  'La versión publicada más reciente de cada documento institucional.';

-- ---------- 3. RLS ----------

alter table public.documento_versiones enable row level security;

-- Lectura pública SOLO de lo publicado. Incluye `anon` a propósito: quien
-- todavía no se registra necesita leer el aviso antes de aceptarlo.
--
-- El historial publicado queda legible por cualquiera. Es deseable en un
-- documento legal —permite comprobar qué decía en una fecha— y no expone nada
-- que no se hubiera publicado ya. El borrador no entra porque no cumple la
-- condición, sin necesidad de una regla aparte.
drop policy if exists "documentos: lectura de lo publicado" on public.documento_versiones;
create policy "documentos: lectura de lo publicado"
  on public.documento_versiones for select to anon, authenticated
  using (publicado_en is not null);

drop policy if exists "documentos: admin escribe" on public.documento_versiones;
create policy "documentos: admin escribe"
  on public.documento_versiones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.v_documento_vigente to anon, authenticated;

-- ---------- 4. El historial publicado es inmutable ----------

-- Sin esto, «no se puede alterar el historial» sería una intención y no una
-- garantía: un admin podría reescribir el texto que alguien aceptó y el
-- registro de consentimiento pasaría a apuntar a algo distinto de lo firmado.
create or replace function public.documento_historial_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.publicado_en is not null then
      raise exception 'una versión publicada no se puede borrar'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.publicado_en is not null then
    -- Publicar es el único cambio permitido sobre una fila... y ya estaba
    -- publicada, así que no queda ninguno.
    raise exception 'una versión publicada no se puede modificar'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists documento_historial_inmutable on public.documento_versiones;
create trigger documento_historial_inmutable
  before update or delete on public.documento_versiones
  for each row execute function public.documento_historial_inmutable();

-- ---------- 5. Consentimiento versionado ----------

alter table public.perfiles
  add column if not exists aviso_version_aceptada integer;

comment on column public.perfiles.aviso_version_aceptada is
  'Versión del aviso de privacidad que esta persona aceptó. Nula = sin '
  'aceptar. La escribe aceptar_aviso_vigente(), nunca el cliente.';

-- La persona no elige el número: la función consulta la versión vigente. Así
-- el registro sigue valiendo como prueba.
create or replace function public.aceptar_aviso_vigente()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_version integer;
begin
  if v_uid is null then
    raise exception 'no hay sesión' using errcode = '42501';
  end if;

  select version into v_version
    from public.v_documento_vigente
   where slug = 'aviso-privacidad';

  if v_version is null then
    raise exception 'no hay aviso de privacidad publicado'
      using errcode = 'P0002';
  end if;

  update public.perfiles
     set aviso_privacidad       = true,
         aviso_version_aceptada = v_version,
         actualizado_en         = now()
   where id = v_uid;

  return v_version;
end $$;

grant execute on function public.aceptar_aviso_vigente() to authenticated;

-- La columna no se toca por la vía directa. Dos cosas en un solo trigger, y
-- van juntas a propósito: en Postgres los triggers BEFORE disparan en orden
-- ALFABÉTICO, así que separarlas en dos haría que la coherencia se ejecutara
-- antes que la comprobación y la disparara ella misma.
--
-- 1) Coherencia. Si se retira el consentimiento, la versión aceptada se va con
--    él. Esto es lo que hace compatible la baja ARCO (eliminar_mis_datos,
--    migración 064), que pone aviso_privacidad = false sin conocer esta
--    columna. Se resuelve así en lugar de reescribir aquí sus ~100 líneas:
--    copiar una función sensible es pedir un error de transcripción.
--
-- 2) Comprobación. Fijar una versión concreta solo lo pueden hacer las
--    funciones de confianza. A diferencia de perfiles_guard_roles, NO basta
--    con mirar auth.uid(): la baja ARCO corre como la propia persona, con
--    auth.uid() no nulo. Lo que distingue a las funciones de confianza es que
--    son SECURITY DEFINER: dentro de ellas current_user es el dueño de la
--    función, no el rol de la petición.
--
--    Retirar el consentimiento sí se permite desde una sesión normal: ya se
--    podía con el booleano, y no es lo que hay que impedir. Lo que se impide
--    es FABRICAR una aceptación que nadie otorgó.
--    Este trigger NO es SECURITY DEFINER, y eso es funcional, no un descuido:
--    dentro de una función SECURITY DEFINER current_user pasa a ser su dueño,
--    así que la comprobación de abajo no se cumpliría NUNCA y el guardián
--    dejaría pasar todo. Sin definer, current_user es el rol efectivo de quien
--    escribe: postgres si viene de una función de confianza, `authenticated`
--    si viene de PostgREST.
create or replace function public.perfiles_guard_aviso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(new.aviso_privacidad, false) then
    new.aviso_version_aceptada := null;
  end if;

  if tg_op = 'UPDATE'
     and new.aviso_version_aceptada is distinct from old.aviso_version_aceptada
     and new.aviso_version_aceptada is not null
     and current_user in ('authenticated', 'anon') then
    raise exception 'la versión del aviso aceptada no se fija a mano'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists perfiles_guard_aviso on public.perfiles;
create trigger perfiles_guard_aviso
  before insert or update on public.perfiles
  for each row execute function public.perfiles_guard_aviso();

-- ¿Hace falta volver a aceptar? Se mira el INTERVALO, no solo la vigente: si
-- se publican dos versiones seguidas y la que exigía re-aceptación es la
-- primera, mirar únicamente la última perdería la obligación.
create or replace function public.aviso_requiere_reaceptacion(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.documento_versiones dv
     where dv.slug = 'aviso-privacidad'
       and dv.publicado_en is not null
       and dv.requiere_reaceptacion
       and dv.version > coalesce(
             (select p.aviso_version_aceptada from public.perfiles p where p.id = p_uid),
             0)
  ) and exists (
    -- Solo se le pide a quien ya había aceptado algo: quien no ha aceptado
    -- nunca pasa por el alta, no por la re-aceptación.
    select 1 from public.perfiles p
     where p.id = p_uid and p.aviso_version_aceptada is not null
  );
$$;

grant execute on function public.aviso_requiere_reaceptacion(uuid) to authenticated;

-- ---------- 6. Siembra: los tres documentos, EN BORRADOR ----------

-- Formato: JSON de Tiptap, el mismo que usan las lecciones. La whitelist
-- EXTENSIONES_TEXTO (src/components/LessonRichTextEditor.vue) es compartida
-- entre el editor y el renderizado, así que un nodo fuera de ella no puede
-- llegar a la página.
--
-- Se siembran sin publicar a propósito. Publicar una plantilla con marcadores
-- {{ }} como si fuera el aviso de la institución sería peor que no tener
-- aviso: daría apariencia de cumplimiento. El alta queda bloqueada mientras no
-- haya versión vigente (ver handle_new_user más abajo), así que el operador se
-- entera en cuanto alguien intenta registrarse, no meses después.
insert into public.documento_versiones (slug, version, contenido, publicado_en)
values
  ('aviso-privacidad', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya todo lo que aparece entre llaves dobles, revísela con su área jurídica y publíquela. Mientras no esté publicada, el registro de nuevas cuentas está bloqueado."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Identidad y domicilio del responsable"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", con domicilio en {{DOMICILIO_FISCAL_COMPLETO}}, es responsable del tratamiento de sus datos personales."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales que recabamos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para su registro y participación en la plataforma de capacitación recabamos:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Nombre y apellidos"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo electrónico"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono móvil "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Dependencia o área de adscripción "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Cargo "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Durante el uso de la plataforma se genera además información sobre su actividad formativa: avance por lección, tiempo activo, intentos y calificaciones de evaluaciones, participaciones en foros y chat, y constancias emitidas."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No recabamos datos personales sensibles.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Finalidades"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Primarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " (necesarias para prestarle el servicio):"
        }
      ]
    },
    {
      "type": "orderedList",
      "attrs": {
        "start": 1
      },
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Crear y administrar su cuenta."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Registrar su avance académico y emitir constancias."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Verificar públicamente la autenticidad de las constancias por folio."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Comunicarle información operativa sobre los cursos en que participa."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Secundarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " (puede oponerse sin que afecte su acceso): {{ELIMINAR SI NO APLICA}} elaborar estadísticas agregadas de capacitación y enviarle avisos sobre nuevos cursos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Transferencias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{ELEGIR UNA: no realizamos transferencias de sus datos personales a terceros / transferimos sus datos a {{TERCERO}} con la finalidad de {{FINALIDAD}}, con fundamento en {{FUNDAMENTO}}}}."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Ejercicio de derechos ARCO"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Usted puede "
        },
        {
          "type": "text",
          "text": "Acceder",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a sus datos, "
        },
        {
          "type": "text",
          "text": "Rectificarlos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", "
        },
        {
          "type": "text",
          "text": "Cancelarlos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " u "
        },
        {
          "type": "text",
          "text": "Oponerse",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a su tratamiento. Desde la propia plataforma, en Mi perfil → Mis datos, puede descargar todos sus datos en formato JSON y eliminarlos."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Sobre las constancias ya emitidas.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Al eliminar sus datos, las constancias expedidas se conservan con su folio, pero el nombre asociado queda anonimizado: el folio circula en documentos ya entregados y su verificación pública debe seguir funcionando. {{AJUSTAR SI SU CRITERIO ES EL BORRADO TOTAL}}"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "También puede ejercer sus derechos escribiendo a "
        },
        {
          "type": "text",
          "text": "{{CORREO_ARCO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". Responderemos en un plazo máximo de "
        },
        {
          "type": "text",
          "text": "20 días hábiles",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Conservación"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Conservamos sus datos personales durante "
        },
        {
          "type": "text",
          "text": "{{PLAZO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", salvo obligación normativa que exija un plazo mayor."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Medidas de seguridad"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos contra daño, pérdida, alteración, destrucción o uso no autorizado, incluyendo control de acceso por roles y cifrado de las comunicaciones."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cambios a este aviso"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier modificación se publicará en esta misma página. La versión y su fecha de publicación aparecen al pie."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Responsable de datos personales:",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " {{NOMBRE_O_ÁREA}} — {{CORREO_ARCO}}"
        }
      ]
    }
  ]
}$doc$::jsonb, null),
  ('terminos-uso', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya los marcadores y revísela antes de publicarla."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Objeto"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Estos términos regulan el uso de la plataforma de capacitación de "
        },
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cuenta de la persona usuaria"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La cuenta es personal e intransferible. Quien la usa es responsable de la confidencialidad de su contraseña y de la actividad realizada con ella."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Uso aceptable"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No compartir credenciales ni suplantar a otra persona."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No publicar en foros ni chats contenido ilícito, ofensivo o ajeno a los cursos."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No intentar acceder a áreas o datos que no correspondan a su cuenta."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Las constancias se emiten al cumplir los requisitos de cada curso y llevan un folio verificable públicamente. {{AJUSTAR SI SUS CONSTANCIAS REQUIEREN FIRMA ELECTRÓNICA AVANZADA: estas constancias no van firmadas con e.firma; su respaldo es el registro en el servidor de la institución.}}"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Propiedad del contenido"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los materiales de los cursos son propiedad de {{NOMBRE_INSTITUCIÓN}} o de sus titulares y se ponen a disposición únicamente para fines formativos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Suspensión"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}} puede suspender el acceso ante un incumplimiento de estos términos, informando el motivo."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cambios"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier modificación se publicará en esta misma página, con su versión y fecha."
        }
      ]
    }
  ]
}$doc$::jsonb, null),
  ('contacto', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya los marcadores por sus datos reales y publíquela."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "{{ÁREA_RESPONSABLE}}"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{CORREO_CONTACTO}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{TELÉFONO}} ext. {{EXTENSIÓN}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Domicilio:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{DOMICILIO}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Horario de atención:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{HORARIO}}"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para ejercer sus derechos de acceso, rectificación, cancelación u oposición sobre sus datos personales, escriba a "
        },
        {
          "type": "text",
          "text": "{{CORREO_ARCO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". El detalle del procedimiento está en el aviso de privacidad."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Soporte de la plataforma"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para incidencias técnicas —acceso, reproducción de video, constancias— escriba a {{CORREO_SOPORTE}} indicando el curso y una descripción del problema."
        }
      ]
    }
  ]
}$doc$::jsonb, null)
on conflict (slug, version) do nothing;

-- ---------- 7. No se recaba consentimiento sin documento ----------

-- Se rechaza el alta que DECLARE aceptación del aviso cuando no hay ninguna
-- versión vigente. Un alta que no declara aceptación (por ejemplo la que hace
-- scripts/crear-admin.sh para el primer administrador) no se ve afectada: sin
-- ella, publicar el aviso sería imposible, porque no habría administrador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acepta  boolean := coalesce((new.raw_user_meta_data->>'aviso_privacidad')::boolean, false);
  v_version integer;
begin
  if v_acepta then
    select version into v_version
      from public.v_documento_vigente
     where slug = 'aviso-privacidad';

    if v_version is null then
      raise exception
        'Esta instalación aún no tiene aviso de privacidad publicado; '
        'no puede recabarse el consentimiento. Un administrador debe '
        'publicarlo en Administración → Documentos.'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.perfiles (
    id, nombres, apellido_paterno, apellido_materno,
    correo, telefono_movil, dependencia_id, cargo,
    aviso_privacidad, aviso_version_aceptada
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Sin nombre'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Sin apellido'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono_movil',''),
    nullif(new.raw_user_meta_data->>'dependencia_id','')::int,
    nullif(new.raw_user_meta_data->>'cargo',''),
    v_acepta,
    v_version
  )
  on conflict (id) do update
    set nombres          = excluded.nombres,
        apellido_paterno = excluded.apellido_paterno,
        apellido_materno = excluded.apellido_materno,
        telefono_movil   = excluded.telefono_movil,
        dependencia_id   = excluded.dependencia_id,
        cargo            = excluded.cargo,
        aviso_privacidad = excluded.aviso_privacidad,
        aviso_version_aceptada = excluded.aviso_version_aceptada,
        actualizado_en   = now();
  return new;
end $$;

-- ---------- 8. La baja ARCO reinicia también la versión aceptada ----------

-- Filas ya existentes que quedaran incoherentes.
update public.perfiles
   set aviso_version_aceptada = null
 where aviso_privacidad = false
   and aviso_version_aceptada is not null;


-- ════════════════════════════════════════════════════════════════════
-- 074_aviso_generico.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 074: aviso de privacidad genérico, listo para editar
-- =========================================================================
-- La migración 073 sembró el aviso a partir de docs/AVISO_PRIVACIDAD.md, que
-- es una PLANTILLA: quince marcadores {{ }} intercalados, incluidos algunos
-- con instrucciones dentro del propio texto ({{ELEGIR UNA:}}). Publicarla
-- exigía redactar, no editar.
--
-- Este seed lo sustituye por un aviso completo y coherente, redactado sobre lo
-- que la plataforma hace de verdad —qué datos pide, qué genera, qué expone la
-- verificación de constancias, qué guarda en el navegador—, con solo CUATRO
-- datos entre corchetes:
--
--   [NOMBRE DE LA INSTITUCIÓN]  [DOMICILIO OFICIAL]
--   [UNIDAD DE TRANSPARENCIA]   [datos.personales@institucion.gob.mx]
--
-- El plazo de conservación trae un valor concreto (cinco años) en lugar de un
-- hueco, porque un valor que se puede revisar es más útil que un espacio en
-- blanco que hay que rellenar a ciegas.
--
-- Sigue SIN publicarse. Un aviso de privacidad lo revisa el área jurídica de
-- cada institución; el software no puede hacer esa parte.
--
-- SOLO se toca el borrador INTACTO. La condición `actualizado_en = creado_en`
-- distingue el seed original de un borrador que alguien ya editó: el servicio
-- actualiza esa columna al guardar. Y `publicado_en is null` deja fuera
-- cualquier versión publicada, que además es inmutable por trigger. Una
-- instalación que ya empezó a redactar su aviso no se ve afectada.
-- =========================================================================

update public.documento_versiones
   set contenido = $doc${
  "type": "doc",
  "content": [
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Antes de publicar: ",
              "marks": [
                {
                  "type": "bold"
                }
              ]
            },
            {
              "type": "text",
              "text": "sustituya los cuatro datos entre corchetes —nombre de la institución, domicilio, correo para derechos ARCO y área responsable—, revise el plazo de conservación y confirme el apartado de transferencias. Después borre este recuadro."
            }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Este texto es un punto de partida redactado sobre lo que la plataforma hace realmente, no asesoría jurídica: revíselo con su área jurídica antes de publicarlo."
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Identidad y domicilio del responsable"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "[NOMBRE DE LA INSTITUCIÓN]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", con domicilio en "
        },
        {
          "type": "text",
          "text": "[DOMICILIO OFICIAL]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", es responsable del tratamiento de sus datos personales y de su protección, conforme a la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados y demás normativa aplicable."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales que recabamos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Al registrarse en esta plataforma de capacitación le solicitamos:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Nombre y apellidos"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo electrónico"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono móvil "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Dependencia o área de adscripción "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Cargo o puesto "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Durante el uso de la plataforma se genera además información sobre su actividad formativa: avance por lección, tiempo activo, intentos y calificaciones de las evaluaciones, participaciones en foros y chat, y las constancias que se le expidan."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No recabamos datos personales sensibles",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", es decir, aquellos que puedan revelar origen racial o étnico, estado de salud, información genética, creencias religiosas, filosóficas o morales, afiliación sindical, opiniones políticas o preferencia sexual."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Finalidades del tratamiento"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Sus datos se tratan para las siguientes finalidades "
        },
        {
          "type": "text",
          "text": "necesarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " para prestarle el servicio:"
        }
      ]
    },
    {
      "type": "orderedList",
      "attrs": {
        "start": 1
      },
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Crear y administrar su cuenta y controlar el acceso a la plataforma."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Inscribirle en los cursos y registrar su avance académico."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Aplicar y calificar evaluaciones."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Expedir las constancias que acrediten su participación."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Permitir la verificación pública de la autenticidad de una constancia a partir de su folio."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Comunicarle información operativa sobre los cursos en que participa."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Elaborar estadísticas agregadas de capacitación, sin identificarle individualmente."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No utilizamos sus datos para finalidades distintas de las anteriores. Si en el futuro se incorporara alguna, se le informará mediante una versión nueva de este aviso."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Verificación pública de constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cada constancia lleva un folio verificable por cualquier persona que lo conozca. Al consultarlo se muestran únicamente "
        },
        {
          "type": "text",
          "text": "el nombre de la persona titular, el curso y la fecha de emisión",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ": lo mínimo para comprobar que el documento es auténtico. No se expone ningún otro dato de su cuenta."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Transferencias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No realizamos transferencias de sus datos personales a terceros",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", salvo las que sean necesarias para atender requerimientos de autoridad competente debidamente fundados y motivados."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La plataforma se opera en infraestructura de la propia institución. Si su instalación utiliza servicios externos —correo saliente, videoconferencia o transcripción automática—, declárelos aquí."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Ejercicio de derechos ARCO"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Usted puede en todo momento "
        },
        {
          "type": "text",
          "text": "Acceder",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a sus datos personales, solicitar su "
        },
        {
          "type": "text",
          "text": "Rectificación",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " cuando sean inexactos, su "
        },
        {
          "type": "text",
          "text": "Cancelación",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " cuando considere que no son necesarios, u "
        },
        {
          "type": "text",
          "text": "Oponerse",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a su tratamiento."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Desde la propia plataforma, en "
        },
        {
          "type": "text",
          "text": "Mi perfil → Mis datos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", puede:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Descargar",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " todos sus datos personales en un archivo JSON."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Eliminar",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " sus datos personales de forma inmediata."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Sobre las constancias ya expedidas. ",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "Al eliminar sus datos, las constancias que se le hayan expedido se conservan con su folio, pero el nombre asociado queda anonimizado. El motivo es que esos folios circulan en documentos ya entregados a terceros y su verificación pública debe seguir funcionando. Si su criterio es el borrado total, ajuste este párrafo y el procedimiento."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "También puede ejercer sus derechos escribiendo a "
        },
        {
          "type": "text",
          "text": "[datos.personales@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", acompañando: nombre completo, medio para recibir la respuesta, copia de una identificación oficial, descripción clara de los datos sobre los que ejerce el derecho y, en su caso, los documentos que sustenten su solicitud."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Responderemos su solicitud en un plazo máximo de "
        },
        {
          "type": "text",
          "text": "veinte días hábiles",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Conservación de los datos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Conservamos sus datos personales mientras su cuenta permanezca activa y hasta "
        },
        {
          "type": "text",
          "text": "cinco años",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " después de su última actividad en la plataforma, salvo que una disposición normativa exija un plazo mayor. Ajuste este plazo al que corresponda a su institución."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los registros de constancias se conservan de forma permanente para permitir su verificación, en los términos descritos arriba."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Medidas de seguridad"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos contra daño, pérdida, alteración, destrucción o uso no autorizado, entre ellas: control de acceso por roles, cifrado de las comunicaciones, contraseñas almacenadas de forma irreversible y respaldos periódicos de la base de datos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Almacenamiento en su navegador"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La plataforma guarda información en su navegador para funcionar: su sesión iniciada, sus preferencias de visualización y, si activa el modo sin conexión, los materiales que descargue. No utilizamos cookies de publicidad ni de seguimiento de terceros."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cambios a este aviso"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier modificación a este aviso se publicará en esta misma página. Cada publicación queda registrada con su número de versión y su fecha, que aparecen al pie. Cuando un cambio lo amerite, le solicitaremos de nuevo su consentimiento."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Responsable de datos personales"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "[UNIDAD DE TRANSPARENCIA]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " — "
        },
        {
          "type": "text",
          "text": "[datos.personales@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        }
      ]
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'aviso-privacidad'
   and publicado_en is null
   and actualizado_en = creado_en;


-- ════════════════════════════════════════════════════════════════════
-- 075_terminos_contacto_genericos.sql
-- ════════════════════════════════════════════════════════════════════

-- =========================================================================
-- Migration 075: términos de uso y contacto genéricos, listos para editar
-- =========================================================================
-- Mismo tratamiento que la 074 dio al aviso de privacidad, para los otros dos
-- documentos: se sustituye la plantilla sembrada por la 073 —marcadores {{ }}
-- con la instrucción dentro del texto— por documentos completos y coherentes,
-- redactados sobre lo que la plataforma hace de verdad.
--
-- Términos de uso: la cuenta y su responsabilidad, el uso aceptable, la
-- propiedad de los materiales, el ALCANCE REAL de las constancias —que no van
-- firmadas con firma electrónica avanzada, algo que conviene decir y no
-- omitir—, la revocación, la disponibilidad del servicio y la suspensión.
--
-- Contacto: los tres motivos por los que alguien escribe —soporte, datos
-- personales y contenido de los cursos— separados, más una nota de que la
-- verificación de constancias no necesita escribir a nadie: se hace con el
-- folio, sin sesión.
--
-- Las mismas dos salvaguardas que la 074: SOLO se toca el borrador intacto
-- (`actualizado_en = creado_en` distingue el seed original de un borrador ya
-- editado) y nunca lo publicado. Una instalación que ya redactó los suyos no
-- se ve afectada.
-- =========================================================================

update public.documento_versiones
   set contenido = $doc${
  "type": "doc",
  "content": [
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Antes de publicar: ",
              "marks": [
                {
                  "type": "bold"
                }
              ]
            },
            {
              "type": "text",
              "text": "sustituya el nombre de la institución y los correos de contacto, y revise los apartados de constancias, disponibilidad y suspensión, que dependen de cómo opere su instalación. Después borre este recuadro."
            }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Punto de partida redactado sobre lo que la plataforma hace, no asesoría jurídica: revíselo con su área jurídica."
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Objeto"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Estos términos regulan el uso de la plataforma de capacitación en línea de "
        },
        {
          "type": "text",
          "text": "[NOMBRE DE LA INSTITUCIÓN]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". Al registrarse y utilizarla, usted acepta cumplirlos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Su cuenta"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La cuenta es "
        },
        {
          "type": "text",
          "text": "personal e intransferible",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". Usted es responsable de la confidencialidad de su contraseña y de la actividad que se realice con ella. Si detecta un uso no autorizado, avísenos de inmediato para poder cerrarla."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los datos que registre deben ser veraces: su nombre es el que aparecerá en las constancias que se le expidan, y corregirlo después de la emisión obliga a reexpedirlas."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Uso aceptable"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Al utilizar la plataforma usted se compromete a no:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Compartir sus credenciales ni suplantar la identidad de otra persona."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Publicar en foros o chats contenido ilícito, ofensivo, discriminatorio o ajeno a los cursos."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Reproducir, distribuir o comercializar los materiales de los cursos fuera de la plataforma sin autorización."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Intentar acceder a áreas, cuentas o datos que no le correspondan, ni interferir en el funcionamiento del servicio."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Utilizar medios automatizados para resolver evaluaciones o simular avance."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Materiales de los cursos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los contenidos —videos, textos, evaluaciones y documentos— son propiedad de "
        },
        {
          "type": "text",
          "text": "[NOMBRE DE LA INSTITUCIÓN]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " o de sus titulares, y se ponen a su disposición únicamente con fines formativos y para su uso personal durante su participación en los cursos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Las constancias se expiden automáticamente al cumplir los requisitos de cada curso y llevan un folio verificable públicamente. Su autenticidad se comprueba consultando ese folio contra esta plataforma."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Alcance de la constancia. ",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "Estas constancias acreditan la participación registrada en la plataforma. "
        },
        {
          "type": "text",
          "text": "No van firmadas con firma electrónica avanzada",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ": su respaldo es el registro conservado en los sistemas de la institución. Si su procedimiento exige firma avanzada, indíquelo aquí y añádala."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Una constancia puede revocarse si se acredita que se obtuvo de forma irregular. La revocación queda registrada y la verificación pública lo refleja."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Disponibilidad del servicio"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Procuramos que la plataforma esté disponible de forma continua, pero puede interrumpirse por mantenimiento, actualizaciones o causas ajenas a la institución. Estas interrupciones no generan responsabilidad ni derecho a compensación, y se avisará con antelación cuando el mantenimiento sea programado."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Suspensión del acceso"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "[NOMBRE DE LA INSTITUCIÓN]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " puede suspender o cancelar el acceso ante un incumplimiento de estos términos, informando el motivo por el correo registrado. Si la suspensión afecta a un curso en el que ya había avanzado, se le indicará qué ocurre con ese avance y con las constancias ya expedidas."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Protección de sus datos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "El tratamiento de sus datos personales se rige por el aviso de privacidad de esta plataforma, que puede consultar en cualquier momento desde el pie de página. Para ejercer sus derechos escriba a "
        },
        {
          "type": "text",
          "text": "[datos.personales@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Modificaciones"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier cambio a estos términos se publicará en esta misma página, con su número de versión y su fecha. El uso de la plataforma después de una modificación supone su aceptación."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Dudas"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para cualquier aclaración sobre estos términos escriba a "
        },
        {
          "type": "text",
          "text": "[soporte@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'terminos-uso'
   and publicado_en is null
   and actualizado_en = creado_en;

update public.documento_versiones
   set contenido = $doc${
  "type": "doc",
  "content": [
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Antes de publicar: ",
              "marks": [
                {
                  "type": "bold"
                }
              ]
            },
            {
              "type": "text",
              "text": "sustituya los datos entre corchetes por los reales de su institución. Los tres bloques de abajo cubren los tres motivos por los que la gente escribe; elimine el que no aplique. Después borre este recuadro."
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Soporte de la plataforma"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para incidencias técnicas —no puede entrar, un video no reproduce, una constancia no se genera— escriba indicando el curso y una descripción de lo que ocurre. Si puede, adjunte una captura de pantalla."
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[soporte@institucion.gob.mx]"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[55 0000 0000] ext. [000]"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Horario de atención: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[lunes a viernes, de 9:00 a 18:00 h]"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para ejercer sus derechos de acceso, rectificación, cancelación u oposición sobre sus datos personales, o para cualquier duda sobre el aviso de privacidad:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Área responsable: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[UNIDAD DE TRANSPARENCIA]"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[datos.personales@institucion.gob.mx]"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Domicilio: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[DOMICILIO OFICIAL]"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Buena parte de estos derechos puede ejercerlos usted mismo, de inmediato, desde "
        },
        {
          "type": "text",
          "text": "Mi perfil → Mis datos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ": descargar todos sus datos o eliminarlos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Contenido de los cursos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para dudas sobre el temario, la programación de un curso o la validez de una constancia:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Área responsable: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[DIRECCIÓN DE CAPACITACIÓN]"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[capacitacion@institucion.gob.mx]"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Verificación de constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Si necesita comprobar que una constancia es auténtica, no hace falta escribirnos: use el folio impreso en el documento en la página de verificación pública de esta plataforma. Funciona sin iniciar sesión."
        }
      ]
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'contacto'
   and publicado_en is null
   and actualizado_en = creado_en;


-- ════════════════════════════════════════════════════════════════════
-- 076_eventos_portada.sql
-- ════════════════════════════════════════════════════════════════════

-- 076: eventos de portada — el canal de ingesta anónima.
--
-- La portada se va a reequilibrar (el curso vende, la constancia cierra) y esa
-- decisión debe poder evaluarse con datos propios: cuántas personas pasan del
-- hero a un curso, del curso al detalle y del detalle al registro. Quienes
-- recorren ese embudo son visitantes SIN sesión, así que el canal existente no
-- sirve: video_eventos exige usuario autenticado.
--
-- El diseño repite el de la otra superficie pública anónima que ya existe, la
-- verificación de constancias (068): RPC con SECURITY DEFINER, lista blanca,
-- límite por IP con el contador compartido, y una tabla que el rol anónimo no
-- puede leer. Anónimo ESCRIBE por la puerta estrecha; solo administración LEE.

create table if not exists public.portada_eventos (
  id         bigint generated always as identity primary key,
  evento     text not null,
  -- Sección de origen y posición de la tarjeta: lo mínimo para el embudo.
  seccion    text,
  posicion   int,
  -- Identificador de visita generado en el navegador, aleatorio, sin relación
  -- con la persona. Permite contar recorridos, no identificar a nadie.
  visita     uuid,
  creado_en  timestamptz not null default now(),
  -- La lista blanca vive como restricción, no solo en la RPC: aunque alguien
  -- consiguiera otra vía de inserción, no puede inventar eventos.
  constraint portada_eventos_evento_valido check (
    evento in (
      'portada_hero_cta',
      'portada_curso_click',
      'curso_detalle_visto',
      'registro_iniciado',
      'registro_completado',
      'leccion_probada',
      'registro_desde_leccion'
    )
  ),
  constraint portada_eventos_seccion_corta check (seccion is null or length(seccion) <= 40),
  constraint portada_eventos_posicion_sana check (posicion is null or posicion between 0 and 999)
);

comment on table public.portada_eventos is
  'Embudo de la portada: eventos anónimos, sin datos personales. Ingesta solo por registrar_evento_portada().';

alter table public.portada_eventos enable row level security;

-- Nadie inserta directo: ni anon ni authenticated. La única puerta es la RPC,
-- que es donde vive el límite por IP.
create policy "portada_eventos: admin lee"
  on public.portada_eventos for select to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()));

create index if not exists portada_eventos_semana_idx
  on public.portada_eventos (evento, creado_en);

-- ---------------------------------------------------------------------

create or replace function public.registrar_evento_portada(
  p_evento   text,
  p_seccion  text default null,
  p_posicion int  default null,
  p_visita   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text;
  v_res jsonb;
begin
  -- Límite por IP con el contador compartido (068). 120 eventos/minuto por IP
  -- es holgado para navegación real y estrecho para una inundación.
  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  v_res := public.rate_limit_check(
    'evento_portada',
    coalesce(split_part(v_ip, ',', 1), 'global'),
    120, 60
  );

  if not (v_res ->> 'allowed')::boolean then
    -- Silencio deliberado: un evento de analítica jamás debe romper la página
    -- ni darle a un abusador la confirmación de que el límite existe.
    return;
  end if;

  insert into public.portada_eventos (evento, seccion, posicion, visita)
  values (p_evento, left(p_seccion, 40), p_posicion, p_visita);
exception when check_violation then
  -- Evento fuera de la lista blanca: se descarta sin ruido, por lo mismo.
  return;
end $$;

revoke all on function public.registrar_evento_portada(text, text, int, uuid)
  from public;
grant execute on function public.registrar_evento_portada(text, text, int, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- La pregunta que este canal existe para responder: ¿dónde se cae la gente?

create or replace view public.v_embudo_portada
with (security_invoker = true) as
select
  date_trunc('week', creado_en)::date as semana,
  count(*) filter (where evento = 'portada_hero_cta')      as hero_cta,
  count(*) filter (where evento = 'portada_curso_click')   as curso_click,
  count(*) filter (where evento = 'curso_detalle_visto')   as detalle_visto,
  count(*) filter (where evento = 'registro_iniciado')     as registro_iniciado,
  count(*) filter (where evento = 'registro_completado')   as registro_completado,
  count(*) filter (where evento = 'leccion_probada')       as leccion_probada,
  count(*) filter (where evento = 'registro_desde_leccion') as registro_desde_leccion
from public.portada_eventos
group by 1
order by 1 desc;

comment on view public.v_embudo_portada is
  'Embudo semanal de la portada. security_invoker: hereda la RLS de la tabla, así que solo administración ve datos.';
