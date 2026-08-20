## Why

Una instalación nueva de Cursos AMX nace sin ningún administrador y **no existe
ninguna forma soportada de crear el primero**. El rol vive en
`perfiles.es_admin` (default `false`), y el trigger `perfiles_guard_roles`
(migraciones 057 y 069) impide que un usuario se auto-promueva —correctamente,
porque es la única defensa real contra la escalada de privilegios—. El resultado
es que quien instala la plataforma se queda fuera de su propio panel: hoy la
única salida es entrar a mano con `psql` al contenedor `db` y escribir el
`UPDATE`, un paso que ni el README ni `docs/MANUAL_ACTUALIZACION.md` documentan.

`scripts/deploy.sh` promete «despliegue del stack self-hosted en UN paso», pero
al terminar deja una instalación inadministrable. Este cambio cierra ese hueco.

## What Changes

- **Nuevo `scripts/crear-admin.sh`** — crea (o promueve) al primer administrador:
  - Pregunta correo, nombres y apellidos de forma interactiva.
  - Genera una contraseña aleatoria fuerte y la muestra **una sola vez** en
    pantalla. No se escribe en disco, ni en `.env`, ni en los logs.
  - Si el correo ya existe como usuario, no lo duplica: solo lo promueve.
  - Es idempotente: volver a correrlo sobre un admin existente no falla ni
    regenera su contraseña.
  - Admite modo no interactivo (`--email`, `--nombres`, `--apellido-paterno`,
    `--password`, `--imprimir-password`) para automatización y pruebas.
- **`scripts/deploy.sh` gana un paso 6/6 «Primer administrador»** — cuenta los
  administradores existentes y solo si hay **cero** invoca el script. En una
  instalación que ya tiene admins no hace absolutamente nada. Respeta
  `--dry-run` y la nueva bandera `--no-admin`.
- **Sin TTY, deploy.sh avisa en vez de colgarse** — si corre en CI, cron o
  tubería y no hay administradores, termina con una advertencia visible que
  indica el comando exacto a correr. Nunca se queda esperando entrada que nadie
  va a teclear.
- **Documentación** — el README (sección «Instalación completa») y
  `docs/MANUAL_ACTUALIZACION.md` describen el paso y qué hacer si se pierde la
  contraseña.

No hay cambios de esquema: ninguna migración nueva. Tampoco cambia el modelo de
seguridad — el script opera por fuera de PostgREST, que es justo el caso que el
trigger guardián ya permite de forma explícita (`auth.uid() is null`).

## Capabilities

### New Capabilities

- `instalacion/primer-admin`: creación del primer administrador de una
  instalación — cómo se obtiene, cuándo se dispara durante el despliegue, qué
  garantías de idempotencia y de manejo de la contraseña ofrece, y cómo se
  comporta cuando no hay terminal interactiva.

### Modified Capabilities

Ninguna. No existen specs previas en `openspec/specs/` y este cambio no altera
requisitos de comportamiento ya especificados.

## Impact

**Código**

- `scripts/crear-admin.sh` (nuevo)
- `scripts/deploy.sh` (paso 6/6, bandera `--no-admin`, cabecera de ayuda)
- `README.md` (sección «Instalación completa (producción self-hosted)»)
- `docs/MANUAL_ACTUALIZACION.md`

**Sistemas de los que depende**

- API admin de GoTrue (`/auth/v1/admin/users`) con `SERVICE_ROLE_KEY`, para dar
  de alta el usuario con identidad y contraseña válidas. Escribir en
  `auth.users` a mano no sirve: GoTrue exige además una fila en
  `auth.identities` para permitir el inicio de sesión con contraseña.
- El trigger `on_auth_user_created` (migración 022), que crea la fila de
  `perfiles` a partir de `raw_user_meta_data`.
- `docker/.env` como origen de `SERVICE_ROLE_KEY` y `API_EXTERNAL_URL`.
- El contenedor `db` vía `docker compose exec` para contar admins y aplicar la
  promoción.

**Sin impacto**

- Esquema de base de datos: no se añaden migraciones.
- Frontend: ninguna pantalla cambia.
- Edge Functions: ninguna cambia.

**Supuestos registrados**

- No hay clientes reales en producción todavía, así que no se requiere ninguna
  ruta de compatibilidad ni migración para instalaciones existentes; basta con
  que el comportamiento sea correcto en instalaciones nuevas y en la instancia
  de desarrollo.
