-- ==========================================================
-- Migration 017: propagar duracion_seg del video a la leccion
-- al marcar el video como 'ready'.
-- ==========================================================

create or replace function public.propagate_video_duracion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo al transicionar a 'ready' con duracion_seg conocido.
  if new.status = 'ready'
     and new.duracion_seg is not null
     and new.duracion_seg > 0
     and new.leccion_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'ready'
          or old.duracion_seg is distinct from new.duracion_seg) then
    update public.lecciones
      set duracion_seg = new.duracion_seg
      where id = new.leccion_id;
  end if;
  return new;
end $$;

drop trigger if exists videos_propagate_duracion on public.videos;
create trigger videos_propagate_duracion
  after insert or update on public.videos
  for each row execute function public.propagate_video_duracion();

-- Back-fill: si ya hay videos en 'ready' con duracion_seg, llévalo
-- a la leccion correspondiente cuando sea más reciente.
update public.lecciones l
set duracion_seg = v.duracion_seg
from public.videos v
where v.leccion_id = l.id
  and v.status = 'ready'
  and v.duracion_seg is not null
  and v.duracion_seg > 0
  and (l.duracion_seg is null or l.duracion_seg = 0 or l.duracion_seg <> v.duracion_seg);
