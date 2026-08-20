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
