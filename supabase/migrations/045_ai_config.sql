-- Migration 045: Configuración y caché de IA

create table if not exists public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  content_type text not null check (content_type in ('text', 'video')),
  summary_text text not null,
  model_used text,
  tokens_used int,
  created_at timestamptz not null default now(),
  unique (leccion_id, content_type)
);

comment on table public.ai_summaries is 'Caché de resúmenes de lecciones generados por IA';

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('quiz', 'summary', 'chat')),
  tokens_input int not null default 0,
  tokens_output int not null default 0,
  cost_usd decimal(10,6) not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_logs is 'Log de uso de IA para tracking de costos';

create table if not exists public.ai_config (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'claude')) default 'openai',
  model text not null default 'gpt-4o-mini',
  api_key_encrypted text, -- en producción usar vault o encrypt
  max_tokens_per_day int not null default 100000,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_config is 'Configuración global de IA';

-- Insertar config por defecto
insert into public.ai_config (provider, model, max_tokens_per_day)
values ('openai', 'gpt-4o-mini', 100000)
on conflict do nothing;

-- RLS
alter table public.ai_summaries enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_config enable row level security;

create policy "ai_summaries_select_all"
  on public.ai_summaries for select to authenticated using (true);

create policy "ai_usage_logs_select_admin"
  on public.ai_usage_logs for select to authenticated
  using (public.is_admin());

create policy "ai_config_select_all"
  on public.ai_config for select to authenticated using (true);

create policy "ai_config_mod_admin"
  on public.ai_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
