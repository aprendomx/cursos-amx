-- 008_modulo_imagen.sql
-- Añade columna opcional para portada de módulo.
-- Hoy se usa como label de PlaceholderImage; cuando se añada upload real,
-- el render cambiará a <img> con fallback al placeholder.

alter table public.modulos
  add column if not exists imagen_portada text;
