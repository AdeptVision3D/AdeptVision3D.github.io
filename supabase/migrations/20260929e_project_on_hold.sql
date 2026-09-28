-- "Стоп от заказчика" — проект временно приостановлен по вине/просьбе клиента,
-- это НЕ то же самое, что "завершён". Переключать могут только ceo/art_director
-- (или is_admin) — тот же круг, кто может завершать проект.
alter table public.projects add column if not exists on_hold boolean not null default false;
