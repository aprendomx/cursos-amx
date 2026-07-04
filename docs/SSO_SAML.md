# SSO / SAML — Guía de configuración

Supabase Auth (GoTrue) soporta SAML 2.0 para autenticación federada. Esto permite que los alumnos e instructores inicien sesión con las credenciales de su institución (Active Directory, Azure AD, Google Workspace, etc.) sin crear una cuenta local.

## Requisitos

- Supabase self-hosted con GoTrue v2.186.0+ (la versión en `docker/docker-compose.yml` ya lo incluye)
- Certificado X.509 y clave privada para firmar las solicitudes SAML
- Metadata XML del IdP (Identity Provider) de tu institución

## Pasos de configuración

### 1. Generar par de claves SAML

```bash
openssl req -x509 -newkey rsa:2048 -keyout saml.key -out saml.crt -days 365 -nodes -subj "/CN=cursos-amx"
```

Guarda `saml.key` y `saml.crt` de forma segura (Kubernetes secret o Docker secret).

### 2. Configurar GoTrue en `docker/.env`

```bash
# Habilitar SAML
GOTRUE_SAML_ENABLED=true

# Ruta al certificado y clave (montados como volúmenes en el contenedor auth)
GOTRUE_SAML_PRIVATE_KEY=/var/run/secrets/saml.key
GOTRUE_SAML_ALLOW_ENCRYPTED_ASSERTIONS=true

# URL pública de tu plataforma (sin trailing slash)
GOTRUE_SAML_EXTERNAL_URL=https://cursos.tu-dominio.mx

# Duración de la sesión SAML relay state
GOTRUE_SAML_RELAY_STATE_VALIDITY_PERIOD=600
```

### 3. Montar certificados en docker-compose.yml

En el bloque `auth` del `docker-compose.yml`, añade:

```yaml
volumes:
  - ./secrets/saml.crt:/var/run/secrets/saml.crt:ro
  - ./secrets/saml.key:/var/run/secrets/saml.key:ro
```

### 4. Registrar el IdP en Supabase

Usa la API REST de GoTrue para registrar tu Identity Provider. Ejemplo con curl:

```bash
curl -X POST https://api.tu-dominio.mx/auth/v1/admin/saml/providers \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Institucion-AD",
    "metadata_xml": "<EntityDescriptor ...>...</EntityDescriptor>",
    "attribute_mapping": {
      "keys": {
        "email": {"name": "email", "name_format": "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"},
        "name": {"name": "givenName", "name_format": "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"}
      }
    }
  }'
```

También puedes pasar `metadata_url` en lugar de `metadata_xml` si tu IdP publica un endpoint de metadata.

### 5. Añadir botón "Iniciar sesión con institución" en el frontend

En `src/pages/LoginPage.vue`, añade:

```vue
<button class="btn btn-secondary" @click="loginSaml">
  Iniciar sesión con institución
</button>
```

```javascript
async function loginSaml() {
  const { data, error } = await supabase.auth.signInWithSSO({
    providerId: 'saml-provider-id',
  })
  if (error) console.error(error)
  else window.location.href = data.url
}
```

### 6. Mapeo de atributos al perfil

El atributo `email` del SAML se usa para buscar/crear el registro en `auth.users`. Si el usuario no existe, Supabase lo crea automáticamente.

Recomendación: añade un trigger en Postgres que complete `public.perfiles` cuando `auth.users` se crea por SAML, copiando los atributos mapeados (nombre, dependencia, etc.) si vienen en la aserción.

### 7. Troubleshooting

| Síntoma                   | Causa probable                           | Solución                                                                                                     |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "SAML not enabled"        | `GOTRUE_SAML_ENABLED` no está en `true`  | Revisa `.env` y reinicia el contenedor `auth`                                                                |
| "Invalid signature"       | El certificado del IdP no coincide       | Verifica que montaste el metadata XML correcto                                                               |
| "Relay state expired"     | El usuario tardó demasiado en autenticar | Aumenta `GOTRUE_SAML_RELAY_STATE_VALIDITY_PERIOD`                                                            |
| Usuario creado sin perfil | Falta el trigger de `handle_new_user`    | Asegúrate que la migración `022_handle_new_user.sql` está aplicada y que el trigger maneja campos opcionales |

### Referencias

- [Supabase SAML Docs](https://supabase.com/docs/guides/auth/sso/auth-sso-saml)
- [GoTrue SAML Environment Variables](https://github.com/supabase/gotrue/blob/main/example.env)
