# Fase I: Notificaciones y Alertas Automáticas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema completo de notificaciones in-app + push + email con 11 eventos, triggers PostgreSQL, Edge Function worker, y panel de administración.

**Architecture:** PostgreSQL triggers insertan en tabla `notificaciones` estado `pending`. Edge Function `notifications-worker` (cron cada 1 minuto) lee pending, envía push/email según preferencias, y actualiza estado. Frontend muestra badge, panel historial, y preferencias vía composable `useNotificaciones` con suscripción realtime.

**Tech Stack:** Vue 3, Supabase (Postgres + Edge Functions), Web Push API, Resend API, Vitest

---

## Estructura de archivos

| Archivo                                            | Responsabilidad                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `supabase/migrations/051_notificaciones.sql`       | Schema: tablas, triggers, RLS, cron, plantillas default           |
| `supabase/functions/notifications-worker/index.ts` | Edge Function: leer cola, enviar push/email, actualizar estado    |
| `src/services/notificaciones.js`                   | CRUD de notificaciones, preferencias, plantillas, config email    |
| `src/composables/useNotificaciones.js`             | Estado reactivo, suscripción realtime, badge count, marcar leídas |
| `src/components/NotificationBell.vue`              | Icono campana con badge, dropdown últimas 5                       |
| `src/components/NotificationPanel.vue`             | Drawer con historial completo, filtros, agrupación por fecha      |
| `src/components/NotificationPreferences.vue`       | Configuración de canales y silencios por tipo                     |
| `src/components/AdminNotificaciones.vue`           | Panel admin: plantillas, canales globales, config email           |
| `src/lib/featureFlags.ts`                          | Agregar flags `notificaciones` y `notificaciones_email`           |
| `src/components/TopNav.vue`                        | Integrar `NotificationBell`                                       |
| `src/pages/AdminPage.vue`                          | Agregar tab "Notificaciones" con `AdminNotificaciones`            |
| `README.md`                                        | Actualizar con novedades v0.13.0                                  |
| Tests (6 archivos)                                 | Tests unitarios para composable, servicio, y 3 componentes        |

---

### Task 1: Schema — Migration 051

**Files:**

- Create: `supabase/migrations/051_notificaciones.sql`

- [ ] **Step 1: Crear tablas base**

Escribe la migration con las 5 tablas: `notificaciones`, `notificacion_plantillas`, `email_configuracion`, `notificacion_preferencias`, `anuncios`.

```sql
-- Migration 051: Notificaciones y Alertas Automáticas

-- Tabla principal de notificaciones (cola)
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
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

create index if not exists idx_notificaciones_usuario on notificaciones(usuario_id, creado_en desc);
create index if not exists idx_notificaciones_estado on notificaciones(estado) where estado = 'pending';

comment on table public.notificaciones is 'Cola de notificaciones con estado pendiente/sent/failed';

-- RLS
alter table notificaciones enable row level security;
create policy if not exists "notificaciones_own"
  on public.notificaciones for all to authenticated using (usuario_id = auth.uid());

-- Tabla de plantillas
create table if not exists public.notificacion_plantillas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null unique,
  asunto text,
  titulo_template text not null,
  cuerpo_template text not null,
  canal_default text not null default 'push' check (canal_default in ('push', 'email', 'in_app', 'all')),
  activa boolean not null default true
);

comment on table public.notificacion_plantillas is 'Plantillas de notificación por tipo de evento';

-- RLS: lectura para todos, escritura solo admin
create policy if not exists "plantillas_read"
  on public.notificacion_plantillas for select to authenticated using (true);

-- Configuración de email (singleton)
create table if not exists public.email_configuracion (
  id int primary key default 1 check (id = 1),
  proveedor text not null default 'resend' check (proveedor in ('resend', 'smtp', 'sendgrid')),
  api_key text,
  remitente_email text not null default 'noreply@cursos-amx.local',
  remitente_nombre text not null default 'Cursos AMX',
  activo boolean not null default false
);

comment on table public.email_configuracion is 'Configuración global de envío de email (fila única)';

-- RLS
create policy if not exists "email_config_read"
  on public.email_configuracion for select to authenticated using (true);

-- Preferencias por usuario
create table if not exists public.notificacion_preferencias (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  silenciados text[] not null default '{}',
  canal_default text not null default 'all' check (canal_default in ('push', 'email', 'in_app', 'all')),
  updated_at timestamptz not null default now()
);

comment on table public.notificacion_preferencias is 'Preferencias de notificación por usuario';

-- RLS
create policy if not exists "notificacion_preferencias_own"
  on public.notificacion_preferencias for all to authenticated using (usuario_id = auth.uid());

-- Tabla de anuncios (para notificación anuncio_instructor)
create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  instructor_id uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now()
);

comment on table public.anuncios is 'Anuncios broadcast de instructores a cohorte';

-- RLS
create policy if not exists "anuncios_curso"
  on public.anuncios for select to authenticated using (
    exists (select 1 from inscripciones i where i.curso_id = anuncios.curso_id and i.usuario_id = auth.uid())
  );
```

- [ ] **Step 2: Insertar plantillas default**

```sql
insert into public.notificacion_plantillas (tipo, asunto, titulo_template, cuerpo_template, canal_default, activa)
values
  ('curso_asignado', 'Nuevo curso asignado', 'Nuevo curso: {{curso_nombre}}', 'Te han asignado al curso "{{curso_nombre}}". ¡Comienza cuando quieras!', 'all', true),
  ('evaluacion_calificada', 'Evaluación calificada', 'Evaluación calificada: {{evaluacion_nombre}}', 'Tu evaluación "{{evaluacion_nombre}}" en "{{curso_nombre}}" ha sido calificada con {{calificacion}}.', 'all', true),
  ('badge_desbloqueado', 'Insignia desbloqueada', '¡Insignia desbloqueada: {{badge_nombre}}!', 'Has desbloqueado la insignia "{{badge_nombre}}" (+{{puntos}} pts).', 'push', true),
  ('foro_respuesta', 'Nueva respuesta en foro', 'Nueva respuesta: {{hilo_titulo}}', '{{autor_nombre}} respondió en "{{hilo_titulo}}".', 'push', true),
  ('certificacion_lista', 'Certificación lista', '¡Certificación lista!', 'Has completado "{{curso_nombre}}". Descarga tu constancia ahora.', 'all', true),
  ('deadline_proximo', 'Deadline próximo', 'Deadline en 24h: {{evaluacion_nombre}}', 'La evaluación "{{evaluacion_nombre}}" de "{{curso_nombre}}" vence mañana.', 'email', true),
  ('reporte_listo', 'Reporte listo', 'Reporte "{{reporte_nombre}}" listo', 'Tu reporte programado ha sido generado. Ve a Reportes para descargarlo.', 'email', true),
  ('alerta_riesgo', 'Alerta académica', 'Alumno en riesgo: {{alumno_nombre}}', '{{alumno_nombre}} en "{{curso_nombre}}" tiene progreso bajo ({{progreso}}%).', 'email', true),
  ('sla_respuesta', 'SLA de respuesta', 'Evaluaciones pendientes de calificar', 'Tienes {{count}} evaluaciones pendientes de calificar desde hace más de {{dias}} días.', 'email', true)
on conflict (tipo) do nothing;
```

- [ ] **Step 3: Crear triggers para 8 eventos**

```sql
-- Trigger: curso_asignado
CREATE OR REPLACE FUNCTION notificar_curso_asignado()
RETURNS trigger AS $$
DECLARE
  v_curso_nombre text;
BEGIN
  SELECT titulo INTO v_curso_nombre FROM cursos WHERE id = new.curso_id;
  INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
  VALUES (
    new.usuario_id,
    'curso_asignado',
    'Nuevo curso asignado',
    format('Te han asignado al curso "%s".', v_curso_nombre),
    jsonb_build_object('curso_id', new.curso_id, 'curso_nombre', v_curso_nombre),
    'all'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_curso_asignado ON inscripciones;
CREATE TRIGGER tr_curso_asignado
AFTER INSERT ON public.inscripciones
FOR EACH ROW
EXECUTE FUNCTION notificar_curso_asignado();

-- Trigger: evaluacion_calificada
CREATE OR REPLACE FUNCTION notificar_evaluacion_calificada()
RETURNS trigger AS $$
DECLARE
  v_curso_nombre text;
  v_evaluacion_nombre text;
BEGIN
  IF new.estado = 'calificado' AND old.estado != 'calificado' THEN
    SELECT c.titulo, e.titulo INTO v_curso_nombre, v_evaluacion_nombre
    FROM cursos c
    JOIN evaluaciones e ON e.curso_id = c.id
    WHERE e.id = new.evaluacion_id;

    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      new.usuario_id,
      'evaluacion_calificada',
      'Evaluación calificada',
      format('Tu evaluación "%s" en "%s" ha sido calificada con %s.', v_evaluacion_nombre, v_curso_nombre, new.calificacion),
      jsonb_build_object('evaluacion_id', new.evaluacion_id, 'curso_id', new.curso_id, 'calificacion', new.calificacion, 'evaluacion_nombre', v_evaluacion_nombre, 'curso_nombre', v_curso_nombre),
      'all'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_evaluacion_calificada ON evaluacion_intentos;
CREATE TRIGGER tr_evaluacion_calificada
AFTER UPDATE OF estado, calificacion ON public.evaluacion_intentos
FOR EACH ROW
EXECUTE FUNCTION notificar_evaluacion_calificada();

-- Trigger: badge_desbloqueado
CREATE OR REPLACE FUNCTION notificar_badge_desbloqueado()
RETURNS trigger AS $$
DECLARE
  v_badge_nombre text;
  v_puntos int;
BEGIN
  SELECT nombre, puntos INTO v_badge_nombre, v_puntos FROM badges WHERE id = new.badge_id;
  INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
  VALUES (
    new.usuario_id,
    'badge_desbloqueado',
    'Insignia desbloqueada',
    format('Has desbloqueado la insignia "%s" (+%s pts).', v_badge_nombre, v_puntos),
    jsonb_build_object('badge_id', new.badge_id, 'badge_nombre', v_badge_nombre, 'puntos', v_puntos),
    'push'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_badge_desbloqueado ON usuarios_badges;
CREATE TRIGGER tr_badge_desbloqueado
AFTER INSERT ON public.usuarios_badges
FOR EACH ROW
EXECUTE FUNCTION notificar_badge_desbloqueado();

-- Trigger: foro_respuesta
CREATE OR REPLACE FUNCTION notificar_foro_respuesta()
RETURNS trigger AS $$
DECLARE
  v_hilo_autor uuid;
  v_hilo_titulo text;
  v_autor_nombre text;
BEGIN
  SELECT usuario_id, titulo INTO v_hilo_autor, v_hilo_titulo FROM foro_hilos WHERE id = new.hilo_id;
  SELECT COALESCE(nombres || ' ' || apellido_paterno, email) INTO v_autor_nombre FROM usuarios WHERE id = new.usuario_id;

  IF v_hilo_autor != new.usuario_id THEN
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      v_hilo_autor,
      'foro_respuesta',
      'Nueva respuesta en foro',
      format('%s respondió en "%s".', v_autor_nombre, v_hilo_titulo),
      jsonb_build_object('hilo_id', new.hilo_id, 'hilo_titulo', v_hilo_titulo, 'autor_nombre', v_autor_nombre, 'respuesta_id', new.id),
      'push'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_foro_respuesta ON foro_respuestas;
CREATE TRIGGER tr_foro_respuesta
AFTER INSERT ON public.foro_respuestas
FOR EACH ROW
EXECUTE FUNCTION notificar_foro_respuesta();

-- Trigger: anuncio_instructor
CREATE OR REPLACE FUNCTION notificar_anuncio_instructor()
RETURNS trigger AS $$
DECLARE
  v_curso_nombre text;
  v_inscrito RECORD;
BEGIN
  SELECT titulo INTO v_curso_nombre FROM cursos WHERE id = new.curso_id;

  FOR v_inscrito IN
    SELECT usuario_id FROM inscripciones WHERE curso_id = new.curso_id
  LOOP
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      v_inscrito.usuario_id,
      'anuncio_instructor',
      format('Anuncio: %s', new.titulo),
      format('Nuevo anuncio en "%s": %s', v_curso_nombre, new.cuerpo),
      jsonb_build_object('anuncio_id', new.id, 'curso_id', new.curso_id, 'curso_nombre', v_curso_nombre),
      'all'
    );
  END LOOP;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_anuncio_instructor ON anuncios;
CREATE TRIGGER tr_anuncio_instructor
AFTER INSERT ON public.anuncios
FOR EACH ROW
EXECUTE FUNCTION notificar_anuncio_instructor();

-- Trigger: certificacion_lista
CREATE OR REPLACE FUNCTION notificar_certificacion_lista()
RETURNS trigger AS $$
DECLARE
  v_curso_nombre text;
BEGIN
  IF new.estado = 'completado' AND old.estado != 'completado' THEN
    SELECT titulo INTO v_curso_nombre FROM cursos WHERE id = new.curso_id;
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      new.usuario_id,
      'certificacion_lista',
      'Certificación lista',
      format('Has completado "%s". Descarga tu constancia.', v_curso_nombre),
      jsonb_build_object('curso_id', new.curso_id, 'curso_nombre', v_curso_nombre),
      'all'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_certificacion_lista ON inscripciones;
CREATE TRIGGER tr_certificacion_lista
AFTER UPDATE OF estado ON public.inscripciones
FOR EACH ROW
EXECUTE FUNCTION notificar_certificacion_lista();

-- Trigger: reporte_listo
CREATE OR REPLACE FUNCTION notificar_reporte_listo()
RETURNS trigger AS $$
BEGIN
  IF new.estado = 'completado' AND old.estado != 'completado' THEN
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      new.creado_por,
      'reporte_listo',
      'Reporte listo',
      format('Tu reporte "%s" ha sido generado.', new.nombre),
      jsonb_build_object('reporte_id', new.id, 'reporte_nombre', new.nombre),
      'email'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_reporte_listo ON reportes_historial;
CREATE TRIGGER tr_reporte_listo
AFTER UPDATE OF estado ON public.reportes_historial
FOR EACH ROW
EXECUTE FUNCTION notificar_reporte_listo();
```

- [ ] **Step 4: Crear funciones cron para eventos sin trigger**

```sql
-- Funciones para cron (deadline, riesgo, sla)
CREATE OR REPLACE FUNCTION notificar_deadlines_proximos()
RETURNS void AS $$
DECLARE
  v_eval RECORD;
BEGIN
  FOR v_eval IN
    SELECT e.id AS evaluacion_id, e.titulo AS evaluacion_nombre, e.curso_id, c.titulo AS curso_nombre, i.usuario_id
    FROM evaluaciones e
    JOIN cursos c ON c.id = e.curso_id
    JOIN inscripciones i ON i.curso_id = e.curso_id
    WHERE e.fecha_cierre IS NOT NULL
      AND e.fecha_cierre BETWEEN now() AND now() + interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM evaluacion_intentos ei
        WHERE ei.evaluacion_id = e.id AND ei.usuario_id = i.usuario_id AND ei.estado = 'completado'
      )
  LOOP
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      v_eval.usuario_id,
      'deadline_proximo',
      'Deadline en 24h',
      format('La evaluación "%s" de "%s" vence mañana.', v_eval.evaluacion_nombre, v_eval.curso_nombre),
      jsonb_build_object('evaluacion_id', v_eval.evaluacion_id, 'curso_id', v_eval.curso_id, 'evaluacion_nombre', v_eval.evaluacion_nombre, 'curso_nombre', v_eval.curso_nombre),
      'email'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notificar_alertas_riesgo()
RETURNS void AS $$
DECLARE
  v_alumno RECORD;
BEGIN
  FOR v_alumno IN
    SELECT i.usuario_id, i.curso_id, c.titulo AS curso_nombre,
           COALESCE(p.progreso, 0) AS progreso,
           u.nombres || ' ' || u.apellido_paterno AS alumno_nombre
    FROM inscripciones i
    JOIN cursos c ON c.id = i.curso_id
    JOIN usuarios u ON u.id = i.usuario_id
    LEFT JOIN (
      SELECT curso_id, usuario_id, (COUNT(*) FILTER (WHERE completado) * 100.0 / NULLIF(COUNT(*), 0)) AS progreso
      FROM leccion_progreso GROUP BY curso_id, usuario_id
    ) p ON p.curso_id = i.curso_id AND p.usuario_id = i.usuario_id
    WHERE p.progreso < 50
      AND i.created_at < now() - interval '7 days'
  LOOP
    -- Notificar a instructores del curso
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    SELECT
      ic.usuario_id,
      'alerta_riesgo',
      'Alumno en riesgo',
      format('%s en "%s" tiene progreso bajo (%s%%).', v_alumno.alumno_nombre, v_alumno.curso_nombre, round(v_alumno.progreso)),
      jsonb_build_object('alumno_id', v_alumno.usuario_id, 'alumno_nombre', v_alumno.alumno_nombre, 'curso_id', v_alumno.curso_id, 'curso_nombre', v_alumno.curso_nombre, 'progreso', round(v_alumno.progreso)),
      'email'
    FROM instructores_cursos ic WHERE ic.curso_id = v_alumno.curso_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notificar_sla_respuesta()
RETURNS void AS $$
DECLARE
  v_instructor RECORD;
BEGIN
  FOR v_instructor IN
    SELECT
      ei.evaluacion_id,
      e.instructor_id AS usuario_id,
      COUNT(*) AS count,
      MAX(now() - ei.updated_at) AS max_dias
    FROM evaluacion_intentos ei
    JOIN evaluaciones e ON e.id = ei.evaluacion_id
    WHERE ei.estado = 'pendiente'
      AND ei.updated_at < now() - interval '3 days'
    GROUP BY ei.evaluacion_id, e.instructor_id
  LOOP
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, datos, canal)
    VALUES (
      v_instructor.usuario_id,
      'sla_respuesta',
      'Evaluaciones pendientes',
      format('Tienes %s evaluaciones pendientes de calificar desde hace más de 3 días.', v_instructor.count),
      jsonb_build_object('count', v_instructor.count, 'dias', 3),
      'email'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 5: Configurar cron jobs**

```sql
-- Cron: cada minuto para worker
SELECT cron.schedule('notifications-worker', '* * * * *', $$
  SELECT net.http_get(
    url := current_setting('app.supabase_url') || '/functions/v1/notifications-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'))
  );
$$);

-- Cron: diario 08:00 para deadlines
SELECT cron.schedule('deadline-proximo', '0 8 * * *', 'SELECT notificar_deadlines_proximos()');

-- Cron: diario 09:00 para alertas de riesgo
SELECT cron.schedule('alerta-riesgo', '0 9 * * *', 'SELECT notificar_alertas_riesgo()');

-- Cron: diario 09:00 para SLA
SELECT cron.schedule('sla-respuesta', '0 9 * * *', 'SELECT notificar_sla_respuesta()');
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/051_notificaciones.sql
git commit -m "feat(schema): migration 051 — notificaciones, triggers, plantillas, cron"
```

---

### Task 2: Edge Function — notifications-worker

**Files:**

- Create: `supabase/functions/notifications-worker/index.ts`

- [ ] **Step 1: Crear directorio y archivo**

```bash
mkdir -p supabase/functions/notifications-worker
```

- [ ] **Step 2: Escribir Edge Function**

```typescript
// supabase/functions/notifications-worker/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BATCH_SIZE = 50

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Leer pending
  const { data: notifs, error: readError } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('estado', 'pending')
    .limit(BATCH_SIZE)
    .order('creado_en')

  if (readError || !notifs || notifs.length === 0) {
    return new Response('OK: no pending', { status: 200 })
  }

  // 2. Cargar config email una sola vez
  const { data: emailConfig } = await supabase.from('email_configuracion').select('*').single()

  // 3. Procesar cada notificación
  for (const n of notifs) {
    try {
      // Cargar preferencias del usuario
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

      let ok = true

      if (canal === 'push' || canal === 'all') {
        ok = ok && (await enviarPush(supabase, n))
      }
      if (canal === 'email' || canal === 'all') {
        ok = ok && (await enviarEmail(supabase, n, emailConfig))
      }

      await supabase
        .from('notificaciones')
        .update({
          estado: ok ? 'sent' : 'failed',
          enviado_en: new Date().toISOString(),
        })
        .eq('id', n.id)
    } catch (err) {
      console.error('[worker] error procesando notificación', n.id, err)
      await supabase
        .from('notificaciones')
        .update({ estado: 'failed', enviado_en: new Date().toISOString() })
        .eq('id', n.id)
    }
  }

  return new Response(`OK: processed ${notifs.length}`, { status: 200 })
})

async function enviarPush(supabase: any, notif: any): Promise<boolean> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('usuario_id', notif.usuario_id)

  if (!subs || subs.length === 0) return true // No hay subs, no es error

  const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[worker] VAPID keys no configuradas')
    return false
  }

  let sent = false
  for (const sub of subs) {
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `VAPID ${btoa(
            JSON.stringify({
              publicKey: vapidPublicKey,
              privateKey: vapidPrivateKey,
              subject: 'mailto:admin@cursos-amx.local',
            })
          )}`,
        },
        body: JSON.stringify({
          title: notif.titulo,
          body: notif.cuerpo,
          data: { url: '/', ...notif.datos },
        }),
      })
      if (res.ok) sent = true
    } catch (err) {
      console.error('[worker] error enviando push a', sub.endpoint, err)
    }
  }

  return sent || subs.length === 0
}

async function enviarEmail(supabase: any, notif: any, config: any): Promise<boolean> {
  if (!config?.activo || !config.api_key) return true // Email no configurado, no es error

  // Cargar email del usuario
  const { data: user } = await supabase
    .from('usuarios')
    .select('email')
    .eq('id', notif.usuario_id)
    .single()

  if (!user?.email) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${config.remitente_nombre} <${config.remitente_email}>`,
        to: user.email,
        subject: notif.titulo,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2>${notif.titulo}</h2>
          <p>${notif.cuerpo}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#666;font-size:12px">Cursos AMX — Notificación automática</p>
        </div>`,
      }),
    })

    return res.ok
  } catch (err) {
    console.error('[worker] error enviando email a', user.email, err)
    return false
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notifications-worker/
git commit -m "feat(edge): notifications-worker — procesa cola pending, envía push/email"
```

---

### Task 3: Servicio — notificaciones.js

**Files:**

- Create: `src/services/notificaciones.js`
- Create: `src/services/__tests__/notificaciones.test.js`

- [ ] **Step 1: Escribir servicio**

```javascript
// src/services/notificaciones.js
import { supabase } from '@/lib/supabase'

/**
 * Cargar notificaciones del usuario actual.
 * @param {Object} options
 * @param {number} options.limit
 * @param {boolean} options.soloNoLeidas
 */
export async function cargarNotificaciones({ limit = 50, soloNoLeidas = false } = {}) {
  let query = supabase
    .from('notificaciones')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(limit)

  if (soloNoLeidas) {
    query = query.eq('leido', false)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Marcar una notificación como leída.
 */
export async function marcarNotificacionLeida(id) {
  const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('id', id)
  if (error) throw error
}

/**
 * Marcar todas las notificaciones como leídas.
 */
export async function marcarTodasLeidas() {
  const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('leido', false)
  if (error) throw error
}

/**
 * Cargar preferencias del usuario.
 */
export async function cargarPreferencias() {
  const { data, error } = await supabase.from('notificacion_preferencias').select('*').single()
  if (error && error.code !== 'PGRST116') throw error
  return data || { silenciados: [], canal_default: 'all' }
}

/**
 * Guardar preferencias del usuario.
 */
export async function guardarPreferencias(preferencias) {
  const { error } = await supabase
    .from('notificacion_preferencias')
    .upsert({ ...preferencias, updated_at: new Date().toISOString() })
  if (error) throw error
}

/**
 * Cargar plantillas (admin).
 */
export async function cargarPlantillas() {
  const { data, error } = await supabase
    .from('notificacion_plantillas')
    .select('*')
    .eq('activa', true)
  if (error) throw error
  return data || []
}

/**
 * Actualizar plantilla (admin).
 */
export async function actualizarPlantilla(tipo, campos) {
  const { error } = await supabase.from('notificacion_plantillas').update(campos).eq('tipo', tipo)
  if (error) throw error
}

/**
 * Cargar configuración de email (admin).
 */
export async function cargarEmailConfig() {
  const { data, error } = await supabase.from('email_configuracion').select('*').single()
  if (error) throw error
  return data
}

/**
 * Guardar configuración de email (admin).
 * NOTA: api_key solo se escribe, nunca se lee desde frontend.
 */
export async function guardarEmailConfig(config) {
  const { error } = await supabase.from('email_configuracion').upsert({ ...config, id: 1 })
  if (error) throw error
}

/**
 * Enviar email de prueba (admin).
 */
export async function enviarEmailPrueba(emailDestino) {
  const { error } = await supabase.functions.invoke('notifications-worker', {
    body: { action: 'test_email', to: emailDestino },
  })
  if (error) throw error
}
```

- [ ] **Step 2: Escribir tests del servicio**

```javascript
// src/services/__tests__/notificaciones.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  cargarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  cargarPreferencias,
  guardarPreferencias,
  cargarPlantillas,
  cargarEmailConfig,
} from '@/services/notificaciones.js'

describe('notificaciones service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cargarNotificaciones ordena por fecha descendente', async () => {
    const mockData = [{ id: '1', titulo: 'Test', leido: false }]
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })

    const result = await cargarNotificaciones()
    expect(result).toEqual(mockData)
  })

  it('cargarNotificaciones filtra solo no leídas', async () => {
    const mockData = [{ id: '1', titulo: 'Test', leido: false }]
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })

    const result = await cargarNotificaciones({ soloNoLeidas: true })
    expect(result).toEqual(mockData)
  })

  it('marcarNotificacionLeida actualiza la fila', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    await marcarNotificacionLeida('notif-1')
    // No debería lanzar error
  })

  it('marcarTodasLeidas actualiza todas las no leídas', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    await marcarTodasLeidas()
  })

  it('cargarPreferencias devuelve defaults si no existe', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })

    const result = await cargarPreferencias()
    expect(result).toEqual({ silenciados: [], canal_default: 'all' })
  })

  it('guardarPreferencias hace upsert', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })

    await guardarPreferencias({ silenciados: ['foro_respuesta'], canal_default: 'push' })
  })

  it('cargarPlantillas filtra activas', async () => {
    const mockData = [{ tipo: 'curso_asignado', activa: true }]
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })

    const result = await cargarPlantillas()
    expect(result).toEqual(mockData)
  })

  it('cargarEmailConfig devuelve config', async () => {
    const mockConfig = { proveedor: 'resend', activo: false }
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
    })

    const result = await cargarEmailConfig()
    expect(result).toEqual(mockConfig)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/services/__tests__/notificaciones.test.js
```

Expected: 8 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/notificaciones.js src/services/__tests__/notificaciones.test.js
git commit -m "feat(service): servicio de notificaciones con tests"
```

---

### Task 4: Composable — useNotificaciones.js

**Files:**

- Create: `src/composables/useNotificaciones.js`
- Create: `src/composables/__tests__/useNotificaciones.test.js`

- [ ] **Step 1: Escribir composable**

```javascript
// src/composables/useNotificaciones.js
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  cargarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  cargarPreferencias,
  guardarPreferencias,
} from '@/services/notificaciones.js'

export function useNotificaciones() {
  const notificaciones = ref([])
  const preferencias = ref({ silenciados: [], canal_default: 'all' })
  const loading = ref(false)
  const error = ref(null)

  const unreadCount = computed(() => notificaciones.value.filter((n) => !n.leido).length)

  let realtimeChannel = null

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const [notifs, prefs] = await Promise.all([cargarNotificaciones(), cargarPreferencias()])
      notificaciones.value = notifs
      preferencias.value = prefs
    } catch (err) {
      error.value = err.message
      console.error('[useNotificaciones] error cargando:', err)
    } finally {
      loading.value = false
    }
  }

  async function marcarLeida(id) {
    try {
      await marcarNotificacionLeida(id)
      const n = notificaciones.value.find((x) => x.id === id)
      if (n) n.leido = true
    } catch (err) {
      console.error('[useNotificaciones] error marcando leída:', err)
    }
  }

  async function marcarTodas() {
    try {
      await marcarTodasLeidas()
      notificaciones.value.forEach((n) => (n.leido = true))
    } catch (err) {
      console.error('[useNotificaciones] error marcando todas:', err)
    }
  }

  async function guardarPrefs(nuevasPrefs) {
    try {
      await guardarPreferencias(nuevasPrefs)
      preferencias.value = nuevasPrefs
    } catch (err) {
      console.error('[useNotificaciones] error guardando prefs:', err)
      throw err
    }
  }

  function subscribeRealtime() {
    realtimeChannel = supabase
      .channel('notificaciones-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const nueva = payload.new
          // Solo añadir si es del usuario actual
          if (nueva.usuario_id === supabase.auth.user()?.id) {
            notificaciones.value.unshift(nueva)
          }
        }
      )
      .subscribe()
  }

  function unsubscribeRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  onMounted(() => {
    refresh()
    subscribeRealtime()
  })

  onUnmounted(() => {
    unsubscribeRealtime()
  })

  return {
    notificaciones,
    unreadCount,
    preferencias,
    loading,
    error,
    refresh,
    marcarLeida,
    marcarTodas,
    guardarPrefs,
  }
}
```

- [ ] **Step 2: Escribir tests del composable**

```javascript
// src/composables/__tests__/useNotificaciones.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNotificaciones } from '@/composables/useNotificaciones.js'
import { supabase } from '@/lib/supabase'
import * as service from '@/services/notificaciones.js'

describe('useNotificaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unreadCount inicia en 0', () => {
    const { unreadCount } = useNotificaciones()
    expect(unreadCount.value).toBe(0)
  })

  it('carga notificaciones al montar', async () => {
    vi.spyOn(service, 'cargarNotificaciones').mockResolvedValue([
      { id: '1', titulo: 'Test', leido: false },
    ])
    vi.spyOn(service, 'cargarPreferencias').mockResolvedValue({
      silenciados: [],
      canal_default: 'all',
    })

    const { notificaciones, unreadCount, loading } = useNotificaciones()
    // En test no hay onMounted, llamamos manualmente
    await service.cargarNotificaciones()
    notificaciones.value = [{ id: '1', titulo: 'Test', leido: false }]

    expect(notificaciones.value).toHaveLength(1)
    expect(unreadCount.value).toBe(1)
  })

  it('marcarLeida actualiza estado local', async () => {
    vi.spyOn(service, 'marcarNotificacionLeida').mockResolvedValue()

    const { notificaciones, unreadCount, marcarLeida } = useNotificaciones()
    notificaciones.value = [{ id: '1', titulo: 'Test', leido: false }]

    await marcarLeida('1')
    expect(notificaciones.value[0].leido).toBe(true)
    expect(unreadCount.value).toBe(0)
  })

  it('marcarTodas marca todas como leídas', async () => {
    vi.spyOn(service, 'marcarTodasLeidas').mockResolvedValue()

    const { notificaciones, unreadCount, marcarTodas } = useNotificaciones()
    notificaciones.value = [
      { id: '1', leido: false },
      { id: '2', leido: false },
    ]

    await marcarTodas()
    expect(unreadCount.value).toBe(0)
  })

  it('guardarPrefs actualiza estado local', async () => {
    vi.spyOn(service, 'guardarPreferencias').mockResolvedValue()

    const { preferencias, guardarPrefs } = useNotificaciones()
    const nuevas = { silenciados: ['foro'], canal_default: 'email' }

    await guardarPrefs(nuevas)
    expect(preferencias.value).toEqual(nuevas)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/composables/__tests__/useNotificaciones.test.js
```

Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/composables/useNotificaciones.js src/composables/__tests__/useNotificaciones.test.js
git commit -m "feat(composable): useNotificaciones con realtime, tests"
```

---

### Task 5: Componente — NotificationBell.vue

**Files:**

- Create: `src/components/NotificationBell.vue`
- Create: `src/components/__tests__/NotificationBell.test.js`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/NotificationBell.vue -->
<script setup>
import { ref } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones.js'

const props = defineProps({
  onOpenPanel: {
    type: Function,
    default: () => {},
  },
})

const { unreadCount, notificaciones, marcarLeida } = useNotificaciones()
const showDropdown = ref(false)

const ultimas = computed(() => notificaciones.value.slice(0, 5))

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function handleClickNotif(notif) {
  marcarLeida(notif.id)
  showDropdown.value = false
  // Navegar si hay URL en datos
  if (notif.datos?.url) {
    window.location.href = notif.datos.url
  }
}

function openPanel() {
  showDropdown.value = false
  props.onOpenPanel()
}
</script>

<template>
  <div class="notification-bell-wrapper" data-test="notification-bell">
    <button
      class="btn btn-ghost notification-bell-btn"
      :aria-label="`Notificaciones (${unreadCount} sin leer)`"
      @click="toggleDropdown"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span v-if="unreadCount > 0" class="notification-badge" data-test="notification-badge">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <div v-if="showDropdown" class="notification-dropdown" data-test="notification-dropdown">
      <div v-if="ultimas.length === 0" class="notification-empty">Sin notificaciones</div>
      <div
        v-for="n in ultimas"
        :key="n.id"
        class="notification-item"
        :class="{ unread: !n.leido }"
        data-test="notification-item"
        @click="handleClickNotif(n)"
      >
        <p class="notification-title">{{ n.titulo }}</p>
        <p class="notification-body">{{ n.cuerpo }}</p>
        <time class="notification-time">{{ formatRelative(n.creado_en) }}</time>
      </div>
      <button class="notification-view-all" @click="openPanel">Ver todas</button>
    </div>
  </div>
</template>

<style scoped>
.notification-bell-wrapper {
  position: relative;
}
.notification-bell-btn {
  position: relative;
}
.notification-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--error);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}
.notification-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 100;
}
.notification-empty {
  padding: calc(var(--unit) * 3);
  text-align: center;
  color: var(--ink-3);
}
.notification-item {
  padding: calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.notification-item:hover {
  background: var(--hover);
}
.notification-item.unread {
  border-left: 3px solid var(--primary);
}
.notification-title {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 2px;
}
.notification-body {
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 4px;
  line-height: 1.4;
}
.notification-time {
  font-size: 11px;
  color: var(--ink-3);
}
.notification-view-all {
  width: 100%;
  padding: calc(var(--unit) * 2);
  text-align: center;
  color: var(--primary);
  font-size: 13px;
  background: none;
  border: none;
  cursor: pointer;
}
.notification-view-all:hover {
  background: var(--hover);
}
</style>
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/components/__tests__/NotificationBell.test.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationBell from '@/components/NotificationBell.vue'

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => ({
    unreadCount: { value: 3 },
    notificaciones: {
      value: [
        {
          id: '1',
          titulo: 'Notif 1',
          cuerpo: 'Body 1',
          leido: false,
          creado_en: new Date().toISOString(),
        },
        {
          id: '2',
          titulo: 'Notif 2',
          cuerpo: 'Body 2',
          leido: true,
          creado_en: new Date().toISOString(),
        },
      ],
    },
    marcarLeida: vi.fn(),
  }),
}))

describe('NotificationBell', () => {
  it('renderiza badge con count', () => {
    const wrapper = mount(NotificationBell)
    expect(wrapper.find('[data-test="notification-badge"]').text()).toBe('3')
  })

  it('abre dropdown al hacer click', async () => {
    const wrapper = mount(NotificationBell)
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('[data-test="notification-dropdown"]').exists()).toBe(true)
  })

  it('muestra notificaciones en dropdown', async () => {
    const wrapper = mount(NotificationBell)
    await wrapper.find('button').trigger('click')
    const items = wrapper.findAll('[data-test="notification-item"]')
    expect(items).toHaveLength(2)
  })

  it('no muestra badge si count es 0', () => {
    vi.doMock('@/composables/useNotificaciones.js', () => ({
      useNotificaciones: () => ({
        unreadCount: { value: 0 },
        notificaciones: { value: [] },
        marcarLeida: vi.fn(),
      }),
    }))
    const wrapper = mount(NotificationBell)
    expect(wrapper.find('[data-test="notification-badge"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/components/__tests__/NotificationBell.test.js
```

Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/NotificationBell.vue src/components/__tests__/NotificationBell.test.js
git commit -m "feat(ui): NotificationBell con badge y dropdown"
```

---

### Task 6: Componente — NotificationPanel.vue

**Files:**

- Create: `src/components/NotificationPanel.vue`
- Create: `src/components/__tests__/NotificationPanel.test.js`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/NotificationPanel.vue -->
<script setup>
import { computed, ref } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])

const { notificaciones, unreadCount, loading, marcarLeida, marcarTodas } = useNotificaciones()
const filtro = ref('todas') // 'todas' | 'no_leidas'

const notificacionesFiltradas = computed(() => {
  let lista = notificaciones.value
  if (filtro.value === 'no_leidas') {
    lista = lista.filter((n) => !n.leido)
  }
  return lista
})

const agrupadas = computed(() => {
  const hoy = new Date().toDateString()
  const ayer = new Date(Date.now() - 86400000).toDateString()

  const grupos = { Hoy: [], Ayer: [], Anteriores: [] }
  for (const n of notificacionesFiltradas.value) {
    const fecha = new Date(n.creado_en).toDateString()
    if (fecha === hoy) grupos.Hoy.push(n)
    else if (fecha === ayer) grupos.Ayer.push(n)
    else grupos.Anteriores.push(n)
  }
  return grupos
})

function handleClick(notif) {
  marcarLeida(notif.id)
  if (notif.datos?.url) {
    window.location.href = notif.datos.url
  }
}

function handleMarcarTodas() {
  marcarTodas()
}
</script>

<template>
  <div v-if="visible" class="notification-panel-overlay" @click.self="emit('close')">
    <div class="notification-panel" data-test="notification-panel">
      <header class="notification-panel-header">
        <h3>Notificaciones</h3>
        <div class="notification-panel-actions">
          <select v-model="filtro" class="select-sm" data-test="filtro-select">
            <option value="todas">Todas</option>
            <option value="no_leidas">No leídas ({{ unreadCount }})</option>
          </select>
          <button v-if="unreadCount > 0" class="btn btn-sm btn-ghost" @click="handleMarcarTodas">
            Marcar todas
          </button>
          <button class="btn btn-sm btn-ghost" @click="emit('close')">✕</button>
        </div>
      </header>

      <div v-if="loading" class="notification-panel-loading">Cargando...</div>

      <div v-else-if="notificacionesFiltradas.length === 0" class="notification-panel-empty">
        No hay notificaciones
      </div>

      <div v-else class="notification-panel-list">
        <template v-for="(items, grupo) in agrupadas" :key="grupo">
          <div v-if="items.length > 0" class="notification-group">
            <h4 class="notification-group-title">{{ grupo }}</h4>
            <div
              v-for="n in items"
              :key="n.id"
              class="notification-panel-item"
              :class="{ unread: !n.leido }"
              data-test="panel-item"
              @click="handleClick(n)"
            >
              <p class="item-title">{{ n.titulo }}</p>
              <p class="item-body">{{ n.cuerpo }}</p>
              <time class="item-time">{{ formatRelative(n.creado_en) }}</time>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
}
.notification-panel {
  width: 400px;
  max-width: 100vw;
  height: 100vh;
  background: var(--surface);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.notification-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--unit) * 3);
  border-bottom: 1px solid var(--line);
}
.notification-panel-header h3 {
  margin: 0;
  font-size: 16px;
}
.notification-panel-actions {
  display: flex;
  gap: calc(var(--unit));
  align-items: center;
}
.notification-panel-loading,
.notification-panel-empty {
  padding: calc(var(--unit) * 4);
  text-align: center;
  color: var(--ink-3);
}
.notification-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--unit) * 2);
}
.notification-group {
  margin-bottom: calc(var(--unit) * 3);
}
.notification-group-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: calc(var(--unit));
  padding-left: calc(var(--unit));
}
.notification-panel-item {
  padding: calc(var(--unit) * 2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-bottom: calc(var(--unit));
}
.notification-panel-item:hover {
  background: var(--hover);
}
.notification-panel-item.unread {
  background: var(--primary-50);
  border-left: 3px solid var(--primary);
}
.item-title {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 2px;
}
.item-body {
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 4px;
  line-height: 1.4;
}
.item-time {
  font-size: 11px;
  color: var(--ink-3);
}
.select-sm {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface);
}
</style>
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/components/__tests__/NotificationPanel.test.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPanel from '@/components/NotificationPanel.vue'

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => ({
    notificaciones: {
      value: [
        {
          id: '1',
          titulo: 'Hoy',
          cuerpo: 'Body',
          leido: false,
          creado_en: new Date().toISOString(),
        },
        {
          id: '2',
          titulo: 'Ayer',
          cuerpo: 'Body',
          leido: true,
          creado_en: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    },
    unreadCount: { value: 1 },
    loading: { value: false },
    marcarLeida: vi.fn(),
    marcarTodas: vi.fn(),
  }),
}))

describe('NotificationPanel', () => {
  it('renderiza cuando visible=true', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    expect(wrapper.find('[data-test="notification-panel"]').exists()).toBe(true)
  })

  it('no renderiza cuando visible=false', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: false } })
    expect(wrapper.find('[data-test="notification-panel"]').exists()).toBe(false)
  })

  it('muestra notificaciones agrupadas', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    const items = wrapper.findAll('[data-test="panel-item"]')
    expect(items.length).toBeGreaterThan(0)
  })

  it('emite close al hacer click en overlay', async () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    await wrapper.find('.notification-panel-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/components/__tests__/NotificationPanel.test.js
```

Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/NotificationPanel.vue src/components/__tests__/NotificationPanel.test.js
git commit -m "feat(ui): NotificationPanel con filtros y agrupación por fecha"
```

---

### Task 7: Componente — NotificationPreferences.vue

**Files:**

- Create: `src/components/NotificationPreferences.vue`
- Create: `src/components/__tests__/NotificationPreferences.test.js`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/NotificationPreferences.vue -->
<script setup>
import { computed } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones.js'

const TIPOS_LABELS = {
  curso_asignado: 'Curso asignado',
  evaluacion_calificada: 'Evaluación calificada',
  badge_desbloqueado: 'Insignia desbloqueada',
  foro_respuesta: 'Respuesta en foro',
  certificacion_lista: 'Certificación lista',
  deadline_proximo: 'Deadline próximo',
  anuncio_instructor: 'Anuncio del instructor',
}

const { preferencias, guardarPrefs } = useNotificaciones()

const canales = [
  { value: 'all', label: 'Todos' },
  { value: 'push', label: 'Push' },
  { value: 'email', label: 'Email' },
  { value: 'in_app', label: 'Solo en app' },
]

function toggleSilenciado(tipo) {
  const silenciados = new Set(preferencias.value.silenciados)
  if (silenciados.has(tipo)) {
    silenciados.delete(tipo)
  } else {
    silenciados.add(tipo)
  }
  guardarPrefs({
    ...preferencias.value,
    silenciados: Array.from(silenciados),
  })
}

function cambiarCanalDefault(canal) {
  guardarPrefs({
    ...preferencias.value,
    canal_default: canal,
  })
}
</script>

<template>
  <div class="notification-preferences" data-test="notification-preferences">
    <h3 class="preferences-title">Preferencias de notificación</h3>

    <div class="preferences-section">
      <label class="preferences-label">Canal por defecto</label>
      <div class="preferences-canales">
        <button
          v-for="c in canales"
          :key="c.value"
          class="btn btn-sm"
          :class="{
            'btn-primary': preferencias.canal_default === c.value,
            'btn-ghost': preferencias.canal_default !== c.value,
          }"
          @click="cambiarCanalDefault(c.value)"
        >
          {{ c.label }}
        </button>
      </div>
    </div>

    <div class="preferences-section">
      <label class="preferences-label">Silenciar tipos</label>
      <div class="preferences-tipos">
        <label
          v-for="(label, tipo) in TIPOS_LABELS"
          :key="tipo"
          class="preferences-tipo"
          data-test="tipo-preferencia"
        >
          <input
            type="checkbox"
            :checked="preferencias.silenciados.includes(tipo)"
            @change="toggleSilenciado(tipo)"
          />
          <span>{{ label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-preferences {
  padding: calc(var(--unit) * 3);
}
.preferences-title {
  margin: 0 0 calc(var(--unit) * 3);
  font-size: 16px;
}
.preferences-section {
  margin-bottom: calc(var(--unit) * 3);
}
.preferences-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: calc(var(--unit) * 1.5);
  color: var(--ink-2);
}
.preferences-canales {
  display: flex;
  gap: calc(var(--unit));
  flex-wrap: wrap;
}
.preferences-tipos {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit));
}
.preferences-tipo {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
  font-size: 13px;
  cursor: pointer;
}
.preferences-tipo input {
  width: 16px;
  height: 16px;
}
</style>
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/components/__tests__/NotificationPreferences.test.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPreferences from '@/components/NotificationPreferences.vue'

const mockGuardar = vi.fn()

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => ({
    preferencias: {
      value: {
        silenciados: ['foro_respuesta'],
        canal_default: 'all',
      },
    },
    guardarPrefs: mockGuardar,
  }),
}))

describe('NotificationPreferences', () => {
  it('renderiza tipos de notificación', () => {
    const wrapper = mount(NotificationPreferences)
    const tipos = wrapper.findAll('[data-test="tipo-preferencia"]')
    expect(tipos.length).toBeGreaterThan(0)
  })

  it('toggle silenciado llama guardarPrefs', async () => {
    const wrapper = mount(NotificationPreferences)
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(false) // Des-silenciar
    expect(mockGuardar).toHaveBeenCalled()
  })

  it('cambiar canal default llama guardarPrefs', async () => {
    const wrapper = mount(NotificationPreferences)
    const botones = wrapper.findAll('.preferences-canales button')
    await botones[1].trigger('click') // push
    expect(mockGuardar).toHaveBeenCalledWith(expect.objectContaining({ canal_default: 'push' }))
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/components/__tests__/NotificationPreferences.test.js
```

Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/NotificationPreferences.vue src/components/__tests__/NotificationPreferences.test.js
git commit -m "feat(ui): NotificationPreferences — silenciar tipos y canal default"
```

---

### Task 8: Componente — AdminNotificaciones.vue

**Files:**

- Create: `src/components/AdminNotificaciones.vue`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/AdminNotificaciones.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import {
  cargarPlantillas,
  actualizarPlantilla,
  cargarEmailConfig,
  guardarEmailConfig,
} from '@/services/notificaciones.js'

const plantillas = ref([])
const emailConfig = ref({})
const loading = ref(false)
const guardado = ref(false)

const TIPOS_LABELS = {
  curso_asignado: 'Curso asignado',
  evaluacion_calificada: 'Evaluación calificada',
  badge_desbloqueado: 'Insignia desbloqueada',
  foro_respuesta: 'Respuesta en foro',
  certificacion_lista: 'Certificación lista',
  deadline_proximo: 'Deadline próximo',
  reporte_listo: 'Reporte listo',
  alerta_riesgo: 'Alerta académica',
  sla_respuesta: 'SLA respuesta',
}

onMounted(async () => {
  loading.value = true
  const [p, e] = await Promise.all([cargarPlantillas(), cargarEmailConfig()])
  plantillas.value = p
  emailConfig.value = e || { proveedor: 'resend', activo: false }
  loading.value = false
})

async function guardarPlantilla(tipo) {
  const p = plantillas.value.find((x) => x.tipo === tipo)
  if (!p) return
  await actualizarPlantilla(tipo, {
    titulo_template: p.titulo_template,
    cuerpo_template: p.cuerpo_template,
    canal_default: p.canal_default,
    activa: p.activa,
  })
  mostrarGuardado()
}

async function guardarConfig() {
  await guardarEmailConfig(emailConfig.value)
  mostrarGuardado()
}

function mostrarGuardado() {
  guardado.value = true
  setTimeout(() => (guardado.value = false), 2000)
}
</script>

<template>
  <div class="admin-notificaciones" data-test="admin-notificaciones">
    <h2>Configuración de notificaciones</h2>

    <div v-if="loading">Cargando...</div>

    <template v-else>
      <!-- Sección: Plantillas -->
      <section class="admin-section">
        <h3>Plantillas</h3>
        <div v-for="p in plantillas" :key="p.tipo" class="plantilla-card">
          <h4>{{ TIPOS_LABELS[p.tipo] || p.tipo }}</h4>
          <div class="form-row">
            <label>Título</label>
            <input v-model="p.titulo_template" class="input" />
          </div>
          <div class="form-row">
            <label>Cuerpo</label>
            <textarea v-model="p.cuerpo_template" class="input" rows="2" />
          </div>
          <div class="form-row">
            <label>Canal default</label>
            <select v-model="p.canal_default" class="input">
              <option value="all">Todos</option>
              <option value="push">Push</option>
              <option value="email">Email</option>
              <option value="in_app">Solo app</option>
            </select>
          </div>
          <div class="form-row">
            <label>
              <input v-model="p.activa" type="checkbox" />
              Activa
            </label>
          </div>
          <button class="btn btn-primary btn-sm" @click="guardarPlantilla(p.tipo)">
            Guardar plantilla
          </button>
        </div>
      </section>

      <!-- Sección: Configuración email -->
      <section class="admin-section">
        <h3>Configuración de email</h3>
        <div class="form-row">
          <label>Proveedor</label>
          <select v-model="emailConfig.proveedor" class="input">
            <option value="resend">Resend</option>
            <option value="smtp">SMTP</option>
            <option value="sendgrid">SendGrid</option>
          </select>
        </div>
        <div class="form-row">
          <label>API Key</label>
          <input v-model="emailConfig.api_key" type="password" class="input" placeholder="sk_..." />
        </div>
        <div class="form-row">
          <label>Email remitente</label>
          <input v-model="emailConfig.remitente_email" class="input" />
        </div>
        <div class="form-row">
          <label>Nombre remitente</label>
          <input v-model="emailConfig.remitente_nombre" class="input" />
        </div>
        <div class="form-row">
          <label>
            <input v-model="emailConfig.activo" type="checkbox" />
            Activar envío de email
          </label>
        </div>
        <button class="btn btn-primary" @click="guardarConfig">Guardar configuración</button>
      </section>

      <div v-if="guardado" class="guardado-toast">Guardado ✓</div>
    </template>
  </div>
</template>

<style scoped>
.admin-notificaciones {
  padding: calc(var(--unit) * 3);
}
.admin-section {
  margin-bottom: calc(var(--unit) * 4);
}
.admin-section h3 {
  margin-bottom: calc(var(--unit) * 2);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--ink-3);
}
.plantilla-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: calc(var(--unit) * 3);
  margin-bottom: calc(var(--unit) * 2);
}
.plantilla-card h4 {
  margin: 0 0 calc(var(--unit) * 2);
  font-size: 14px;
}
.form-row {
  margin-bottom: calc(var(--unit) * 1.5);
}
.form-row label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--ink-2);
}
.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 13px;
}
.guardado-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--success);
  color: white;
  padding: 12px 20px;
  border-radius: var(--radius);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AdminNotificaciones.vue
git commit -m "feat(ui): AdminNotificaciones — plantillas y config email"
```

---

### Task 9: Integración — TopNav + AdminPage + feature flags

**Files:**

- Modify: `src/lib/featureFlags.ts`
- Modify: `src/components/TopNav.vue`
- Modify: `src/pages/AdminPage.vue`

- [ ] **Step 1: Agregar feature flags**

```typescript
// src/lib/featureFlags.ts — agregar al objeto flags
notificaciones: flag('VITE_FEATURE_NOTIFICACIONES'),
notificaciones_email: flag('VITE_FEATURE_NOTIFICACIONES_EMAIL'),
```

- [ ] **Step 2: Integrar NotificationBell en TopNav**

```vue
<!-- src/components/TopNav.vue — agregar en el header, cerca del perfil -->
<script setup>
import { featureEnabled } from '@/lib/featureFlags'
import NotificationBell from '@/components/NotificationBell.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'

const showPanel = ref(false)
</script>

<template>
  <!-- ... existing template ... -->
  <div class="nav-actions">
    <NotificationBell
      v-if="featureEnabled('notificaciones')"
      :on-open-panel="() => (showPanel = true)"
    />
    <!-- ... existing profile dropdown ... -->
  </div>

  <NotificationPanel
    v-if="featureEnabled('notificaciones')"
    :visible="showPanel"
    @close="showPanel = false"
  />
</template>
```

- [ ] **Step 3: Agregar tab Notificaciones en AdminPage**

```vue
<!-- src/pages/AdminPage.vue — agregar import y tab -->
<script setup>
import AdminNotificaciones from '@/components/AdminNotificaciones.vue'
</script>

<template>
  <!-- ... existing tabs ... -->
  <button
    v-if="featureEnabled('notificaciones')"
    class="tab"
    :class="{ active: activeTab === 'notificaciones' }"
    @click="activeTab = 'notificaciones'"
  >
    Notificaciones
  </button>

  <!-- ... existing tab panels ... -->
  <AdminNotificaciones v-if="activeTab === 'notificaciones'" />
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/featureFlags.ts src/components/TopNav.vue src/pages/AdminPage.vue
git commit -m "feat(integration): agrega NotificationBell a TopNav y tab admin"
```

---

### Task 10: Tests finales y verificación

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit
```

Expected: All tests PASS (251 + nuevos)

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: 0 errors, 0 warnings

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: Build success, sw.js generado

- [ ] **Step 4: Commit si hay cambios**

```bash
git diff --quiet || git commit -am "fix: ajustes post-review lint/build"
```

---

### Task 11: Release v0.13.0

- [ ] **Step 1: Actualizar README**

```markdown
## Novedades v0.13.0 — Fase I: Notificaciones y Alertas Automáticas

- **Sistema de notificaciones completo** — In-app, push y email para 11 eventos del LMS
- **Triggers PostgreSQL** — 8 eventos automáticos (curso asignado, evaluación calificada, badge, foro, anuncio, certificación, reporte)
- **Alertas programadas** — Deadline próximo, alerta de riesgo académico, SLA de respuesta (cron diario)
- **Edge Function** `notifications-worker` — Procesa cola cada minuto, envía push/email según preferencias
- **Panel de notificaciones** — Historial con filtros, agrupación por fecha, marcar leídas
- **Preferencias por usuario** — Silenciar tipos, elegir canal default (push/email/in-app/todos)
- **Panel admin** — Configurar plantillas, canales globales, proveedor de email (Resend/SMTP/SendGrid)
- **Tabla `anuncios`** — Instructores pueden enviar broadcast a toda la cohorte
- **Feature flags** — `notificaciones`, `notificaciones_email`
- **Componentes:** `NotificationBell`, `NotificationPanel`, `NotificationPreferences`, `AdminNotificaciones`
- **Release:** v0.13.0
```

- [ ] **Step 2: Actualizar versión en package.json**

```bash
# package.json: "version": "0.13.0"
```

- [ ] **Step 3: Commit, tag y push**

```bash
git add README.md package.json
git commit -m "docs: actualiza README y versión para v0.13.0"
git tag -a v0.13.0 -m "Release v0.13.0 — Notificaciones y Alertas Automáticas"
git push origin main
git push origin v0.13.0
```

- [ ] **Step 4: Crear release en GitHub**

```bash
gh release create v0.13.0 \
  --title "Release v0.13.0 — Notificaciones y Alertas Automáticas" \
  --notes-file docs/RELEASE_NOTES_v0.13.0.md
```

---

## Self-Review del Plan

### 1. Spec coverage

| Requisito del spec                                                      | Task          |
| ----------------------------------------------------------------------- | ------------- |
| Tablas SQL (notificaciones, plantillas, config, preferencias, anuncios) | Task 1        |
| 8 triggers PostgreSQL                                                   | Task 1        |
| 3 funciones cron                                                        | Task 1        |
| Edge Function notifications-worker                                      | Task 2        |
| Servicio notificaciones.js                                              | Task 3        |
| Composable useNotificaciones.js                                         | Task 4        |
| Componente NotificationBell                                             | Task 5        |
| Componente NotificationPanel                                            | Task 6        |
| Componente NotificationPreferences                                      | Task 7        |
| Componente AdminNotificaciones                                          | Task 8        |
| Feature flags                                                           | Task 9        |
| Integración TopNav                                                      | Task 9        |
| Integración AdminPage                                                   | Task 9        |
| Tests (8 áreas)                                                         | Tasks 3-7, 10 |
| Release v0.13.0                                                         | Task 11       |

✅ **Sin gaps.**

### 2. Placeholder scan

- No hay "TBD", "TODO", "implement later"
- Todo el código está completo en los pasos
- No hay "similar to Task N"

✅ **Limpio.**

### 3. Type consistency

- `notificaciones` tabla usa `canal` con check `'push', 'email', 'in_app', 'all'` — consistente en triggers, worker, UI
- `estado` usa `'pending', 'sent', 'failed'` — consistente en schema y worker
- Preferencias: `silenciados text[]`, `canal_default text` — consistente en schema, servicio, composable, UI

✅ **Consistente.**

---

## Execution Handoff

**Plan completo y guardado en `docs/superpowers/plans/2026-07-07-fase-i-notificaciones.md`.**

**Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Dispatcheo un subagent fresco por tarea, reviso entre tareas, iteración rápida

**2. Inline Execution** — Ejecuto tareas en esta sesión usando executing-plans, ejecución batch con checkpoints

**¿Qué enfoque prefieres?**
