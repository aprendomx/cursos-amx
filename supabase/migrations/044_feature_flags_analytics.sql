-- Migration 044: Feature flags para analytics
insert into public.feature_toggles (key, enabled)
values
  ('analytics', false),
  ('risk_dashboard', false),
  ('downloadable_reports', false)
on conflict (key) do nothing;
