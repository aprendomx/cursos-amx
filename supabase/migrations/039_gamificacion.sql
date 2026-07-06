-- =========================================================
-- Migration 039: Schema de Gamificación
-- =========================================================
--  * niveles: niveles de usuario basados en puntos acumulados
--  * badges: logros desbloqueables con criterios configurables
--  * badge_usuarios: relación usuario-badge (cuándo se desbloqueó)
--  * log_puntos: registro inmutable de puntos otorgados
--  * condiciones_desbloqueo: reglas para desbloquear módulos
-- =========================================================

-- ---------- Tipos enumerados ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_criterio_badge') then
    create type public.tipo_criterio_badge as enum (
      'primer_login', 'completar_leccion', 'aprobar_evaluacion',
      'crear_hilo_foro', 'responder_foro', 'completar_curso',
      'dias_consecutivos', 'puntaje_total', 'personalizado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'fuente_tipo_puntos') then
    create type public.fuente_tipo_puntos as enum (
      'leccion', 'evaluacion', 'foro_hilo', 'foro_respuesta',
      'badge', 'inicio_sesion', 'completar_curso', 'manual'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tipo_condicion_desbloqueo') then
    create type public.tipo_condicion_desbloqueo as enum (
      'leccion_previa', 'evaluacion_aprobada', 'puntos_minimos',
      'badge_obtenido', 'dias_desde_inscripcion', 'manual'
    );
  end if;
end $$;

-- ---------- Niveles ----------
create table if not exists public.niveles (
  id          serial primary key,
  nombre      text not null,
  puntos_min  int not null default 0,
  icono_svg   text,
  color       text,
  created_at  timestamptz not null default now()
);

comment on table public.niveles is 'Niveles de gamificación basados en puntos mínimos acumulados';

insert into public.niveles (nombre, puntos_min, icono_svg, color) values
  ('Novato',      0,    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>', '#6B7280'),
  ('Aprendiz',    100,  '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', '#3B82F6'),
  ('Explorador',  300,  '<svg viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/></svg>', '#10B981'),
  ('Experto',     600,  '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>', '#8B5CF6'),
  ('Maestro',     1000, '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg>', '#F59E0B'),
  ('Leyenda',     2000, '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>', '#EF4444')
on conflict do nothing;

-- ---------- Badges ----------
create table if not exists public.badges (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  descripcion      text,
  icono_svg        text,
  criterio_tipo    public.tipo_criterio_badge not null default 'personalizado',
  criterio_config  jsonb not null default '{}',
  puntos_otorga    int not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.badges is 'Logros desbloqueables del sistema de gamificación';
comment on column public.badges.criterio_config is 'Configuración específica del criterio (JSONB flexible)';

insert into public.badges (nombre, descripcion, icono_svg, criterio_tipo, criterio_config, puntos_otorga, activo) values
  ('Bienvenida', '¡Bienvenido a Cursos AMX!', '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>', 'primer_login', '{}', 10, true),
  ('Primer paso', 'Completaste tu primera lección.', '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>', 'completar_leccion', '{"cantidad": 1}', 20, true),
  ('Social', 'Participaste activamente en los foros.', '<svg viewBox="0 0 24 24"><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/></svg>', 'crear_hilo_foro', '{"cantidad": 1}', 15, true),
  ('Aprobado', 'Aprobaste tu primera evaluación.', '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>', 'aprobar_evaluacion', '{"cantidad": 1}', 30, true),
  ('Constante', 'Mantuviste una racha de 7 días consecutivos.', '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm6 12H6v-1c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1z"/></svg>', 'dias_consecutivos', '{"dias": 7}', 50, true)
on conflict do nothing;

-- ---------- Badge-Usuarios ----------
create table if not exists public.badge_usuarios (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  badge_id        uuid not null references public.badges(id) on delete cascade,
  desbloqueado_en timestamptz not null default now(),
  unique (usuario_id, badge_id)
);

comment on table public.badge_usuarios is 'Relación de badges desbloqueados por cada usuario';

-- ---------- Log de Puntos ----------
create table if not exists public.log_puntos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  fuente_tipo  public.fuente_tipo_puntos not null,
  fuente_id    uuid,
  puntos       int not null,
  descripcion  text,
  created_at   timestamptz not null default now()
);

create index if not exists log_puntos_usuario_idx on public.log_puntos(usuario_id, created_at desc);

comment on table public.log_puntos is 'Registro inmutable de puntos otorgados a usuarios';

-- ---------- Condiciones de Desbloqueo ----------
create table if not exists public.condiciones_desbloqueo (
  id              uuid primary key default gen_random_uuid(),
  modulo_id       uuid not null references public.modulos(id) on delete cascade,
  tipo_condicion  public.tipo_condicion_desbloqueo not null,
  config          jsonb not null default '{}',
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists condiciones_desbloqueo_modulo_idx on public.condiciones_desbloqueo(modulo_id, orden);

comment on table public.condiciones_desbloqueo is 'Reglas que determinan cuándo se desbloquea un módulo';

-- ---------- RLS ----------
alter table public.niveles                  enable row level security;
alter table public.badges                   enable row level security;
alter table public.badge_usuarios          enable row level security;
alter table public.log_puntos              enable row level security;
alter table public.condiciones_desbloqueo  enable row level security;

-- Niveles: lectura pública para autenticados
create policy "niveles_select_all"
  on public.niveles for select
  to authenticated
  using (true);

-- Badges: lectura pública; modificación solo admin
create policy "badges_select_all"
  on public.badges for select
  to authenticated
  using (true);

create policy "badges_mod_admin"
  on public.badges for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Badge-Usuarios: cada usuario ve los propios; admin ve todos
create policy "badge_usuarios_select_self"
  on public.badge_usuarios for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

create policy "badge_usuarios_mod_admin"
  on public.badge_usuarios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Log Puntos: cada usuario ve los propios; admin ve todos
create policy "log_puntos_select_self"
  on public.log_puntos for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

create policy "log_puntos_mod_admin"
  on public.log_puntos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Condiciones Desbloqueo: lectura pública; modificación solo admin
create policy "condiciones_desbloqueo_select_all"
  on public.condiciones_desbloqueo for select
  to authenticated
  using (true);

create policy "condiciones_desbloqueo_mod_admin"
  on public.condiciones_desbloqueo for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
