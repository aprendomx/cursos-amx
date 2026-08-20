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
