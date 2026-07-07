-- Migration 046: Feature flags para IA

insert into public.feature_toggles (key, enabled)
values
  ('ai_quiz_generator', false),
  ('ai_summaries', false),
  ('ai_study_assistant', false)
on conflict (key) do nothing;
