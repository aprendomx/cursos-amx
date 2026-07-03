-- Fix: permitir que un usuario recién registrado inserte su propio perfil
create policy if not exists "perfiles: insertar el propio"
  on public.perfiles for insert
  with check (auth.uid() = id);
