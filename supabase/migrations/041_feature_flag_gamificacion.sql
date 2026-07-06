-- Migration 041: Feature flag para gamificación
insert into public.feature_toggles (key, enabled)
values ('gamificacion', false)
on conflict (key) do nothing;
