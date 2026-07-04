create table public.feature_toggles (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.feature_toggles enable row level security;

create policy "feature_toggles: public read"
  on public.feature_toggles
  for select
  using (true);
