-- Migration 036: feature flags para Fase 1
insert into public.feature_toggles (key, enabled)
values
  ('advanced_quizzes', false),
  ('rubrics', false),
  ('bulk_user_import', false),
  ('cohorts', false)
on conflict (key) do nothing;
