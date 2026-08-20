## 1. Hacer `deploy.sh` sourceable

- [ ] 1.1 Envolver el cuerpo ejecutable de `scripts/deploy.sh` de modo que un `source` defina las funciones sin disparar el despliegue, con la misma guarda `[[ "${BASH_SOURCE[0]}" == "${0}" ]]` que usa `scripts/crear-admin.sh`.
- [ ] 1.2 Comprobar que `PUBLIC_URL=… scripts/deploy.sh --dry-run` produce exactamente la misma salida que antes del cambio (diff contra la salida guardada).

## 2. Clasificación común de resultados

- [ ] 2.1 Añadir `clasificar_http <esperados> <codigo>`: función pura que devuelve `ok`, `problema` o `no_ejecutable` y un mensaje, sin efectos ni escrituras.
- [ ] 2.2 Tratar `000` y la cadena vacía como `no_ejecutable` con el mensaje de «no hubo conexión», distinto del de un código inesperado.
- [ ] 2.3 Añadir `clasificar_sql <estado> <salida>`: `no_ejecutable` cuando `psql` falla o la salida es vacía o `?`; en otro caso devuelve el valor para que decida quien llama.
- [ ] 2.4 Centralizar el incremento de `problemas` en un único punto que consuma el veredicto de esas funciones.

## 3. Resolución y sondeo de la URL

- [ ] 3.1 Resolver la URL en orden `PUBLIC_URL` del entorno → `API_EXTERNAL_URL` de `docker/.env` → error que nombre ambos orígenes; dejar de exigir `PUBLIC_URL` con `:?`.
- [ ] 3.2 Imprimir siempre qué URL se está usando y de dónde salió.
- [ ] 3.3 Sondear que la URL enruta a la API antes del grupo de funciones.
- [ ] 3.4 Si el sondeo falla: reportar problema nombrando URL y origen, y **omitir** el grupo de comprobaciones de funciones diciéndolo explícitamente.
- [ ] 3.5 Actualizar la cabecera de ayuda de `deploy.sh` para decir que es la URL de la **API**, con un ejemplo `https://api.tu-dominio.org`.

## 4. Aplicar la clasificación a las comprobaciones existentes

- [ ] 4.1 `admin-set-password`: superar solo con `401`/`403`; el resto, problema clasificado.
- [ ] 4.2 Grupo de cuatro funciones: invertir la condición a «esperado `401`/`403`»; `200` reporta acceso sin autenticación, `404`/`5xx` reportan que la función no responde, `000` reporta falta de conexión.
- [ ] 4.3 Migraciones: el desajuste entre registradas y en disco pasa a contar como problema; el recuento no obtenible, también.
- [ ] 4.4 RLS: separar «consulta ejecutada y sin tablas desprotegidas» de «consulta no ejecutada»; la segunda no debe imprimir el ✔ y cuenta como problema.
- [ ] 4.5 Paso `[6/6]`: alinear la rama `?` del conteo de administradores con la regla general.

## 5. Comprobación de escalada de privilegios

- [ ] 5.1 Corregir el uuid a un literal válido (el tercer grupo debe tener cuatro dígitos hexadecimales).
- [ ] 5.2 Capturar el error de `psql` en lugar de descartarlo con `2>/dev/null`, e incluirlo en el mensaje cuando la comprobación no se pueda ejecutar.
- [ ] 5.3 El fallo de la consulta pasa a contar como problema, no como aviso.
- [ ] 5.4 Añadir la aserción de que la sesión simulada es efectiva: comprobar que `auth.uid()` resuelve al usuario simulado, para que la comprobación no pueda pasar por no haber afectado a ninguna fila.
- [ ] 5.5 Verificar que la transacción sigue terminando en `rollback` y no deja filas: contar `auth.users` y `public.perfiles` antes y después.

## 6. Pruebas

- [ ] 6.1 Crear `scripts/test-deploy-verificacion.sh` que obtenga las funciones por `source` de `deploy.sh`, en el estilo de `scripts/test-crear-admin.sh`.
- [ ] 6.2 Tabla de `clasificar_http`: `401` y `403` → `ok`; `200` → problema de acceso sin autenticación; `404` y `500` → problema de función que no responde; `000` y vacío → no ejecutable por falta de conexión.
- [ ] 6.3 Tabla de `clasificar_sql`: estado distinto de cero, salida vacía y `?` → no ejecutable; valor normal → se devuelve tal cual.
- [ ] 6.4 Caso: ningún veredicto distinto de `ok` deja el recuento de problemas en cero.
- [ ] 6.5 Caso: la resolución de la URL prefiere `PUBLIC_URL` sobre `API_EXTERNAL_URL`, y sin ninguna de las dos falla nombrando ambos orígenes.
- [ ] 6.6 Cablear el script como job propio en `.github/workflows/ci.yml` y añadirlo a las dependencias del job `ci`.

## 7. Verificación manual contra la instalación de desarrollo

- [ ] 7.1 Correr el despliegue con una `PUBLIC_URL` deliberadamente equivocada (la del frontend) y comprobar que reporta el problema y **no** emite ✔ de funciones.
- [ ] 7.2 Correr el despliegue sin `PUBLIC_URL` y comprobar que toma `API_EXTERNAL_URL` y lo dice.
- [ ] 7.3 Comprobar que la escalada de privilegios ahora se ejecuta y reporta «bloqueada», sin `⚠`.
- [ ] 7.4 Contar filas de `auth.users` y `public.perfiles` antes y después del despliegue y confirmar que no cambian.
- [ ] 7.5 Detener el contenedor de una función, desplegar y confirmar que se reporta como problema en vez de como «exige autenticación». Volver a levantarla.

## 8. Documentación

- [ ] 8.1 Documentar en `README.md` y `docs/MANUAL_ACTUALIZACION.md` que `PUBLIC_URL` es la URL de la API y que se toma sola de `docker/.env`.
- [ ] 8.2 Añadir la entrada en `CHANGELOG.md` bajo «No publicado», señalando el cambio de comportamiento: despliegues que antes terminaban en verde sobre una instalación degradada ahora fallan.
