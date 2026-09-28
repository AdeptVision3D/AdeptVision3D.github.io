-- "Сдача в срок" по кадрам: у каждого кадра может быть свой срок сдачи
-- (если не задан — используем дедлайн проекта, это решается на клиенте).
-- completed_at фиксирует момент реального перехода кадра в статус "done",
-- чтобы потом сравнить факт с планом (сдали в срок / с опозданием).
alter table public.frames add column if not exists due_date date;
alter table public.frames add column if not exists completed_at timestamptz;

-- Расширяем лог активности до уровня проекта (не только кадра) — чтобы
-- события вроде "проект поставлен в стоп" или "изменена команда проекта"
-- тоже попадали в журнал. frame_id остаётся обязательным для записей по
-- конкретному кадру, но теперь допускает NULL для записей уровня проекта.
alter table public.frame_activity_log add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.frame_activity_log alter column frame_id drop not null;
