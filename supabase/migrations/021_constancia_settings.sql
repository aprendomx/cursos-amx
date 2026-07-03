-- =========================================================
-- Migration 021: constancia_settings (titular + cargo configurables)
-- =========================================================
-- Tabla key-value de una sola fila (id boolean=true) que guarda los
-- datos del firmante de la constancia editables desde el admin.
-- Lectura pública (la constancia se renderiza al alumno con estos
-- valores); escritura solo admins.
-- =========================================================

create table if not exists public.constancia_settings (
  id              boolean primary key default true check (id = true),
  titular_nombre  text not null default 'Nombre Completo Del Titular',
  titular_cargo   text not null default 'Comisionado Nacional contra las Adicciones',
  lugar           text not null default 'Ciudad de México',
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);

-- Seed: garantiza que siempre exista la única fila.
insert into public.constancia_settings (id)
values (true)
on conflict (id) do nothing;

-- RLS
alter table public.constancia_settings enable row level security;

create policy "constancia_settings: leer" on public.constancia_settings
  for select using (true);

create policy "constancia_settings: admin update" on public.constancia_settings
  for update
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Touch automático del timestamp
create or replace function public.constancia_settings_touch() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  return new;
end $$;

drop trigger if exists constancia_settings_touch on public.constancia_settings;
create trigger constancia_settings_touch
  before update on public.constancia_settings
  for each row execute function public.constancia_settings_touch();
