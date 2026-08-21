# Cumplimiento en materia de datos personales (LFPDPPP)

> **Esto no es asesoría jurídica.** Es un inventario técnico de qué resuelve el
> software y qué tiene que resolver la institución que lo despliega. Somételo a
> revisión de tu área jurídica antes de operar con datos de alumnos reales.

Aplica la **Ley Federal de Protección de Datos Personales en Posesión de los
Particulares** (LFPDPPP) o, si eres sujeto obligado, la **LGPDPPSO**. El
software no decide cuál te aplica: eso depende de la naturaleza de tu
institución.

---

## 1. Qué datos recaba el software

| Dato                      | Dónde vive                                                 | Cuándo se recaba      | Obligatorio |
| ------------------------- | ---------------------------------------------------------- | --------------------- | :---------: |
| Nombre y apellidos        | `perfiles.nombres`, `apellido_paterno`, `apellido_materno` | Alta                  |     Sí      |
| Correo electrónico        | `perfiles.correo`, `auth.users.email`                      | Alta                  |     Sí      |
| Teléfono móvil            | `perfiles.telefono_movil`                                  | Alta                  |     No      |
| Dependencia / adscripción | `perfiles.dependencia_id`                                  | Alta                  |     No      |
| Cargo                     | `perfiles.cargo`                                           | Alta                  |     No      |
| Aceptación del aviso      | `perfiles.aviso_privacidad` + `aviso_version_aceptada`     | Alta                  |     Sí      |
| Avance por lección        | `progreso`                                                 | Uso                   |      —      |
| Tiempo activo por curso   | `tiempo_curso`                                             | Uso                   |      —      |
| Intentos y calificaciones | `intentos_evaluacion`                                      | Uso                   |      —      |
| Comentarios y mensajes    | `comentarios`, `mensajes_chat`, `foro_*`                   | Uso                   |      —      |
| Telemetría de video       | `video_eventos`, `video_intervalos`                        | Uso                   |      —      |
| Eventos xAPI              | `lrs_statements`                                           | Uso                   |      —      |
| Constancias emitidas      | `constancias`                                              | Al completar un curso |      —      |

No se recaban datos **sensibles** en el sentido del art. 3 fr. VI LFPDPPP
(origen étnico, salud, creencias, preferencia sexual, etc.). Si tu
personalización añade alguno, cambian tus obligaciones: requiere consentimiento
expreso y por escrito.

---

## 2. Qué resuelve el software

| Obligación                       | Cómo                                                              | Dónde                         |
| -------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| **Acceso** y portabilidad        | RPC `exportar_mis_datos()` devuelve todo en JSON                  | Perfil → «Mis datos»          |
| **Rectificación**                | El titular edita su perfil; los campos de rol están blindados     | Perfil                        |
| **Cancelación**                  | RPC `eliminar_mis_datos('ELIMINAR MIS DATOS')`                    | Perfil → «Eliminar mis datos» |
| **Oposición**                    | Los módulos que generan telemetría se apagan por institución      | Administración → Módulos      |
| Registro del consentimiento      | `perfiles.aviso_privacidad` y `aviso_version_aceptada` en el alta | Migraciones 022 y 073         |
| Bitácora de bajas                | Tabla `bajas_titular`                                             | Migración 064                 |
| Confidencialidad entre titulares | RLS: un alumno no alcanza el correo ni el teléfono de otro        | Migración 058                 |
| Herramienta de retención         | RPC `depurar_telemetria(dias)`                                    | Migración 064                 |
| Datos en tu infraestructura      | Self-hosted completo; nada sale del servidor                      | `docker/`                     |

### La tensión entre cancelación y constancias emitidas

Una constancia en circulación es un documento con folio verificable
públicamente. Si al ejercer la cancelación se borrara la fila, el folio impreso
dejaría de verificar y su titular quedaría con un papel indistinguible de una
falsificación.

Por eso el comportamiento por defecto es **anonimizar el perfil y conservar la
constancia**. `eliminar_mis_datos` lo informa al titular en su respuesta.

Si tu criterio jurídico es otro, existe el borrado duro:

```sql
select public.eliminar_mis_datos('ELIMINAR MIS DATOS', false);
```

Decídelo **antes** de emitir la primera constancia y déjalo escrito en tu aviso.

---

## 3. Qué tiene que resolver la institución

Nada de esto lo puede hacer el software por ti.

1. **Redactar y publicar tu aviso de privacidad**, desde **Administración →
   Documentos**. Toda instalación llega con la plantilla de
   [AVISO_PRIVACIDAD.md](AVISO_PRIVACIDAD.md) ya cargada **como borrador**:
   sustituye los marcadores `{{ }}`, revísala con tu área jurídica y publícala.

   **Hasta que la publiques, el registro de nuevas cuentas está bloqueado.** Es
   deliberado: antes el enlace del formulario apuntaba a `#` y se recababa
   `perfiles.aviso_privacidad = true` contra un documento inexistente. Es
   preferible que nadie pueda registrarse a seguir acumulando consentimientos
   vacíos.

   Si ya publicas tus documentos fuera de la plataforma, pon la URL en
   `theme.config.local.js` → `footer.columns` y esa manda (ver THEMING.md).

2. **Designar al responsable / departamento de datos personales** y publicar un
   canal real para ejercer derechos ARCO.
3. **Fijar el plazo de conservación** y agendarlo:
   ```sql
   select cron.schedule('depurar-telemetria', '0 3 * * 0',
     'select public.depurar_telemetria(730)');   -- 730 días = 2 años
   ```
   El software no agenda nada por su cuenta: el plazo es una decisión tuya.
4. **Determinar la base de licitud** del tratamiento (relación laboral,
   obligación normativa de capacitación, consentimiento…).
5. **Evaluar si procede un aviso simplificado** en el formulario de alta además
   del integral.
6. **Registrar tus medidas de seguridad** (art. 19 LFPDPPP): quién tiene acceso
   al servidor, cómo se cifran los respaldos de `backups/`, qué pasa con las
   llaves.
7. **Definir el procedimiento ante vulneraciones** y quién notifica.

---

## 4. Lo que todavía no está resuelto

Con honestidad, para que no te sorprenda en una auditoría:

- **No hay pantalla de administración de solicitudes ARCO.** El titular ejerce
  sus derechos por sí mismo desde su perfil; si alguien los ejerce por escrito,
  el trámite es manual.
- **Los respaldos de `backups/` no se cifran.** `scripts/deploy.sh` los deja en
  claro en el servidor. Cífralos y controla su acceso.
- **No hay bitácora de accesos administrativos.** No queda registro de qué
  administrador consultó el padrón ni cuándo.
- **El aviso es una plantilla, no un documento válido.** Requiere revisión
  jurídica y datos de tu institución.
- **La accesibilidad no está completa** (ver el apartado correspondiente del
  README): si eres sujeto obligado, revisa también tus obligaciones en esa
  materia.
