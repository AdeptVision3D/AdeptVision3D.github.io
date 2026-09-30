-- frames.assigned_artist_id — мёртвая колонка от старой схемы: ссылалась на
-- несуществующую активно таблицу users(id), в коде нигде не читается и не
-- пишется (подтверждено grep-ом по всему репозиторию). Реальное назначение
-- художника на кадр идёт через frames.assigned_to -> profiles(id).
alter table public.frames drop column if exists assigned_artist_id;
