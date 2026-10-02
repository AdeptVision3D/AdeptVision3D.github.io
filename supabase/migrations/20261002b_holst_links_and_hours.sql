-- Рабочий пакет: ссылки на Holst и учёт часов.
--
-- projects.holst_url / frames.holst_url — ссылка на материалы в Holst
--   (сами файлы в системе не храним — только ссылка).
-- frames.est_hours — плановые часы на кадр (ставит руководитель),
-- frames.spent_hours — фактически потраченные (накопительно, любой, кто работает с кадром).
--
-- Права не меняем: на frames уже есть политика update для авторизованных,
-- на projects — update только для руководителей (ссылка проекта редактируется ими).
--
-- Выполнить один раз в Supabase Dashboard → SQL Editor → Run.
-- Безопасно выполнять повторно.

alter table public.projects add column if not exists holst_url text;
alter table public.frames add column if not exists holst_url text;
alter table public.frames add column if not exists est_hours numeric(6,1);
alter table public.frames add column if not exists spent_hours numeric(6,1) not null default 0;

alter table public.frames drop constraint if exists frames_hours_nonneg;
alter table public.frames add constraint frames_hours_nonneg
  check ((est_hours is null or est_hours >= 0) and spent_hours >= 0);