# Spec: Fase I — Notificaciones y Alertas Automáticas (v0.13.0)

**Fecha:** 2026-07-07  
**Estado:** Aprobado para implementación  
**Scope:** In-app notifications + push + email para 11 eventos del LMS  
**Feature flag:** `notificaciones`

---

## 1. Objetivos

1. Notificar a alumnos e instructores de eventos relevantes en tiempo real.
2. Proveer un historial persistente de notificaciones leídas/no leídas.
3. Permitir al admin configurar canales (push/email/in-app) y plantillas por tipo.
4. Reutilizar la infraestructura de push existente (`push_subscriptions`, `push-notify`).
5. Implementar envío de email vía Resend API (configurable por admin).

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Notification│  │ Notification │  │   Email Settings  │   │
│  │   Bell      │  │   Panel      │  │      (Admin)      │   │
│  │  (badge)    │  │  (historial) │  │                   │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────┘   │
│         │                │                                    │
│         └────────────────┘                                    │
│                   │                                          │
│         ┌─────────▼──────────┐                              │
│         │   composable:      │                              │
│         │  useNotificaciones │                              │
│         └─────────┬──────────┘                              │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (Postgres)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ notificaciones│  │  notificacion │  │    email     │      │
│  │   (cola)     │  │   plantillas  │  │  configuracion│     │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                    │
│         │  Triggers: INSERT → notificar                      │
│         └────────────────────────────────────────────────    │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION: notifications-worker             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Leer cola  │  │  Enviar push │  │ Enviar email │      │
│  │  (pending)   │  │  (web-push)  │  │  (Resend)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                                                    │
│         │  Cron: cada 1 minuto                               │
│         └────────────────────────────────────────────────    │
└─────────────────────────────────────────────────────────────┘
```

### Flujo

1. **Trigger PostgreSQL** detecta cambio relevante → inserta `notificaciones` estado `pending`.
2. **Edge Function `notifications-worker`** (cron cada 1 minuto) lee `pending`, envía push/email según configuración.
3. **Frontend** lee `notificaciones` vía `useNotificaciones` para badge + panel historial.
4. **Admin** configura plantillas y canales en panel dedicado.

---

## 3. Esquema de Datos

### 3.1 Tabla `notificaciones`

```sql
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id),
  tipo text not null check (tipo in (
    'curso_asignado',
    'evaluacion_calificada',
    'entrega_companero',
    'deadline_proximo',
    'badge_desbloqueado',
    'foro_respuesta',
    'anuncio_instructor',
    'certificacion_lista',
    'reporte_listo',
    'alerta_riesgo',
    'sla_respuesta'
  )),
  titulo text not null,
  cuerpo text not null,
  datos jsonb default '{}',
  canal text not null default 'push' check (canal in ('push', 'email', 'in_app', 'all')),
  estado text not null default 'pending' check (estado in ('pending', 'sent', 'failed')),
  leido boolean not null default false,
  enviado_en timestamptz,
  creado_en timestamptz not null default now()
);

create index idx_notificaciones_usuario on notificaciones(usuario_id, creado_en desc);
create index idx_notificaciones_estado on notificaciones(estado) where estado = 'pending';

comment on table public.notificaciones is 'Cola de notificaciones con estado pendiente/sent/failed';
```

**RLS:**

```sql
alter table notificaciones enable row level security;
create policy "notificaciones_own" on notificaciones
  for all to authenticated using (usuario_id = auth.uid());
```

### 3.2 Tabla `notificacion_plantillas`

```sql
create table public.notificacion_plantillas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null unique,
  asunto text,
  titulo_template text not null,
  cuerpo_template text not null,
  canal_default text not null default 'push' check (canal_default in ('push', 'email', 'in_app', 'all')),
  activa boolean not null default true
);

comment on table public.notificacion_plantillas is 'Plantillas de notificación por tipo de evento';
```

**RLS:** Solo lectura para authenticated; escritura para admin.

### 3.3 Tabla `email_configuracion` (singleton)

```sql
create table public.email_configuracion (
  id int primary key default 1 check (id = 1),
  proveedor text not null default 'resend' check (proveedor in ('resend', 'smtp', 'sendgrid')),
  api_key text,
  remitente_email text not null default 'noreply@cursos-amx.local',
  remitente_nombre text not null default 'Cursos AMX',
  activo boolean not null default false
);

comment on table public.email_configuracion is 'Configuración global de envío de email (fila única)';
```

**RLS:** Solo lectura para authenticated; escritura para admin.

### 3.4 Tabla `notificacion_preferencias` (por usuario)

```sql
create table public.notificacion_preferencias (
  usuario_id uuid primary key references public.usuarios(id),
  silenciados text[] not null default '{}',
  canal_default text not null default 'all' check (canal_default in ('push', 'email', 'in_app', 'all')),
  updated_at timestamptz not null default now()
);

comment on table public.notificacion_preferencias is 'Preferencias de notificación por usuario';
```

**RLS:**

```sql
create policy "notificacion_preferencias_own" on notificacion_preferencias
  for all to authenticated using (usuario_id = auth.uid());
```

---

## 4. Eventos y Triggers

### 4.1 Eventos con trigger PostgreSQL

| #   | Evento                  | Tabla/condición                                                       | Canal default |
| --- | ----------------------- | --------------------------------------------------------------------- | ------------- |
| 1   | `curso_asignado`        | `INSERT` en `inscripciones`                                           | `all`         |
| 2   | `evaluacion_calificada` | `UPDATE` en `evaluacion_intentos` (estado=`calificado`)               | `all`         |
| 3   | `entrega_companero`     | `INSERT` en `evaluacion_intentos` (evaluación grupal, otros miembros) | `push`        |
| 4   | `badge_desbloqueado`    | `INSERT` en `usuarios_badges`                                         | `push`        |
| 5   | `foro_respuesta`        | `INSERT` en `foro_respuestas` (autor del hilo original)               | `push`        |
| 6   | `anuncio_instructor`    | `INSERT` en `anuncios` (nueva tabla)                                  | `all`         |
| 7   | `certificacion_lista`   | `UPDATE` en `inscripciones` (estado=`completado`)                     | `all`         |
| 8   | `reporte_listo`         | `UPDATE` en `reportes_historial` (estado=`completado`)                | `email`       |

### 4.2 Eventos con cron (no trigger)

| #   | Evento             | Frecuencia   | Canal default |
| --- | ------------------ | ------------ | ------------- |
| 9   | `deadline_proximo` | Diario 08:00 | `email`       |
| 10  | `alerta_riesgo`    | Diario 09:00 | `email`       |
| 11  | `sla_respuesta`    | Diario 09:00 | `email`       |

### 4.3 Trigger ejemplo (evaluación calificada)

```sql
create or replace function notificar_evaluacion_calificada()
returns trigger as $$
declare
  v_curso_nombre text;
  v_evaluacion_nombre text;
begin
  select c.titulo, e.titulo into v_curso_nombre, v_evaluacion_nombre
  from cursos c
  join evaluaciones e on e.curso_id = c.id
  where e.id = new.evaluacion_id;

  insert into notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
  values (
    new.usuario_id,
    'evaluacion_calificada',
    'Evaluación calificada',
    format('Tu evaluación "%s" en "%s" ha sido calificada con %s',
           v_evaluacion_nombre, v_curso_nombre, new.calificacion),
    jsonb_build_object(
      'evaluacion_id', new.evaluacion_id,
      'curso_id', new.curso_id,
      'calificacion', new.calificacion
    ),
    'all'
  );
  return new;
end;
$$ language plpgsql;

create trigger tr_evaluacion_calificada
after update of estado, calificacion on public.evaluacion_intentos
for each row when (new.estado = 'calificado' and old.estado != 'calificado')
execute function notificar_evaluacion_calificada();
```

---

## 5. Edge Function: `notifications-worker`

### 5.1 Responsabilidades

- Leer notificaciones `pending` (batch de 50).
- Para cada notificación, determinar canal según preferencias del usuario + configuración global.
- Enviar push (reutilizando lógica existente de `push-notify`).
- Enviar email (vía Resend API).
- Actualizar estado a `sent` o `failed` + timestamp.

### 5.2 Pseudocódigo

```typescript
// notifications-worker/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Leer pending
  const { data: notifs } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('estado', 'pending')
    .limit(50)
    .order('creado_en')

  for (const n of notifs || []) {
    // 2. Cargar preferencias
    const { data: pref } = await supabase
      .from('notificacion_preferencias')
      .select('*')
      .eq('usuario_id', n.usuario_id)
      .single()

    if (pref?.silenciados?.includes(n.tipo)) {
      await supabase.from('notificaciones').update({ estado: 'sent' }).eq('id', n.id)
      continue
    }

    const canal = n.canal === 'all' ? pref?.canal_default || 'in_app' : n.canal

    // 3. Enviar según canal
    let ok = true
    if (canal === 'push' || canal === 'all') {
      ok = ok && (await enviarPush(supabase, n))
    }
    if (canal === 'email' || canal === 'all') {
      ok = ok && (await enviarEmail(supabase, n))
    }

    // 4. Actualizar estado
    await supabase
      .from('notificaciones')
      .update({
        estado: ok ? 'sent' : 'failed',
        enviado_en: new Date().toISOString(),
      })
      .eq('id', n.id)
  }

  return new Response('OK', { status: 200 })
})
```

### 5.3 Envío de email

```typescript
async function enviarEmail(supabase, notificacion) {
  const { data: config } = await supabase.from('email_configuracion').select('*').single()
  if (!config?.activo || !config.api_key) return false

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${config.remitente_nombre} <${config.remitente_email}>`,
      to: notificacion.usuario_email, // joined from usuarios
      subject: notificacion.titulo,
      html: `<p>${notificacion.cuerpo}</p>`,
    }),
  })

  return res.ok
}
```

### 5.4 Cron schedule

```sql
select cron.schedule('notifications-worker', '* * * * *', $$
  select net.http_get(
    url := 'https://<project>.supabase.co/functions/v1/notifications-worker',
    headers := jsonb_build_object('Authorization', 'Bearer <anon-key>')
  );
$$);
```

---

## 6. Composable: `useNotificaciones.js`

```javascript
export function useNotificaciones() {
  const notificaciones = ref([])
  const unreadCount = computed(() => notificaciones.value.filter((n) => !n.leido).length)
  const loading = ref(false)

  async function cargarNotificaciones() {
    loading.value = true
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(50)
    notificaciones.value = data || []
    loading.value = false
  }

  async function marcarLeida(id) {
    await supabase.from('notificaciones').update({ leido: true }).eq('id', id)
    const n = notificaciones.value.find((x) => x.id === id)
    if (n) n.leido = true
  }

  async function marcarTodasLeidas() {
    await supabase.from('notificaciones').update({ leido: true }).eq('leido', false)
    notificaciones.value.forEach((n) => (n.leido = true))
  }

  // Suscripción en tiempo real
  onMounted(() => {
    const channel = supabase
      .channel('notificaciones')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          notificaciones.value.unshift(payload.new)
        }
      )
      .subscribe()

    cargarNotificaciones()

    return () => {
      supabase.removeChannel(channel)
    }
  })

  return {
    notificaciones,
    unreadCount,
    loading,
    cargarNotificaciones,
    marcarLeida,
    marcarTodasLeidas,
  }
}
```

---

## 7. Componentes UI

### 7.1 `NotificationBell.vue`

- Icono de campana con badge rojo (`unreadCount`).
- Dropdown con últimas 5 notificaciones al hacer click.
- Link "Ver todas" → abre `NotificationPanel`.

### 7.2 `NotificationPanel.vue`

- Panel lateral/drawer con historial completo.
- Filtros: todas / no leídas / por tipo.
- Botón "Marcar todas como leídas".
- Agrupación por fecha (Hoy, Ayer, Anteriores).
- Click en notificación marca como leída y navega al recurso (curso, evaluación, foro).

### 7.3 `NotificationPreferences.vue`

- Checklist por tipo de notificación: activar/desactivar.
- Selector de canal default por tipo (push/email/in-app/all).
- Guardado automático (debounce).

### 7.4 `AdminNotificaciones.vue`

- Panel admin para configurar:
  - **Plantillas:** editor de asunto/título/cuerpo con preview de variables.
  - **Canales globales:** toggle por tipo (activar/desactivar push o email).
  - **Configuración email:** proveedor, API key, remitente, test email.
  - **Preferencias por defecto** para nuevos usuarios.

---

## 8. Feature Flags

```typescript
// lib/featureFlags.ts
notificaciones: flag('VITE_FEATURE_NOTIFICACIONES'),
notificaciones_email: flag('VITE_FEATURE_NOTIFICACIONES_EMAIL'),
```

- `notificaciones` — Maestro. Si `false`, todo el sistema de notificaciones está oculto.
- `notificaciones_email` — Sub-flag para habilitar el canal de email.

---

## 9. Testing Strategy

| Componente                | Tests                                                   |
| ------------------------- | ------------------------------------------------------- |
| `useNotificaciones`       | cargar, marcar leída, unreadCount, suscripción realtime |
| `NotificationBell`        | renderiza badge, dropdown toggle                        |
| `NotificationPanel`       | renderiza lista, marca leídas, filtros                  |
| `NotificationPreferences` | cambia preferencias, guarda                             |
| Triggers SQL              | Verificar que insertan notificación en evento esperado  |
| Edge Function             | Mock de Supabase + fetch para probar envío push/email   |

---

## 10. Dependencias

- **Nuevas:**
  - `resend` (Node.js SDK para email) — en Edge Function
  - `@supabase/supabase-js` ya presente
- **Ya existentes reutilizadas:**
  - `push_subscriptions` (tabla)
  - `push-notify` (Edge Function — lógica de envío push)
  - Supabase Realtime (suscripciones)

---

## 11. Migraciones SQL

**Migration 051:** `notificaciones.sql`

- Crear tablas: `notificaciones`, `notificacion_plantillas`, `email_configuracion`, `notificacion_preferencias`, `anuncios`
- Insertar plantillas default para los 11 tipos
- Crear triggers para 8 eventos
- Configurar cron para `notifications-worker`
- RLS policies

---

## 12. Plan de rollout

1. **Schema + triggers** (Task 1)
2. **Edge Function `notifications-worker`** (Task 2)
3. **Servicio `notificaciones.js`** (Task 3)
4. **Composable `useNotificaciones.js`** (Task 4)
5. **Componentes UI** (Tasks 5-8)
6. **Integración en App.vue/TopNav** (Task 9)
7. **Tests** (Task 10)
8. **Verificación y release v0.13.0** (Task 11)

---

## 13. Notas

- **Anuncios:** Se necesita crear tabla `anuncios` (id, curso_id, titulo, cuerpo, instructor_id, creado_en). Es una feature simple que solo los instructores usan.
- **Email API key:** Se almacena en `email_configuracion` pero el frontend NUNCA la lee. Solo el Edge Function con `service_role` la usa.
- **Dedup:** El trigger `evaluacion_calificada` usa `WHEN (new.estado = 'calificado' and old.estado != 'calificado')` para evitar duplicados.
- **Rate limiting:** El worker procesa máximo 50 notificaciones por minuto. Si hay más, las deja para la siguiente ejecución.
- **Evaluaciones grupales:** El evento `entrega_companero` requiere que `evaluaciones` tenga un campo `es_grupal` (boolean) y una tabla `evaluacion_grupos` (evaluacion_id, usuario_id). Si no existen, este evento se omite en la migration.
- **Fallback canal:** Si `canal === 'all'` y el usuario no tiene preferencias, se usa `in_app` (garantizado disponible) en lugar de `push` (requiere suscripción).
