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
