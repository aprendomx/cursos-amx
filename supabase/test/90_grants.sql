-- Se aplica DESPUÉS de las migraciones: las tablas creadas por ellas
-- necesitan los mismos GRANT que Supabase otorga en producción.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
-- Y se vuelve a aplicar el REVOKE de 057, que un GRANT ALL posterior anula.
revoke update (es_admin, es_instructor) on public.perfiles from authenticated, anon;
