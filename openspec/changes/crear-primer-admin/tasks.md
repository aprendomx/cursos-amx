## 1. Esqueleto y entorno de `scripts/crear-admin.sh`

- [x] 1.1 Crear `scripts/crear-admin.sh` ejecutable, con `set -euo pipefail`, `ROOT`/`COMPOSE_FILE` y cabecera de comentarios en el estilo de `deploy.sh` y `migrate.sh` (qué hace, por qué existe, ejemplos de uso).
- [x] 1.2 Parsear los argumentos `--email`, `--nombres`, `--apellido-paterno`, `--apellido-materno`, `--password`, `--imprimir-password`, `-h/--help`, rechazando opciones desconocidas como hacen los otros scripts.
- [x] 1.3 Cargar `docker/.env` y validar que `SERVICE_ROLE_KEY` y `API_EXTERNAL_URL` existen y no están vacías, **antes** de pedir cualquier dato al operador; error claro si falta alguna.
- [x] 1.4 Aislar los dos efectos externos en funciones sustituibles: `gotrue_admin_api <método> <ruta>` (cuerpo por stdin) y `db_psql` (envoltura de `compose exec -T db psql -At`).
- [x] 1.5 En `gotrue_admin_api`, intentar primero la URL interna del servicio `auth` en la red de compose y caer a `API_EXTERNAL_URL`; si ambas fallan, el error nombra las dos URLs probadas.

## 2. Entrada, validación y generación de contraseña

- [x] 2.1 Solicitar por pantalla los datos faltantes solo cuando hay TTY (`[ -t 0 ]`); sin TTY, fallar nombrando el argumento faltante en lugar de bloquearse.
- [x] 2.2 Validar el formato del correo y rechazar antes de tocar nada, con mensaje que diga que el correo es inválido.
- [x] 2.3 Leer `--password` con `read -rs` (sin eco, sin valor en línea de comandos) y rechazar menos de 8 caracteres indicando el mínimo.
- [x] 2.4 Generar la contraseña con `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24` cuando no se suministró una.
- [x] 2.5 Armar el cuerpo JSON con `python3 -c` o `jq` para que los acentos y apellidos compuestos queden correctamente escapados, y entregarlo a `curl` por stdin (`-K -`, junto con url y cabeceras), nunca como argumento.

## 3. Alta, promoción e idempotencia

- [x] 3.1 Buscar el usuario por correo en `auth.users` vía `db_psql` para decidir entre alta y promoción.
- [x] 3.2 Alta: `POST /auth/v1/admin/users` con `email_confirm: true` y `user_metadata` con nombres y apellidos, para que el trigger `on_auth_user_created` cree el perfil con datos reales.
- [x] 3.3 Promoción: `update public.perfiles set es_admin = true where id = <uuid>` vía `db_psql`, sin tocar contraseña ni datos personales.
- [x] 3.4 Si el usuario ya tiene `es_admin = true`, informarlo y salir con código `0` sin modificar nada.
- [x] 3.5 Imprimir la contraseña generada una sola vez, con el aviso de que no volverá a mostrarse; en el caso de promoción, no imprimir contraseña alguna y decir explícitamente que se promovió a un usuario existente.
- [x] 3.6 Si el alta en GoTrue tuvo éxito pero la promoción falla, el mensaje de error indica que basta con volver a ejecutar el mismo comando.

## 4. Integración con `scripts/deploy.sh`

- [x] 4.1 Añadir la bandera `--no-admin` al parseo de opciones y a la cabecera de ayuda.
- [x] 4.2 Renumerar los pasos existentes de `[n/5]` a `[n/6]`, incluidos los comentarios de la cabecera del script.
- [x] 4.3 Añadir el paso `[6/6] Primer administrador`: con `--no-admin` u opción de simulación, describir y no consultar nada; en caso contrario contar administradores con `compose exec -T db psql -At`.
- [x] 4.4 Con uno o más administradores, informar cuántos hay y no modificar nada.
- [x] 4.5 Con cero administradores y TTY, invocar `scripts/crear-admin.sh`.
- [x] 4.6 Con cero administradores y sin TTY, emitir la advertencia con el comando exacto, incrementar `problemas` y dejar que el despliegue salga con código distinto de `0`.

## 5. Pruebas

- [x] 5.1 Crear `scripts/test-crear-admin.sh` que sustituya `gotrue_admin_api` y `db_psql` por dobles, siguiendo el estilo de `scripts/test-kong-config.sh`.
- [x] 5.2 Caso: correo inválido → error, código distinto de `0`, ninguna llamada a los dobles.
- [x] 5.3 Caso: contraseña explícita de menos de 8 caracteres → error mencionando el mínimo.
- [x] 5.4 Caso: sin TTY y sin `--email` → falla nombrando el argumento faltante y no queda esperando entrada.
- [x] 5.5 Caso: la contraseña generada tiene 24 caracteres del alfabeto esperado.
- [x] 5.6 Caso: el cuerpo JSON conserva acentos y apellidos compuestos; ni la contraseña ni la llave de servicio aparecen en la línea de comandos de `curl`; el config que lee `curl` escapa comillas y barras invertidas.
- [x] 5.7 Caso: usuario existente → se llama a la promoción y no al alta; usuario ya admin → salida `0` sin llamadas de escritura.
- [x] 5.8 Cablear `scripts/test-crear-admin.sh` como job propio en `.github/workflows/ci.yml` y añadirlo a las dependencias del job final, junto a `test-migrations` y `test-kong-config`.

## 6. Verificación manual contra la instancia de desarrollo

- [x] 6.1 Sobre una base sin administradores: correr `scripts/deploy.sh` y comprobar que el paso 6/6 dispara la creación y que la cuenta resultante inicia sesión y abre el panel. — Verificado en 5.78.44.10: con 0 admins y TTY, `deploy.sh` lanzó `crear-admin.sh`; la cuenta creada obtuvo token de `/auth/v1/token` (correo ya confirmado) y quedó con `es_admin = true`, que es lo que el panel exige. No se abrió el navegador.
- [x] 6.2 Repetir el despliegue y comprobar que el paso informa que ya hay administradores y no modifica nada. — «✔ Ya existen 1 administrador(es). Nada que hacer.»
- [x] 6.3 Ejecutar el comando sobre un usuario registrado por la interfaz y comprobar que se promueve conservando su contraseña. — Promovida la cuenta real del operador sin llamar a GoTrue ni tocar `encrypted_password`.
- [x] 6.4 Ejecutar el comando dos veces con el mismo correo y comprobar que la segunda no falla ni regenera la contraseña. — «✔ ya era administrador. Nada que hacer.», código 0.
- [x] 6.5 Revisar `docker/.env` y `docker compose logs` y confirmar que la contraseña generada no aparece en ninguno. — 0 coincidencias en `.env`, en los logs de `auth`/`kong`/`db`/`functions`, en el repo y en los historiales de shell.

## 7. Documentación

- [x] 7.1 Ampliar la sección «Instalación completa (producción self-hosted)» del README con el paso del primer administrador y el aviso de que la contraseña se muestra una sola vez.
- [x] 7.2 Documentar en `docs/MANUAL_ACTUALIZACION.md` el procedimiento y qué hacer si se pierde la contraseña (`admin-set-password` desde una sesión de admin, o re-ejecutar el comando con otro correo).
- [x] 7.3 Añadir la entrada correspondiente en `CHANGELOG.md` bajo «No publicado».
