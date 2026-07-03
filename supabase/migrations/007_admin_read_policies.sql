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
