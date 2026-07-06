-- =========================================================
-- Migration 039: Schema de Gamificación
-- =========================================================
--  * niveles: niveles de usuario basados en puntos acumulados
--  * badges: logros desbloqueables con criterios configurables
--  * badge_usuarios: relación usuario-badge (cuándo se desbloqueó)
--  * log_puntos: registro inmutable de puntos otorgados
--  * condiciones_desbloqueo: reglas para desbloquear módulos
-- =========================================================

-- ---------- Niveles ----------
create table if not exists public.niveles (
  id          serial primary key,
  nombre      text not null unique,
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
on conflict (nombre) do nothing;

-- ---------- Badges ----------
create table if not exists public.badges (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique,
  descripcion      text,
  icono_svg        text,
  criterio_tipo    text not null check (criterio_tipo in (
    'completar_curso', 'calificacion_minima', 'entregar_tiempo',
    'participar_foros', 'streak_dias', 'completar_modulo', 'primer_login'
  )),
  criterio_config  jsonb not null default '{}',
  puntos_otorga    int not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.badges is 'Logros desbloqueables del sistema de gamificación';
comment on column public.badges.criterio_config is 'Configuración específica del criterio (JSONB flexible)';

insert into public.badges (nombre, descripcion, criterio_tipo, criterio_config, puntos_otorga)
values
  ('Bienvenida', 'Iniciaste tu primera sesión', 'primer_login', '{}', 10),
  ('Primer paso', 'Completaste tu primera lección', 'completar_modulo', '{"modulo_orden": 1}', 20),
  ('Social', 'Participaste en 5 foros', 'participar_foros', '{"cantidad_min": 5}', 30),
  ('Aprobado', 'Obtuviste 70+ en una evaluación', 'calificacion_minima', '{"puntaje_min": 70}', 50),
  ('Constante', '7 días consecutivos de actividad', 'streak_dias', '{"dias_consecutivos": 7}', 100)
on conflict (nombre) do nothing;

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
  fuente_tipo  text not null check (fuente_tipo in (
    'leccion_completada', 'quiz_aprobado', 'foro_post', 'entrega_tiempo',
    'badge_desbloqueado', 'login_diario', 'streak'
  )),
  fuente_id    uuid,
  puntos       int not null,
  descripcion  text,
  created_at   timestamptz not null default now()
);

create index if not exists log_puntos_usuario_idx on public.log_puntos(usuario_id, created_at desc);

create unique index if not exists log_puntos_unique_fuentes
  on public.log_puntos(usuario_id, fuente_tipo, fuente_id)
  where fuente_id is not null;

comment on table public.log_puntos is 'Registro inmutable de puntos otorgados a usuarios';

-- ---------- Condiciones de Desbloqueo ----------
create table if not exists public.condiciones_desbloqueo (
  id              uuid primary key default gen_random_uuid(),
  modulo_id       uuid not null references public.modulos(id) on delete cascade,
  tipo_condicion  text not null check (tipo_condicion in (
    'completar_modulo_previo', 'calificacion_minima', 'entregar_leccion',
    'dias_desde_inscripcion', 'badges_requeridos'
  )),
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
drop policy if exists "niveles_select_all" on public.niveles;
create policy "niveles_select_all"
  on public.niveles for select
  to authenticated
  using (true);

drop policy if exists "niveles_mod_admin" on public.niveles;
create policy "niveles_mod_admin"
  on public.niveles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Badges: lectura pública; modificación solo admin
drop policy if exists "badges_select_all" on public.badges;
create policy "badges_select_all"
  on public.badges for select
  to authenticated
  using (true);

drop policy if exists "badges_mod_admin" on public.badges;
create policy "badges_mod_admin"
  on public.badges for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Badge-Usuarios: cada usuario ve los propios; admin ve todos
drop policy if exists "badge_usuarios_select_self" on public.badge_usuarios;
create policy "badge_usuarios_select_self"
  on public.badge_usuarios for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "badge_usuarios_mod_admin" on public.badge_usuarios;
create policy "badge_usuarios_mod_admin"
  on public.badge_usuarios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Log Puntos: cada usuario ve los propios; admin ve todos
drop policy if exists "log_puntos_select_self" on public.log_puntos;
create policy "log_puntos_select_self"
  on public.log_puntos for select
  to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "log_puntos_mod_admin" on public.log_puntos;
create policy "log_puntos_mod_admin"
  on public.log_puntos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Condiciones Desbloqueo: lectura pública; modificación solo admin
drop policy if exists "condiciones_desbloqueo_select_all" on public.condiciones_desbloqueo;
create policy "condiciones_desbloqueo_select_all"
  on public.condiciones_desbloqueo for select
  to authenticated
  using (true);

drop policy if exists "condiciones_desbloqueo_mod_admin" on public.condiciones_desbloqueo;
create policy "condiciones_desbloqueo_mod_admin"
  on public.condiciones_desbloqueo for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
