-- Единая форма создания/редактирования проекта (вместо серии prompt()) —
-- добавляем "Заказчик" и свободную "Заметку" как общие поля проекта.
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists notes text;
