-- Fix: permitir que un usuario recién registrado inserte su propio perfil.
-- NOTA: la versión original usaba `create policy if not exists`, sintaxis
-- inexistente en PostgreSQL; el archivo fallaba entero. Ver nota en 003.
drop policy if exists "perfiles: insertar el propio" on public.perfiles;
create policy "perfiles: insertar el propio"
  on public.perfiles for insert
  with check (auth.uid() = id);
