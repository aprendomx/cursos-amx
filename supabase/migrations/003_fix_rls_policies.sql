-- ==========================================================
-- Fix: agregar políticas RLS de lectura pública para
-- modulos, lecciones y dependencias
-- ==========================================================

-- Módulos: lectura pública (contenido del catálogo)
create policy if not exists "modulos: leer" on public.modulos
  for select using (true);

-- Lecciones: lectura pública
create policy if not exists "lecciones: leer" on public.lecciones
  for select using (true);

-- Dependencias: lectura pública (catálogo para formularios)
create policy if not exists "dependencias: leer" on public.dependencias
  for select using (true);

-- Inscripciones: leer las propias
create policy if not exists "inscripciones: leer propias" on public.inscripciones
  for select using (auth.uid() = user_id);

create policy if not exists "inscripciones: insertar propia" on public.inscripciones
  for insert with check (auth.uid() = user_id);
