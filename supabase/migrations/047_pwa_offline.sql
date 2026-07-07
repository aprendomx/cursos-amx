-- Migration 047: PWA Offline — push subscriptions y feature flags

insert into public.feature_toggles (key, enabled)
values
  ('pwa_offline', false),
  ('offline_video_cache', false),
  ('offline_sync', false),
  ('push_notifications', false)
on conflict (key) do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

comment on table public.push_subscriptions is 'Suscripciones Web Push por usuario';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
